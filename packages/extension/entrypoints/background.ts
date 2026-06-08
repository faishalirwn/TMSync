import {
  corrections,
  enabledOrigins,
  notes,
  ratings,
  remoteRatings,
  resolutionCache,
  tabSessions,
} from "@/lib/storage";
import { connect, disconnect, getRedirectUri, isConnected } from "@/lib/trakt/auth";
import {
  TraktNotConnectedError,
  commentItem,
  deleteComment,
  getRemoteRating,
  postComment,
  rate,
  resolve,
  scrobble,
  search,
  updateComment,
} from "@/lib/trakt/client";
import {
  buildRatingBody,
  buildScrobbleBody,
  resolutionCacheKey,
  reviewKey,
} from "@/lib/trakt/util";
import { onMessage, sendMessage } from "@/messaging";
import { browser } from "wxt/browser";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const siteId = (origin: string) => `tmsync-${origin.replace(/[^a-z0-9]/gi, "-")}`;
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * MV3 service worker. STATELESS (constraint #4): every handler reads from
 * storage; no session state, timers, or buffers held here.
 */
const OWNER_TTL_MS = 5 * 60 * 1000;

export default defineBackground(() => {
  // Dynamic content-script registrations are cleared on extension reload/update
  // (not browser restart). Re-establish them from the enabled-origins list so a
  // plain "reload the extension" is enough and survives updates.
  void reconcileRegistrations();

  onMessage("ping", () => "pong" as const);

  onMessage("getTraktStatus", async () => ({
    connected: await isConnected(),
    redirectUri: getRedirectUri(),
  }));

  onMessage("connectTrakt", async () => {
    try {
      await connect();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  });

  onMessage("disconnectTrakt", () => disconnect());

  // A frame reports a video event; resolve identity (cached) and scrobble.
  onMessage("scrobble", async ({ data, sender }) => {
    // Only one frame scrobbles per tab (page + player iframe would otherwise
    // both fire start/pause/stop for the same item → Trakt rejects out-of-order).
    const tabId = sender.tab?.id;
    const frameId = sender.frameId ?? 0;
    if (tabId !== undefined && !(await claimScrobbleOwner(tabId, frameId, data.action))) {
      return { ok: true, resolved: true }; // another frame owns this tab's scrobble
    }
    try {
      const identity = await resolve(data.media);
      if (!identity) return { ok: false, resolved: false, reason: "unresolved" as const };
      const body = buildScrobbleBody(identity, data.media, data.progress);
      if (!body) return { ok: false, resolved: true, reason: "no_episode" as const };
      // Trakt rejects a pause under 1% ("progress should be at least 1.0% to
      // pause"). Pausing that early has nothing meaningful to save — skip it.
      if (data.action === "pause" && body.progress < 1) {
        return {
          ok: true,
          resolved: true,
          resolvedTitle: identity.title,
          resolvedYear: identity.year,
        };
      }
      const outcome = await scrobble(data.action, body);
      return {
        ok: outcome.ok,
        status: outcome.status,
        action: outcome.action,
        resolved: true,
        reason: outcome.ok ? undefined : ("http" as const),
        resolvedTitle: identity.title,
        resolvedYear: identity.year,
        httpError: outcome.error,
      };
    } catch (e) {
      return {
        ok: false,
        resolved: false,
        reason:
          e instanceof TraktNotConnectedError ? ("not_connected" as const) : ("http" as const),
      };
    }
  });

  // Pre-resolution for the badge: resolve identity (cached) without scrobbling so
  // the user sees the matched Trakt title before play. Works unauthenticated
  // (search needs only the api key), so transparency holds even pre-connect.
  onMessage("resolveMedia", async ({ data }) => {
    try {
      const identity = await resolve(data);
      if (!identity) return { resolved: false };
      return {
        resolved: true,
        title: identity.title,
        year: identity.year,
        mediaType: identity.mediaType,
      };
    } catch {
      return { resolved: false };
    }
  });

  onMessage("registerSite", ({ data }) => registerSite(data));
  onMessage("unregisterSite", ({ data }) => unregisterSite(data));
  onMessage("listEnabledSites", () => enabledOrigins.getValue());

  // --- corrections ---
  onMessage("searchTrakt", async ({ data }) => {
    try {
      return await search(data.query, data.type);
    } catch {
      return [];
    }
  });

  onMessage("saveCorrection", async ({ data, sender }) => {
    const key = resolutionCacheKey(data.media);
    const corr = await corrections.getValue();
    corr[key] = data.identity;
    await corrections.setValue(corr);
    // Drop any stale auto-resolution so the correction takes effect.
    const cache = await resolutionCache.getValue();
    if (cache[key]) {
      delete cache[key];
      await resolutionCache.setValue(cache);
    }
    // Re-resolve the current session in the tab (replaces the wrong scrobble).
    const tabId = sender.tab?.id;
    if (tabId !== undefined) void sendMessage("recheck", undefined, tabId);
  });

  // --- ratings & notes ---
  onMessage("getReview", async ({ data }) => {
    try {
      const identity = await resolve(data.media);
      if (!identity) return { rating: null, note: null };
      const key = reviewKey(identity, data.level, data.media.season, data.media.episode);
      const localRating = (await ratings.getValue())[key] ?? null;
      // Prefer a recent local action; otherwise sync the rating from Trakt so
      // ratings set on the website show up too. Mirror the remote value locally.
      let rating = localRating;
      if (localRating === null) {
        try {
          const remote = await getRemoteRating(
            identity,
            data.level,
            data.media.season,
            data.media.episode,
          );
          if (remote !== null) {
            rating = remote;
            const all = await ratings.getValue();
            all[key] = remote;
            await ratings.setValue(all);
          }
        } catch {
          // not connected / network — fall back to local (null)
        }
      }
      const stored = (await notes.getValue())[key];
      return { rating, note: stored ? { text: stored.text, spoiler: stored.spoiler } : null };
    } catch {
      return { rating: null, note: null };
    }
  });

  onMessage("rateItem", async ({ data }) => {
    try {
      const identity = await resolve(data.media);
      if (!identity) return { ok: false, error: "not found on Trakt" };
      const body = buildRatingBody(
        identity,
        data.level,
        data.media.season,
        data.media.episode,
        data.rating,
      );
      if (!body) return { ok: false, error: "missing season/episode" };
      const out = await rate(body);
      if (!out.ok) return { ok: false, error: out.error ?? `failed (${out.status})` };
      const key = reviewKey(identity, data.level, data.media.season, data.media.episode);
      const all = await ratings.getValue();
      all[key] = data.rating;
      await ratings.setValue(all);
      await remoteRatings.setValue({}); // invalidate the sync cache
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  });

  onMessage("unrateItem", async ({ data }) => {
    try {
      const identity = await resolve(data.media);
      if (!identity) return { ok: false, error: "not found on Trakt" };
      const body = buildRatingBody(identity, data.level, data.media.season, data.media.episode);
      if (!body) return { ok: false, error: "missing season/episode" };
      const out = await rate(body, true);
      if (!out.ok) return { ok: false, error: out.error ?? `failed (${out.status})` };
      const key = reviewKey(identity, data.level, data.media.season, data.media.episode);
      const all = await ratings.getValue();
      delete all[key];
      await ratings.setValue(all);
      await remoteRatings.setValue({}); // invalidate the sync cache
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  });

  onMessage("saveNote", async ({ data }) => {
    try {
      const text = data.text.trim();
      if (wordCount(text) < 5)
        return { ok: false, error: "Trakt needs a note of at least 5 words" };
      const identity = await resolve(data.media);
      if (!identity) return { ok: false, error: "not found on Trakt" };
      const key = reviewKey(identity, data.level, data.media.season, data.media.episode);
      const all = await notes.getValue();
      const existing = all[key];
      if (existing) {
        const out = await updateComment(existing.commentId, text, data.spoiler);
        if (!out.ok) return { ok: false, error: out.error };
        all[key] = { ...existing, text, spoiler: data.spoiler };
      } else {
        const ref = await commentItem(identity, data.level, data.media.season, data.media.episode);
        if ("error" in ref) return { ok: false, error: ref.error };
        const out = await postComment(ref.item, text, data.spoiler);
        if (!out.ok || out.id === undefined)
          return { ok: false, error: out.error ?? "comment failed" };
        all[key] = { commentId: out.id, text, spoiler: data.spoiler };
      }
      await notes.setValue(all);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  });

  onMessage("deleteNote", async ({ data }) => {
    try {
      const identity = await resolve(data.media);
      if (!identity) return { ok: false, error: "not found on Trakt" };
      const key = reviewKey(identity, data.level, data.media.season, data.media.episode);
      const all = await notes.getValue();
      const existing = all[key];
      if (!existing) return { ok: true };
      const out = await deleteComment(existing.commentId);
      if (!out.ok) return { ok: false, error: out.error };
      delete all[key];
      await notes.setValue(all);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errMsg(e) };
    }
  });

  // --- per-tab session coordination ---
  onMessage("publishMedia", async ({ data, sender }) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    const all = await tabSessions.getValue();
    all[tabId] = {
      media: data.media,
      videoSelector: data.videoSelector,
      frame: data.frame,
      watchedThreshold: data.watchedThreshold,
      progress: all[tabId]?.progress ?? 0,
      updatedAt: Date.now(),
    };
    await tabSessions.setValue(all);
  });

  onMessage("getTabMedia", async ({ sender }) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return null;
    const session = (await tabSessions.getValue())[tabId];
    return session
      ? {
          media: session.media,
          videoSelector: session.videoSelector,
          frame: session.frame,
          watchedThreshold: session.watchedThreshold,
        }
      : null;
  });

  onMessage("updateProgress", async ({ data, sender }) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    const all = await tabSessions.getValue();
    const session = all[tabId];
    if (!session) return;
    all[tabId] = { ...session, progress: data, updatedAt: Date.now() };
    await tabSessions.setValue(all);
  });

  onMessage("endSession", async ({ sender }) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    await clearTabSession(tabId);
  });

  // Playing frame → relay to the top frame's badge.
  onMessage("reportScrobble", ({ data, sender }) => {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) void sendMessage("scrobbleStatus", data, { tabId, frameId: 0 });
  });

  // Reconcile a stop if a tab dies before a clean one (point: lost stops).
  browser.tabs.onRemoved.addListener(async (tabId) => {
    const all = await tabSessions.getValue();
    const session = all[tabId];
    if (!session) return;
    await clearTabSession(tabId);
    if (session.progress <= 0) return;
    try {
      const identity = await resolve(session.media);
      if (!identity) return;
      const body = buildScrobbleBody(identity, session.media, session.progress);
      if (body) await scrobble("stop", body);
    } catch {
      // not connected / network — nothing to reconcile
    }
  });
});

async function clearTabSession(tabId: number): Promise<void> {
  const all = await tabSessions.getValue();
  if (all[tabId]) {
    delete all[tabId];
    await tabSessions.setValue(all);
  }
}

/**
 * Decide whether the calling frame may scrobble this tab. The first frame to
 * `start` (or any frame if the current owner went stale) claims ownership;
 * non-owners are turned away until a `stop` releases it.
 */
async function claimScrobbleOwner(
  tabId: number,
  frameId: number,
  action: "start" | "pause" | "stop",
): Promise<boolean> {
  const all = await tabSessions.getValue();
  const session = all[tabId];
  const owner = session?.ownerFrameId;
  const stale = !session || Date.now() - session.updatedAt > OWNER_TTL_MS;

  const isOwner = owner === frameId || owner === undefined || stale;
  if (!isOwner) return false;

  if (session) {
    session.ownerFrameId = action === "stop" ? undefined : frameId;
    session.updatedAt = Date.now();
    await tabSessions.setValue(all);
  }
  return true;
}

/** Re-register content scripts for every enabled origin (idempotent). */
async function reconcileRegistrations(): Promise<void> {
  try {
    const origins = await enabledOrigins.getValue();
    if (origins.length === 0) return;
    const registered = new Set(
      (await browser.scripting.getRegisteredContentScripts()).map((s) => s.id),
    );
    for (const origin of origins) {
      if (!registered.has(siteId(origin))) await registerScript(origin);
    }
  } catch {
    // best effort — a missing host permission just means that site stays off
  }
}

async function registerScript(origin: string): Promise<void> {
  await browser.scripting.registerContentScripts([
    {
      id: siteId(origin),
      matches: [`${origin}/*`],
      js: ["content-scripts/content.js"],
      runAt: "document_idle",
      allFrames: true,
      persistAcrossSessions: true,
    },
  ]);
}

/**
 * Register the runtime content script for a single origin. The popup must have
 * already obtained the host permission via a user gesture. `persistAcrossSessions`
 * keeps the registration across browser restarts, so we don't re-register.
 */
async function registerSite(origin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const id = siteId(origin);
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
    if (existing.length === 0) await registerScript(origin);
    const list = await enabledOrigins.getValue();
    if (!list.includes(origin)) await enabledOrigins.setValue([...list, origin]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMsg(e) };
  }
}

async function unregisterSite(origin: string): Promise<{ ok: boolean }> {
  const id = siteId(origin);
  try {
    await browser.scripting.unregisterContentScripts({ ids: [id] });
  } catch {
    // not registered — ignore
  }
  const list = await enabledOrigins.getValue();
  await enabledOrigins.setValue(list.filter((o) => o !== origin));
  return { ok: true };
}
