import type { ReviewLevel, TraktSearchOption } from "@/lib/trakt/types";
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

const NUMS = Array.from({ length: 10 }, (_, i) => i + 1);

/** 1–10 rating scale. Click a number to rate; click your current rating to clear. */
function RatingRow({ media, level }: { media: ParsedMedia; level: ReviewLevel }) {
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void sendMessage("getReview", { media, level }).then((r) => setRating(r.rating));
  }, [media, level]);

  const choose = async (n: number) => {
    setBusy(true);
    setErr(null);
    if (n === rating) {
      const out = await sendMessage("unrateItem", { media, level });
      if (out.ok) setRating(null);
      else setErr(out.error ?? "Failed");
    } else {
      const out = await sendMessage("rateItem", { media, level, rating: n });
      if (out.ok) setRating(n);
      else setErr(out.error ?? "Failed");
    }
    setBusy(false);
  };

  return (
    <div class="rate">
      <div class="nums">
        {NUMS.map((n) => (
          <button
            type="button"
            key={n}
            class={`num${rating !== null && n <= rating ? " on" : ""}`}
            disabled={busy}
            onClick={() => choose(n)}
            title={`Rate ${n}/10`}
          >
            {n}
          </button>
        ))}
      </div>
      {err && <span class="msg err">{err}</span>}
    </div>
  );
}

const LEVELS: ReviewLevel[] = ["episode", "season", "show"];

/** Rate + keep a single editable note (public Trakt comment) for the matched item. */
function RateNote({
  media,
  onClose,
  onFix,
}: {
  media: ParsedMedia;
  onClose: () => void;
  onFix: () => void;
}) {
  const isShow = media.season !== undefined || media.episode !== undefined;
  const [level, setLevel] = useState<ReviewLevel>(isShow ? "episode" : "movie");
  const [note, setNote] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [hasNote, setHasNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setMsg(null);
    void sendMessage("getReview", { media, level }).then((r) => {
      setNote(r.note?.text ?? "");
      setSpoiler(r.note?.spoiler ?? false);
      setHasNote(!!r.note);
    });
  }, [media, level]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const out = await sendMessage("saveNote", { media, level, text: note, spoiler });
    if (out.ok) {
      setHasNote(true);
      setMsg("Saved to Trakt");
    } else {
      setMsg(out.error ?? "Failed");
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    setMsg(null);
    const out = await sendMessage("deleteNote", { media, level });
    if (out.ok) {
      setNote("");
      setHasNote(false);
      setMsg("Deleted");
    } else {
      setMsg(out.error ?? "Failed");
    }
    setBusy(false);
  };

  return (
    <div class="panel">
      <div class="phead">
        <strong>Rate &amp; note</strong>
        <button type="button" class="x" onClick={onClose} aria-label="close">
          ✕
        </button>
      </div>
      {isShow && (
        <div class="tabs">
          {LEVELS.map((l) => (
            <button
              type="button"
              key={l}
              class={`tab${level === l ? " on" : ""}`}
              onClick={() => setLevel(l)}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <RatingRow media={media} level={level} />
      <textarea
        class="noteinput"
        rows={4}
        value={note}
        onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
        placeholder="Your note — public on Trakt, at least 5 words…"
      />
      <label class="spoil">
        <input
          type="checkbox"
          checked={spoiler}
          onChange={(e) => setSpoiler((e.target as HTMLInputElement).checked)}
        />
        Mark as spoiler
      </label>
      <div class="actions">
        <button type="button" onClick={save} disabled={busy || note.trim().length === 0}>
          {hasNote ? "Update note" : "Post note"}
        </button>
        {hasNote && (
          <button type="button" class="danger" onClick={remove} disabled={busy}>
            Delete
          </button>
        )}
        <button type="button" class="link" onClick={onFix}>
          Wrong match?
        </button>
      </div>
      {msg && <p class="msg">{msg}</p>}
    </div>
  );
}

function BadgeRoot() {
  const [status, setStatus] = useState<BadgeStatus | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [panel, setPanel] = useState<null | "review" | "fix">(null);
  const [media, setMedia] = useState<ParsedMedia | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(false);

  useEffect(() => {
    // Don't auto-expand on every status: while minimized the dot color keeps
    // tracking state live, so the user always sees TMSync is working without it
    // popping back open on each play/pause/timeupdate.
    const off = onMessage("scrobbleStatus", ({ data }) => setStatus(data));
    return () => off();
  }, []);

  // Pull the tab's media once a session exists (needed for rating/note/fix).
  useEffect(() => {
    if (status && !media) {
      void sendMessage("getTabMedia", undefined).then((t) => t && setMedia(t.media));
    }
  }, [status, media]);

  if (!status) return null;

  const summary = `TMSync · ${status.detail ?? LABEL[status.state]}${
    status.title ? ` — ${status.title}` : ""
  }`;

  // Minimized: a persistent status dot so presence + state stay visible.
  if (minimized) {
    return (
      <div class="root">
        <style>{CSS}</style>
        <button
          type="button"
          class="mini"
          style={{ background: DOT[status.state] }}
          onClick={() => setMinimized(false)}
          title={summary}
          aria-label={summary}
        />
      </div>
    );
  }

  // Compact, dismissible rating prompt right after a watch lands in history.
  const showPrompt =
    status.state === "scrobbled" && media !== null && panel === null && !promptDismissed;

  return (
    <div class="root">
      <style>{CSS}</style>
      {panel === "review" && media && (
        <RateNote media={media} onClose={() => setPanel(null)} onFix={() => setPanel("fix")} />
      )}
      {panel === "fix" && <Correction onClose={() => setPanel(null)} />}
      {showPrompt && media && (
        <div class="prompt">
          <span class="plabel">Rate it?</span>
          <RatingRow media={media} level={media.season !== undefined ? "episode" : "movie"} />
          <button type="button" class="link" onClick={() => setPanel("review")}>
            note
          </button>
          <button
            type="button"
            class="x"
            onClick={() => setPromptDismissed(true)}
            aria-label="dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <div class="badge">
        <span class="dot" style={{ background: DOT[status.state] }} />
        <button
          type="button"
          class="text"
          onClick={() => setPanel((p) => (p ? null : "review"))}
          title="Rate, note, or fix the match"
        >
          <strong>TMSync · {status.detail ?? LABEL[status.state]}</strong>
          {status.title && <span class="title">{status.title}</span>}
        </button>
        <button
          type="button"
          class="x"
          onClick={() => setMinimized(true)}
          aria-label="minimize"
          title="Minimize to a dot"
        >
          –
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
.mini { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.85);
  padding: 0; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.4);
  transition: transform 0.1s; }
.mini:hover { transform: scale(1.15); }
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
.tabs { display: flex; gap: 4px; margin-bottom: 8px; }
.tab { flex: 1; padding: 4px 6px; border: 1px solid #d4d4d8; border-radius: 6px;
  background: #fff; cursor: pointer; font: inherit; text-transform: capitalize; }
.tab.on { background: #111; color: #fff; border-color: #111; }
.rate { margin-bottom: 8px; }
.nums { display: flex; gap: 3px; }
.num { flex: 1; padding: 5px 0; border: 1px solid #d4d4d8; border-radius: 5px;
  background: #fff; color: #111; cursor: pointer; font: 11px/1 inherit; }
.num:hover { border-color: #f5b50a; }
.num.on { background: #f5b50a; border-color: #f5b50a; color: #111; font-weight: 600; }
.noteinput { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #d4d4d8;
  border-radius: 6px; font: inherit; resize: vertical; }
.spoil { display: flex; align-items: center; gap: 5px; margin: 6px 0; font-size: 11px; opacity: 0.8; }
.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.actions .danger { border-color: #dc2626; color: #dc2626; }
.msg { margin: 6px 0 0; font-size: 11px; opacity: 0.8; }
.msg.err { color: #dc2626; opacity: 1; }
.prompt { display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border-radius: 10px; background: rgba(17,17,17,0.92); color: #f4f4f5;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
.prompt .plabel { font-weight: 600; white-space: nowrap; }
.prompt .rate { margin: 0; flex: 1; }
.prompt .num { background: rgba(255,255,255,0.1); color: #f4f4f5; border-color: rgba(255,255,255,0.2); }
.prompt .num.on { background: #f5b50a; color: #111; border-color: #f5b50a; }
.prompt .link { color: #93c5fd; }
.prompt .x { border: none; background: transparent; color: inherit; cursor: pointer; opacity: 0.6; }
.panel .link { border: none; background: none; padding: 0; color: #2563eb;
  cursor: pointer; text-decoration: underline; font: inherit; }
`;
