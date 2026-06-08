import { enabledOrigins, tabSessions } from "@/lib/storage";
import { connect, disconnect, getRedirectUri, isConnected } from "@/lib/trakt/auth";
import { TraktNotConnectedError, resolve, scrobble } from "@/lib/trakt/client";
import { buildScrobbleBody } from "@/lib/trakt/util";
import { onMessage, sendMessage } from "@/messaging";
import { browser } from "wxt/browser";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const siteId = (origin: string) => `tmsync-${origin.replace(/[^a-z0-9]/gi, "-")}`;

/**
 * MV3 service worker. STATELESS (constraint #4): every handler reads from
 * storage; no session state, timers, or buffers held here.
 */
export default defineBackground(() => {
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
  onMessage("scrobble", async ({ data }) => {
    try {
      const identity = await resolve(data.media);
      if (!identity) return { ok: false, resolved: false, reason: "unresolved" as const };
      const body = buildScrobbleBody(identity, data.media, data.progress);
      if (!body) return { ok: false, resolved: true, reason: "no_episode" as const };
      const outcome = await scrobble(data.action, body);
      return {
        ok: outcome.ok,
        status: outcome.status,
        action: outcome.action,
        resolved: true,
        reason: outcome.ok ? undefined : ("http" as const),
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

  onMessage("registerSite", ({ data }) => registerSite(data));
  onMessage("unregisterSite", ({ data }) => unregisterSite(data));
  onMessage("listEnabledSites", () => enabledOrigins.getValue());

  // --- per-tab session coordination ---
  onMessage("publishMedia", async ({ data, sender }) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    const all = await tabSessions.getValue();
    all[tabId] = {
      media: data.media,
      videoSelector: data.videoSelector,
      frame: data.frame,
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
      ? { media: session.media, videoSelector: session.videoSelector, frame: session.frame }
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
 * Register the runtime content script for a single origin. The popup must have
 * already obtained the host permission via a user gesture. `persistAcrossSessions`
 * keeps the registration across browser restarts, so we don't re-register.
 */
async function registerSite(origin: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const id = siteId(origin);
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
    if (existing.length === 0) {
      await browser.scripting.registerContentScripts([
        {
          id,
          matches: [`${origin}/*`],
          js: ["content-scripts/content.js"],
          runAt: "document_idle",
          allFrames: true,
          persistAcrossSessions: true,
        },
      ]);
    }
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
