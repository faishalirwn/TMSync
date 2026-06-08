import { corrections, customRecipes } from "@/lib/storage";
import type { ResolvedIdentity } from "@/lib/trakt/types";
import { type TraktStatus, sendMessage } from "@/messaging";
import type { Recipe, RecipeLinks } from "@tmsync/shared";
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

/** Editor for one recipe's quick-link URL templates (the trakt.tv deep links). */
function LinkEditor({
  recipe,
  onSave,
}: {
  recipe: Recipe;
  onSave: (id: string, links: RecipeLinks) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [movie, setMovie] = useState(recipe.links?.movie ?? "");
  const [tv, setTv] = useState(recipe.links?.tv ?? "");
  const [search, setSearch] = useState(recipe.links?.search ?? "");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    const links: RecipeLinks = {};
    if (movie.trim()) links.movie = movie.trim();
    if (tv.trim()) links.tv = tv.trim();
    if (search.trim()) links.search = search.trim();
    await onSave(recipe.id, links);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const has = !!(recipe.links?.movie || recipe.links?.tv || recipe.links?.search);

  return (
    <div class="links">
      <button type="button" class="link" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide quick links" : has ? "Edit quick links ✓" : "Add quick links"}
      </button>
      {open && (
        <div class="linkform">
          <p class="hint">
            URLs Trakt pages link to. Placeholders: <code>{"{tmdb}"}</code> <code>{"{imdb}"}</code>{" "}
            <code>{"{season}"}</code> <code>{"{episode}"}</code> <code>{"{title}"}</code>.
          </p>
          <label>
            Movie
            <input
              value={movie}
              onInput={(e) => setMovie((e.target as HTMLInputElement).value)}
              placeholder="https://site/movie/{tmdb}"
            />
          </label>
          <label>
            TV (show→S1E1, season→S{"{n}"}E1, episode→S{"{n}"}E{"{m}"})
            <input
              value={tv}
              onInput={(e) => setTv((e.target as HTMLInputElement).value)}
              placeholder="https://site/tv/{tmdb}/{season}/{episode}"
            />
          </label>
          <label>
            Search fallback
            <input
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              placeholder="https://site/search/{title}"
            />
          </label>
          <button type="button" onClick={save}>
            {saved ? "Saved" : "Save quick links"}
          </button>
        </div>
      )}
    </div>
  );
}

function CustomRecipes({
  recipes,
  onDelete,
  onSaveLinks,
}: {
  recipes: Recipe[];
  onDelete: (id: string) => void;
  onSaveLinks: (id: string, links: RecipeLinks) => Promise<void>;
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
            <LinkEditor recipe={r} onSave={onSaveLinks} />
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
        <p class="hint">
          Quick links add “watch on this site” buttons to Trakt movie/show pages. Copy a recipe’s
          JSON to contribute it back via a pull request.
        </p>
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

  const saveLinks = async (id: string, links: RecipeLinks) => {
    const hasAny = !!(links.movie || links.tv || links.search);
    const next = (await customRecipes.getValue()).map((r) =>
      r.id === id ? { ...r, links: hasAny ? links : undefined } : r,
    );
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
      <CustomRecipes recipes={recipes} onDelete={deleteRecipe} onSaveLinks={saveLinks} />
      <Corrections
        entries={Object.entries(corr)}
        busy={busy}
        onDelete={deleteCorrection}
        onClear={clearCorrections}
      />
    </main>
  );
}
