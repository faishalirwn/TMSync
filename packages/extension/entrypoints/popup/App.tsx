import { type TraktStatus, sendMessage } from "@/messaging";
import { useEffect, useState } from "preact/hooks";
import { browser } from "wxt/browser";

async function activeTabOrigin(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    const url = new URL(tab.url);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function activeTabId(): Promise<number | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

/**
 * The top origin plus every http(s) iframe origin on the page — the player is
 * often in a cross-origin iframe, and the content script needs to run there too.
 * Runs in the top frame under `activeTab` (reads iframe src attributes only).
 */
async function collectOrigins(tabId: number): Promise<string[]> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        const set = new Set<string>([location.origin]);
        for (const frame of Array.from(document.querySelectorAll("iframe"))) {
          try {
            const u = new URL((frame as HTMLIFrameElement).src, location.href);
            if (u.protocol === "http:" || u.protocol === "https:") set.add(u.origin);
          } catch {
            // ignore unparseable/empty iframe src
          }
        }
        return Array.from(set);
      },
    });
    const out = results[0]?.result;
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
}

export function App() {
  const [status, setStatus] = useState<TraktStatus | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    const [s, o, sites] = await Promise.all([
      sendMessage("getTraktStatus", undefined),
      activeTabOrigin(),
      sendMessage("listEnabledSites", undefined),
    ]);
    setStatus(s);
    setOrigin(o);
    setEnabled(sites);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the popup opens
  useEffect(() => {
    void refresh();
  }, []);

  const connect = async () => {
    setBusy(true);
    setNote(null);
    const res = await sendMessage("connectTrakt", undefined);
    if (!res.ok) setNote(res.error ?? "Connection failed");
    await refresh();
    setBusy(false);
  };

  const disconnect = async () => {
    setBusy(true);
    await sendMessage("disconnectTrakt", undefined);
    await refresh();
    setBusy(false);
  };

  // Grant + register the top origin AND any cross-origin player iframe origins,
  // so the content script reaches the frame that actually owns the <video>.
  const grantAndRegister = async (tabId: number): Promise<string[] | null> => {
    const origins = await collectOrigins(tabId);
    if (origins.length === 0) return null;
    // permissions.request must run in the user-gesture (popup click) context.
    const granted = await browser.permissions.request({ origins: origins.map((o) => `${o}/*`) });
    if (!granted) return null;
    for (const o of origins) await sendMessage("registerSite", o);
    return origins;
  };

  const enableSite = async () => {
    if (!origin) return;
    setBusy(true);
    setNote(null);
    const tabId = await activeTabId();
    const origins = tabId !== null ? await grantAndRegister(tabId) : null;
    if (!origins) {
      setNote("Permission denied");
    } else {
      const extra = origins.length - 1;
      setNote(
        `Enabled${extra > 0 ? ` (+${extra} player frame${extra > 1 ? "s" : ""})` : ""} — reload to start scrobbling.`,
      );
    }
    await refresh();
    setBusy(false);
  };

  const disableSite = async () => {
    if (!origin) return;
    setBusy(true);
    await sendMessage("unregisterSite", origin);
    await browser.permissions.remove({ origins: [`${origin}/*`] });
    await refresh();
    setBusy(false);
  };

  // Grant + register origins, then inject the element picker into the active tab.
  const setupSite = async () => {
    if (!origin) return;
    setBusy(true);
    setNote(null);
    const tabId = await activeTabId();
    if (tabId === null) {
      setNote("No active tab");
      setBusy(false);
      return;
    }
    const origins = await grantAndRegister(tabId);
    if (!origins) {
      setNote("Permission denied");
      setBusy(false);
      return;
    }
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["/content-scripts/picker.js"],
    });
    window.close(); // get out of the way so the picker is visible
  };

  const connected = status?.connected ?? false;
  const siteEnabled = origin !== null && enabled.includes(origin);

  return (
    <main class="tmsync">
      <h1>TMSync</h1>

      <section>
        <h2>Trakt</h2>
        {connected ? (
          <div class="row">
            <span class="ok">Connected</span>
            <button type="button" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        ) : (
          <div class="row">
            <span class="muted">Not connected</span>
            <button type="button" onClick={connect} disabled={busy}>
              Connect Trakt
            </button>
          </div>
        )}
        {!connected && status?.redirectUri && (
          <p class="hint">
            Register this redirect URI in your Trakt app:
            <code>{status.redirectUri}</code>
          </p>
        )}
      </section>

      <section>
        <h2>This site</h2>
        {origin ? (
          <>
            <div class="row">
              <code>{origin}</code>
              {siteEnabled ? (
                <button type="button" onClick={disableSite} disabled={busy}>
                  Disable
                </button>
              ) : (
                <button type="button" onClick={enableSite} disabled={busy}>
                  Enable scrobbling
                </button>
              )}
            </div>
            <p class="hint">
              No match on this site?{" "}
              <button type="button" class="link" onClick={setupSite} disabled={busy}>
                Set it up with the picker
              </button>
            </p>
          </>
        ) : (
          <p class="muted">No eligible page in the active tab.</p>
        )}
      </section>

      {note && <p class="note">{note}</p>}
    </main>
  );
}
