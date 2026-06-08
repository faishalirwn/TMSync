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
  const [topOrigin, setTopOrigin] = useState<string | null>(null);
  const [origins, setOrigins] = useState<string[]>([]); // top + every iframe origin on the page
  const [enabled, setEnabled] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    const tabId = await activeTabId();
    const [s, o, found, sites] = await Promise.all([
      sendMessage("getTraktStatus", undefined),
      activeTabOrigin(),
      tabId !== null ? collectOrigins(tabId) : Promise.resolve<string[]>([]),
      sendMessage("listEnabledSites", undefined),
    ]);
    setStatus(s);
    setTopOrigin(o);
    setOrigins(found);
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

  const enableOrigin = async (origin: string) => {
    setBusy(true);
    setNote(null);
    // permissions.request must run in the user-gesture (popup click) context.
    const granted = await browser.permissions.request({ origins: [`${origin}/*`] });
    if (granted) {
      const res = await sendMessage("registerSite", origin);
      setNote(res.ok ? "Enabled — reload the page to start." : (res.error ?? "Failed"));
    } else {
      setNote("Permission denied");
    }
    await refresh();
    setBusy(false);
  };

  const disableOrigin = async (origin: string) => {
    setBusy(true);
    await sendMessage("unregisterSite", origin);
    await browser.permissions.remove({ origins: [`${origin}/*`] });
    await refresh();
    setBusy(false);
  };

  // Grant + register the top origin, then inject the element picker.
  const setupSite = async () => {
    if (!topOrigin) return;
    setBusy(true);
    setNote(null);
    const tabId = await activeTabId();
    if (tabId === null) {
      setNote("No active tab");
      setBusy(false);
      return;
    }
    const granted = await browser.permissions.request({ origins: [`${topOrigin}/*`] });
    if (!granted) {
      setNote("Permission denied");
      setBusy(false);
      return;
    }
    await sendMessage("registerSite", topOrigin);
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["/content-scripts/picker.js"],
    });
    window.close(); // get out of the way so the picker is visible
  };

  const connected = status?.connected ?? false;

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
        <h2>Sites &amp; player frames</h2>
        {origins.length === 0 ? (
          <p class="muted">No eligible page in the active tab.</p>
        ) : (
          <>
            {origins.map((origin) => {
              const isEnabled = enabled.includes(origin);
              const isTop = origin === topOrigin;
              return (
                <div class="row" key={origin}>
                  <code title={origin}>
                    {origin.replace(/^https?:\/\//, "")}
                    {!isTop && <span class="muted"> · frame</span>}
                  </code>
                  {isEnabled ? (
                    <button type="button" onClick={() => disableOrigin(origin)} disabled={busy}>
                      Disable
                    </button>
                  ) : (
                    <button type="button" onClick={() => enableOrigin(origin)} disabled={busy}>
                      Enable
                    </button>
                  )}
                </div>
              );
            })}
            <p class="hint">
              No recipe yet for this page?{" "}
              <button type="button" class="link" onClick={setupSite} disabled={busy}>
                Set it up with the picker
              </button>
              <br />
              Player in another site (e.g. a player iframe)? Press play first so it loads, then
              reopen this popup and Enable it here.
            </p>
          </>
        )}
      </section>

      {note && <p class="note">{note}</p>}
    </main>
  );
}
