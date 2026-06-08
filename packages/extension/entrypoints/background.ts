import { enabledOrigins } from "@/lib/storage";
import { connect, disconnect, getRedirectUri, isConnected } from "@/lib/trakt/auth";
import { resolve, scrobble } from "@/lib/trakt/client";
import { buildScrobbleBody } from "@/lib/trakt/util";
import { onMessage } from "@/messaging";
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

  // Content script reports a video event; resolve identity (cached) and scrobble.
  onMessage("scrobble", async ({ data }) => {
    try {
      const identity = await resolve(data.media);
      if (!identity) return { ok: false, resolved: false };
      const body = buildScrobbleBody(identity, data.media, data.progress);
      if (!body) return { ok: false, resolved: true };
      const outcome = await scrobble(data.action, body);
      return { ok: outcome.ok, status: outcome.status, resolved: true };
    } catch {
      // Not connected to Trakt, or a network error — fail quietly (constraint:
      // a failed scrape/scrobble never throws into the host page).
      return { ok: false, resolved: false };
    }
  });

  onMessage("registerSite", ({ data }) => registerSite(data));
  onMessage("unregisterSite", ({ data }) => unregisterSite(data));
  onMessage("listEnabledSites", () => enabledOrigins.getValue());
});

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
