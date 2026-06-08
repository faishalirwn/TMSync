import type { TraktSearchOption } from "@/lib/trakt/types";
import { type BadgeState, type BadgeStatus, onMessage, sendMessage } from "@/messaging";
import type { ParsedMedia } from "@tmsync/shared";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";

const DOT: Record<BadgeState, string> = {
  idle: "#9ca3af",
  watching: "#16a34a",
  paused: "#d97706",
  scrobbled: "#2563eb",
  stopped: "#6b7280",
  error: "#dc2626",
};

const LABEL: Record<BadgeState, string> = {
  idle: "matched",
  watching: "scrobbling",
  paused: "paused",
  scrobbled: "added to history",
  stopped: "stopped",
  error: "error",
};

function optionLabel(o: TraktSearchOption): string {
  return `${o.title}${o.year ? ` (${o.year})` : ""} · ${o.type}`;
}

/** The "fix match" panel: search Trakt and pick the correct entry. */
function Correction({ onClose }: { onClose: () => void }) {
  const [media, setMedia] = useState<ParsedMedia | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TraktSearchOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const tab = await sendMessage("getTabMedia", undefined);
      if (tab) {
        setMedia(tab.media);
        setQuery(tab.media.title);
      }
    })();
  }, []);

  const runSearch = async () => {
    setBusy(true);
    const type =
      media && (media.season !== undefined || media.episode !== undefined)
        ? "show"
        : media?.mediaType === "show"
          ? "show"
          : media?.mediaType === "movie"
            ? "movie"
            : undefined;
    setResults(await sendMessage("searchTrakt", { query, type }));
    setBusy(false);
  };

  const pick = async (o: TraktSearchOption) => {
    if (!media) return;
    setBusy(true);
    await sendMessage("saveCorrection", {
      media,
      identity: { mediaType: o.type, traktId: o.traktId, title: o.title, year: o.year },
    });
    setSaved(optionLabel(o));
    setBusy(false);
  };

  return (
    <div class="panel">
      <div class="phead">
        <strong>Fix match</strong>
        <button type="button" class="x" onClick={onClose} aria-label="close">
          ✕
        </button>
      </div>
      {saved ? (
        <p class="saved">Corrected → {saved}. It’ll re-scrobble now.</p>
      ) : (
        <>
          <div class="search">
            <input
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search Trakt…"
            />
            <button type="button" onClick={runSearch} disabled={busy}>
              Search
            </button>
          </div>
          <div class="results">
            {results.length === 0 ? (
              <p class="muted">{busy ? "Searching…" : "Search and pick the right title."}</p>
            ) : (
              results.map((o) => (
                <button
                  type="button"
                  class="result"
                  key={`${o.type}-${o.traktId}`}
                  onClick={() => pick(o)}
                  disabled={busy}
                >
                  {optionLabel(o)}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BadgeRoot() {
  const [status, setStatus] = useState<BadgeStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const off = onMessage("scrobbleStatus", ({ data }) => {
      setStatus(data);
      setHidden(false);
    });
    return () => off();
  }, []);

  if (!status || hidden) return null;
  return (
    <div class="root">
      <style>{CSS}</style>
      {open && <Correction onClose={() => setOpen(false)} />}
      <div class="badge">
        <span class="dot" style={{ background: DOT[status.state] }} />
        <button type="button" class="text" onClick={() => setOpen((v) => !v)} title="Fix match">
          <strong>TMSync · {status.detail ?? LABEL[status.state]}</strong>
          {status.title && <span class="title">{status.title}</span>}
        </button>
        <button type="button" class="x" onClick={() => setHidden(true)} aria-label="hide">
          ✕
        </button>
      </div>
    </div>
  );
}

export async function mountBadge(ctx: ContentScriptContext): Promise<void> {
  const ui = await createShadowRootUi(ctx, {
    name: "tmsync-badge",
    position: "overlay",
    anchor: "body",
    onMount: (container) => render(<BadgeRoot />, container),
    onRemove: (container) => container && render(null, container),
  });
  ui.mount();
}

const CSS = `
.root { position: fixed; left: 14px; bottom: 14px; z-index: 2147483646;
  display: flex; flex-direction: column; gap: 8px; max-width: 340px;
  font: 12px/1.3 system-ui, sans-serif; }
.badge { display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 10px; background: rgba(17,17,17,0.92);
  color: #f4f4f5; box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.text { display: flex; flex-direction: column; overflow: hidden; gap: 1px;
  border: none; background: transparent; color: inherit; cursor: pointer;
  text-align: left; font: inherit; padding: 0; }
.text strong { font-weight: 600; }
.title { opacity: 0.75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge .x { border: none; background: transparent; color: inherit; cursor: pointer;
  opacity: 0.6; padding: 0 2px; font-size: 12px; }
.badge .x:hover { opacity: 1; }
.panel { background: #fff; color: #111; border-radius: 10px; padding: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.3); }
.phead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.phead .x { border: none; background: transparent; cursor: pointer; font-size: 12px; }
.search { display: flex; gap: 6px; margin-bottom: 8px; }
.search input { flex: 1; padding: 5px 7px; border: 1px solid #d4d4d8; border-radius: 6px;
  font: inherit; }
.search button { padding: 5px 10px; border: 1px solid #d4d4d8; border-radius: 6px;
  background: #fff; cursor: pointer; font: inherit; }
.results { display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto; }
.result { text-align: left; padding: 6px 8px; border: 1px solid #e4e4e7; border-radius: 6px;
  background: #fafafa; cursor: pointer; font: inherit; }
.result:hover { background: #f0f0f0; }
.muted { opacity: 0.6; margin: 4px 0; }
.saved { margin: 4px 0; color: #047857; }
`;
