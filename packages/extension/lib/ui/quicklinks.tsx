import { render } from "preact";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";

export interface QuickLinkItem {
  name: string;
  url: string;
  /** "search" links go to the site's search (no id-based deep link available). */
  kind: "direct" | "search";
}

function QuickLinks({ items }: { items: QuickLinkItem[] }) {
  if (items.length === 0) return null;
  return (
    <div class="ql">
      <style>{CSS}</style>
      <div class="ql-head">Watch on</div>
      <div class="ql-list">
        {items.map((i) => (
          <a
            class="ql-link"
            key={`${i.name}:${i.url}`}
            href={i.url}
            target="_blank"
            rel="noreferrer"
          >
            {i.name}
            {i.kind === "search" && <span class="ql-tag">search</span>}
          </a>
        ))}
      </div>
    </div>
  );
}

/**
 * Inject the quick-links block right after Trakt's own external-links list.
 * `getItems` is called on every (re)mount so the links stay fresh across Trakt's
 * in-page navigations (autoMount re-runs when `ul.external` reappears).
 */
export async function mountQuickLinks(
  ctx: ContentScriptContext,
  getItems: () => QuickLinkItem[],
): Promise<void> {
  const ui = await createShadowRootUi(ctx, {
    name: "tmsync-quicklinks",
    position: "inline",
    anchor: "ul.external",
    append: "after",
    onMount: (container) => render(<QuickLinks items={getItems()} />, container),
    onRemove: (container) => container && render(null, container),
  });
  ui.autoMount();
}

const CSS = `
.ql { margin: 10px 0; font: 12px/1.4 system-ui, sans-serif; }
.ql-head { text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px;
  opacity: 0.55; margin-bottom: 6px; }
.ql-list { display: flex; flex-wrap: wrap; gap: 6px; }
.ql-link { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px;
  border-radius: 6px; background: rgba(255,255,255,0.08); color: #d6d6d6;
  text-decoration: none; border: 1px solid rgba(255,255,255,0.1); }
.ql-link:hover { background: rgba(255,255,255,0.16); color: #fff; }
.ql-tag { font-size: 9px; text-transform: uppercase; letter-spacing: 0.03em;
  opacity: 0.6; border: 1px solid currentColor; border-radius: 4px; padding: 0 3px; }
`;
