import { customRecipes } from "@/lib/storage";
import { sendMessage } from "@/messaging";
import { finder } from "@medv/finder";
import { type EngineContext, type Field, readField } from "@tmsync/shared";
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  type DraftFieldKey,
  type RecipeDraft,
  autoDetectFields,
  buildRecipe,
  emptyDraft,
  previewDraft,
  suggestLinkTemplate,
  urlTokenRegex,
} from "./recipe-builder";

type LinkKey = "movie" | "tv" | "search";

const LINK_PLACEHOLDER: Record<LinkKey, string> = {
  movie: "https://site/movie/{tmdb}",
  tv: "https://site/tv/{tmdb}/{season}/{episode}",
  search: "https://site/search/{title}",
};

const HOST_TAG = "tmsync-picker";
const FIELD_LABELS: Record<DraftFieldKey, string> = {
  title: "Title",
  year: "Year",
  season: "Season",
  episode: "Episode",
};

function safeFinder(el: Element): string | undefined {
  try {
    return finder(el);
  } catch {
    return undefined;
  }
}

/** Is the event targeting our own picker UI (vs. a page element)? */
function inOurUi(e: Event): boolean {
  return e
    .composedPath()
    .some((n) => n instanceof HTMLElement && n.tagName.toLowerCase() === HOST_TAG);
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type UrlPart = { text: string } | { num: string; ordinal: number };

/** Split the current href into text + clickable numeric chips (in order). */
function urlChips(): UrlPart[] {
  const href = location.href;
  const parts: UrlPart[] = [];
  let last = 0;
  let ordinal = 0;
  for (const m of href.matchAll(/\d+/g)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ text: href.slice(last, idx) });
    parts.push({ num: m[0], ordinal: ordinal++ });
    last = idx + m[0].length;
  }
  if (last < href.length) parts.push({ text: href.slice(last) });
  return parts;
}

export function PickerApp({ onClose }: { onClose: () => void }) {
  const ctx: EngineContext = useMemo(() => ({ document, url: location.href }), []);
  const parts = useMemo(urlChips, []);

  const [draft, setDraft] = useState<RecipeDraft>(() => {
    const base = emptyDraft(ctx.url);
    base.fields = autoDetectFields(ctx);
    // Intentionally NO domFingerprint / video selector from the page video: the
    // movie page often autoplays a muted background trailer, which is the wrong
    // element and an unstable match key. Match by urlPattern; the player frame's
    // own <video> is found at play time.
    return base;
  });
  const [name, setName] = useState(location.hostname);
  const [picking, setPicking] = useState<DraftFieldKey | null>(null);
  const [highlight, setHighlight] = useState<Rect | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showLinks, setShowLinks] = useState(false);

  // Element-picking mode: highlight on hover, capture the next page click.
  useEffect(() => {
    if (!picking) return;
    const onMove = (e: MouseEvent) => {
      if (inOurUi(e)) return setHighlight(null);
      const el = e.target as Element | null;
      if (!el?.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      setHighlight({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    const onClick = (e: MouseEvent) => {
      if (inOurUi(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target as Element | null;
      if (el) selectField(picking, el);
      setPicking(null);
      setHighlight(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPicking(null);
        setHighlight(null);
      }
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [picking]);

  function selectField(field: DraftFieldKey, el: Element) {
    const selector = safeFinder(el);
    if (!selector) {
      setStatus("Couldn't build a selector for that element.");
      return;
    }
    const transforms: Field["transforms"] =
      field === "title" ? ["trim", "collapseSpaces"] : ["trim", "toInt"];
    setDraft((d) => ({
      ...d,
      fields: { ...d.fields, [field]: { source: "dom", selector, transforms } },
    }));
    setStatus(null);
  }

  /** Use the Nth number in the URL for this field (reliable for season/episode). */
  function selectUrlToken(field: DraftFieldKey, ordinal: number) {
    const regex = urlTokenRegex(ordinal);
    setDraft((d) => ({
      ...d,
      fields: { ...d.fields, [field]: { source: "url", regex, group: 1, transforms: ["toInt"] } },
    }));
    setPicking(null);
    setHighlight(null);
    setStatus(null);
  }

  function clearField(field: DraftFieldKey) {
    setDraft((d) => {
      const fields = { ...d.fields };
      delete fields[field];
      return { ...d, fields };
    });
  }

  function setLink(key: LinkKey, value: string) {
    setDraft((d) => ({ ...d, links: { ...d.links, [key]: value } }));
  }

  /**
   * Pre-fill movie/tv from this page's URL, swapping the scraped season/episode
   * for {season}/{episode}. The user then replaces the id segment with {tmdb}.
   */
  function suggestLinks() {
    const p = previewDraft(draft, ctx);
    const season = p.ok ? p.media.season : undefined;
    const episode = p.ok ? p.media.episode : undefined;
    const isShow = season !== undefined || episode !== undefined;
    const tmpl = suggestLinkTemplate(ctx.url, season, episode);
    setLink(isShow ? "tv" : "movie", tmpl);
    setStatus("Pre-filled from URL — replace the id with {tmdb} (or use search).");
  }

  async function save() {
    const id = `custom-${location.hostname}-${Date.now()}`;
    const built = buildRecipe(draft, { id, name });
    if (!built.ok) return setStatus(built.error);
    // Replace any prior custom recipe for the same urlPattern (re-picking a site).
    const list = (await customRecipes.getValue()).filter(
      (r) => r.match.urlPattern !== built.recipe.match.urlPattern,
    );
    await customRecipes.setValue([...list, built.recipe]);
    await sendMessage("registerSite", location.origin);
    setStatus("Saved! Reload the page to start scrobbling.");
  }

  async function copyJson() {
    const built = buildRecipe(draft, { id: `custom-${location.hostname}`, name });
    if (!built.ok) return setStatus(built.error);
    try {
      await navigator.clipboard.writeText(JSON.stringify(built.recipe, null, 2));
      setStatus("Recipe JSON copied to clipboard.");
    } catch {
      setStatus("Couldn't access the clipboard.");
    }
  }

  const preview = previewDraft(draft, ctx);

  return (
    <div class="root">
      <style>{CSS}</style>

      {highlight && (
        <div
          class="hl"
          style={{
            top: `${highlight.top}px`,
            left: `${highlight.left}px`,
            width: `${highlight.width}px`,
            height: `${highlight.height}px`,
          }}
        />
      )}

      {picking && (
        <div class="banner">
          Click the {FIELD_LABELS[picking]} on the page, or a number in the URL · Esc to cancel
        </div>
      )}

      <div class="panel">
        <header>
          <strong>TMSync · set up site</strong>
          <button type="button" class="x" onClick={onClose}>
            ✕
          </button>
        </header>

        <label class="name">
          Site name
          <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </label>

        <div class="fields">
          {(Object.keys(FIELD_LABELS) as DraftFieldKey[]).map((key) => {
            const field = draft.fields[key];
            const value = field ? readField(field, ctx) : null;
            return (
              <div class="field" key={key}>
                <span class="lbl">{FIELD_LABELS[key]}</span>
                <span class="val" title={value ?? ""}>
                  {value ?? "—"}
                  {field && <em class="src"> {field.source}</em>}
                </span>
                <button type="button" onClick={() => setPicking(key)}>
                  Pick
                </button>
                {field && (
                  <button type="button" class="clear" onClick={() => clearField(key)}>
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div class="url">
          <span class="lbl">
            From URL{picking ? ` → click a number for ${FIELD_LABELS[picking]}` : ""}
          </span>
          <div class="urlline">
            {parts.map((p, i) =>
              "num" in p ? (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional URL tokens are stable
                  key={i}
                  type="button"
                  class="chip"
                  disabled={!picking}
                  onClick={() => picking && selectUrlToken(picking, p.ordinal)}
                >
                  {p.num}
                </button>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional URL tokens are stable
                <span key={i}>{p.text}</span>
              ),
            )}
          </div>
        </div>

        <label class="type">
          Type
          <select
            value={draft.mediaType}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                mediaType: (e.target as HTMLSelectElement).value as RecipeDraft["mediaType"],
              }))
            }
          >
            <option value="auto">Auto</option>
            <option value="movie">Movie</option>
            <option value="show">Show</option>
          </select>
        </label>

        <label class="check">
          <input
            type="checkbox"
            checked={draft.video.frame === "iframe"}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                video: {
                  ...d.video,
                  frame: (e.target as HTMLInputElement).checked ? "iframe" : "auto",
                },
              }))
            }
          />
          Player loads in a separate frame (iframe)
        </label>

        <div class="links">
          <button type="button" class="linktoggle" onClick={() => setShowLinks((v) => !v)}>
            {showLinks ? "▾" : "▸"} Quick links (Trakt → this site)
          </button>
          {showLinks && (
            <div class="linkform">
              <button type="button" class="suggest" onClick={suggestLinks}>
                Suggest from this URL
              </button>
              {(["movie", "tv", "search"] as LinkKey[]).map((key) => (
                <input
                  key={key}
                  value={draft.links?.[key] ?? ""}
                  onInput={(e) => setLink(key, (e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  onKeyUp={(e) => e.stopPropagation()}
                  placeholder={LINK_PLACEHOLDER[key]}
                />
              ))}
              <span class="hint">
                Placeholders: {"{tmdb}"} {"{imdb}"} {"{season}"} {"{episode}"} {"{title}"}
              </span>
            </div>
          )}
        </div>

        <div class={`preview ${preview.ok ? "ok" : "bad"}`}>
          {preview.ok
            ? `✓ ${preview.media.mediaType}: ${preview.media.title}${
                preview.media.year ? ` (${preview.media.year})` : ""
              }${
                preview.media.season !== undefined
                  ? ` S${preview.media.season}E${preview.media.episode ?? "?"}`
                  : ""
              }`
            : `✗ ${preview.error}`}
        </div>

        <div class="actions">
          <button type="button" class="primary" onClick={save} disabled={!preview.ok}>
            Save & enable
          </button>
          <button type="button" onClick={copyJson} disabled={!preview.ok}>
            Copy JSON
          </button>
        </div>

        {status && <p class="status">{status}</p>}
      </div>
    </div>
  );
}

const CSS = `
.root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
  font: 13px/1.4 system-ui, sans-serif; color: #111; }
.hl { position: fixed; border: 2px solid #e11d48; background: rgba(225,29,72,0.12);
  pointer-events: none; border-radius: 2px; }
.banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  background: #e11d48; color: #fff; padding: 6px 12px; border-radius: 6px;
  pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
.panel { position: fixed; right: 16px; bottom: 16px; width: 300px; pointer-events: auto;
  background: #fff; border: 1px solid #d4d4d8; border-radius: 10px; padding: 12px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.25); }
.panel header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.panel .x { border: none; background: transparent; cursor: pointer; font-size: 14px; }
.panel label { display: block; font-size: 11px; opacity: 0.7; margin-bottom: 8px; }
.panel input, .panel select { display: block; width: 100%; margin-top: 2px; padding: 4px 6px;
  border: 1px solid #d4d4d8; border-radius: 6px; font: inherit; box-sizing: border-box; }
.fields { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
.field { display: grid; grid-template-columns: 58px 1fr auto auto; align-items: center; gap: 6px; }
.field .lbl { font-size: 11px; opacity: 0.7; }
.field .val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field .src { font-size: 10px; opacity: 0.5; font-style: normal; }
.field button { padding: 3px 8px; border: 1px solid #d4d4d8; border-radius: 6px;
  background: #fff; cursor: pointer; font: inherit; }
.field .clear { padding: 3px 6px; }
.preview { margin: 8px 0; padding: 6px 8px; border-radius: 6px; font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.url { margin-bottom: 8px; }
.url .lbl { display: block; font-size: 11px; opacity: 0.7; margin-bottom: 3px; }
.urlline { font-size: 11px; word-break: break-all; line-height: 1.8; color: #52525b; }
.chip { font: inherit; font-size: 11px; padding: 1px 5px; margin: 0 1px; border-radius: 4px;
  border: 1px solid #d4d4d8; background: #f4f4f5; color: #111; cursor: pointer; }
.chip:disabled { cursor: default; opacity: 0.6; }
.chip:not(:disabled):hover { background: #fde68a; border-color: #f59e0b; }
.check { display: flex; flex-direction: row; align-items: center; gap: 6px;
  font-size: 11px; opacity: 0.85; margin-bottom: 8px; cursor: pointer; }
.check input { width: auto; margin: 0; flex: none; }
.preview.ok { background: #ecfdf5; color: #047857; }
.preview.bad { background: #fef2f2; color: #b91c1c; }
.links { margin-bottom: 8px; }
.linktoggle { border: none; background: none; padding: 0; font: inherit; font-size: 11px;
  opacity: 0.8; cursor: pointer; color: #111; }
.linkform { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.linkform input { font: 11px/1.4 ui-monospace, monospace; }
.linkform .suggest { align-self: flex-start; padding: 3px 8px; border: 1px solid #d4d4d8;
  border-radius: 6px; background: #f4f4f5; cursor: pointer; font: inherit; font-size: 11px; }
.linkform .hint { font-size: 10px; opacity: 0.6; }
.actions { display: flex; gap: 8px; }
.actions button { flex: 1; padding: 6px; border: 1px solid #d4d4d8; border-radius: 6px;
  background: #fff; cursor: pointer; font: inherit; }
.actions .primary { background: #e11d48; color: #fff; border-color: #e11d48; }
.actions button:disabled { opacity: 0.5; cursor: default; }
.status { margin: 8px 0 0; font-size: 11px; opacity: 0.8; }
`;
