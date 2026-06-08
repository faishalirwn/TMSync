import { corrections, customRecipes } from "@/lib/storage";
import type { ResolvedIdentity } from "@/lib/trakt/types";
import { type TraktStatus, sendMessage } from "@/messaging";
import type { Recipe } from "@tmsync/shared";
import { useEffect, useState } from "preact/hooks";
import { browser } from "wxt/browser";

const host = (origin: string) => origin.replace(/^https?:\/\//, "");

/** Trakt connect/disconnect — mirrors the popup, lives here for a stable home. */
function TraktSection({
  status,
  busy,
  onChange,
}: {
  status: TraktStatus | null;
  busy: boolean;
  onChange: () => void | Promise<void>;
}) {
  const connected = status?.connected ?? false;
  const act = async (fn: () => Promise<unknown>) => {
    await fn();
    await onChange();
  };
  return (
    <section>
      <h2>Trakt</h2>
      <div class="row">
        <span class={connected ? "ok" : "muted"}>{connected ? "Connected" : "Not connected"}</span>
        {connected ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => sendMessage("disconnectTrakt", undefined))}
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => sendMessage("connectTrakt", undefined))}
          >
            Connect Trakt
          </button>
        )}
      </div>
      {!connected && status?.redirectUri && (
        <p class="hint">
          Register this redirect URI in your Trakt app:
          <code>{status.redirectUri}</code>
        </p>
      )}
    </section>
  );
}

function EnabledSites({
  sites,
  busy,
  onDisable,
}: {
  sites: string[];
  busy: boolean;
  onDisable: (origin: string) => void;
}) {
  return (
    <section>
      <h2>Enabled sites</h2>
      {sites.length === 0 ? (
        <p class="muted">
          No sites enabled yet. Open the TMSync popup on a streaming site to enable it.
        </p>
      ) : (
        sites.map((origin) => (
          <div class="row" key={origin}>
            <code title={origin}>{host(origin)}</code>
            <button type="button" disabled={busy} onClick={() => onDisable(origin)}>
              Disable
            </button>
          </div>
        ))
      )}
    </section>
  );
}

function CustomRecipes({
  recipes,
  onDelete,
}: {
  recipes: Recipe[];
  onDelete: (id: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (r: Recipe) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(r, null, 2));
      setCopied(r.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard blocked — ignore
    }
  };
  return (
    <section>
      <h2>Your recipes</h2>
      {recipes.length === 0 ? (
        <p class="muted">
          No custom recipes. Use “Set it up with the picker” in the popup to author one.
        </p>
      ) : (
        recipes.map((r) => (
          <div class="card" key={r.id}>
            <div class="row">
              <div class="grow">
                <strong>{r.name}</strong>
                <code class="block">{r.match.urlPattern}</code>
              </div>
            </div>
            <div class="actions">
              <button type="button" class="link" onClick={() => copy(r)}>
                {copied === r.id ? "Copied JSON" : "Copy JSON"}
              </button>
              <button type="button" class="link danger" onClick={() => onDelete(r.id)}>
                Delete
              </button>
            </div>
          </div>
        ))
      )}
      {recipes.length > 0 && (
        <p class="hint">Copy a recipe’s JSON to contribute it back via a pull request.</p>
      )}
    </section>
  );
}

function Corrections({
  entries,
  busy,
  onDelete,
  onClear,
}: {
  entries: [string, ResolvedIdentity][];
  busy: boolean;
  onDelete: (key: string) => void;
  onClear: () => void;
}) {
  return (
    <section>
      <div class="row">
        <h2>Corrections</h2>
        {entries.length > 0 && (
          <button type="button" class="link danger" disabled={busy} onClick={onClear}>
            Clear all
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p class="muted">
          No saved corrections. When a match is wrong, click the badge to pick the right title.
        </p>
      ) : (
        entries.map(([key, id]) => (
          <div class="card" key={key}>
            <div class="row">
              <div class="grow">
                <code class="block">{key}</code>
                <span>
                  → {id.title}
                  {id.year ? ` (${id.year})` : ""} · {id.mediaType}
                </span>
              </div>
              <button
                type="button"
                class="link danger"
                disabled={busy}
                onClick={() => onDelete(key)}
              >
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

export function App() {
  const [status, setStatus] = useState<TraktStatus | null>(null);
  const [sites, setSites] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [corr, setCorr] = useState<Record<string, ResolvedIdentity>>({});
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [s, sit, rec, c] = await Promise.all([
      sendMessage("getTraktStatus", undefined),
      sendMessage("listEnabledSites", undefined),
      customRecipes.getValue(),
      corrections.getValue(),
    ]);
    setStatus(s);
    setSites(sit);
    setRecipes(rec);
    setCorr(c);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on open
  useEffect(() => {
    void refresh();
  }, []);

  const disableSite = async (origin: string) => {
    setBusy(true);
    await sendMessage("unregisterSite", origin);
    await browser.permissions.remove({ origins: [`${origin}/*`] });
    await refresh();
    setBusy(false);
  };

  const deleteRecipe = async (id: string) => {
    const next = (await customRecipes.getValue()).filter((r) => r.id !== id);
    await customRecipes.setValue(next);
    setRecipes(next);
  };

  const deleteCorrection = async (key: string) => {
    setBusy(true);
    const next = { ...(await corrections.getValue()) };
    delete next[key];
    await corrections.setValue(next);
    setCorr(next);
    setBusy(false);
  };

  const clearCorrections = async () => {
    setBusy(true);
    await corrections.setValue({});
    setCorr({});
    setBusy(false);
  };

  return (
    <main class="tmsync">
      <h1>TMSync settings</h1>
      <TraktSection status={status} busy={busy} onChange={refresh} />
      <EnabledSites sites={sites} busy={busy} onDisable={disableSite} />
      <CustomRecipes recipes={recipes} onDelete={deleteRecipe} />
      <Corrections
        entries={Object.entries(corr)}
        busy={busy}
        onDelete={deleteCorrection}
        onClear={clearCorrections}
      />
    </main>
  );
}
