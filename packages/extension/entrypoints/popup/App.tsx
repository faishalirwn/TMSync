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

  const enableSite = async () => {
    if (!origin) return;
    setBusy(true);
    setNote(null);
    // permissions.request must run in the user-gesture (popup click) context.
    const granted = await browser.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      setNote("Permission denied");
      setBusy(false);
      return;
    }
    const res = await sendMessage("registerSite", origin);
    setNote(res.ok ? "Enabled — reload the page to start scrobbling." : (res.error ?? "Failed"));
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
        ) : (
          <p class="muted">No eligible page in the active tab.</p>
        )}
      </section>

      {note && <p class="note">{note}</p>}
    </main>
  );
}
