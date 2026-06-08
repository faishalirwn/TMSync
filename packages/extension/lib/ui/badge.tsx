import { type BadgeState, type BadgeStatus, onMessage } from "@/messaging";
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

function Badge({ status, onHide }: { status: BadgeStatus; onHide: () => void }) {
  return (
    <div class="badge">
      <style>{CSS}</style>
      <span class="dot" style={{ background: DOT[status.state] }} />
      <span class="text">
        <strong>TMSync · {status.detail ?? LABEL[status.state]}</strong>
        {status.title && <span class="title">{status.title}</span>}
      </span>
      <button type="button" class="x" onClick={onHide} aria-label="hide">
        ✕
      </button>
    </div>
  );
}

/** Top-frame badge: subscribes to the relayed scrobble status and renders. */
function BadgeRoot() {
  const [status, setStatus] = useState<BadgeStatus | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const off = onMessage("scrobbleStatus", ({ data }) => {
      setStatus(data);
      setHidden(false);
    });
    return () => off();
  }, []);

  if (!status || hidden) return null;
  return <Badge status={status} onHide={() => setHidden(true)} />;
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
.badge { position: fixed; left: 14px; bottom: 14px; z-index: 2147483646;
  display: flex; align-items: center; gap: 8px; max-width: 320px;
  padding: 8px 10px; border-radius: 10px; background: rgba(17,17,17,0.92);
  color: #f4f4f5; font: 12px/1.3 system-ui, sans-serif;
  box-shadow: 0 4px 16px rgba(0,0,0,0.35); }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.text { display: flex; flex-direction: column; overflow: hidden; }
.text strong { font-weight: 600; }
.title { opacity: 0.75; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.x { border: none; background: transparent; color: inherit; cursor: pointer;
  opacity: 0.6; padding: 0 2px; font-size: 12px; }
.x:hover { opacity: 1; }
`;
