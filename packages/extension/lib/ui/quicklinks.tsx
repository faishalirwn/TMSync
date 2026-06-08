import { render } from "preact";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";

export interface QuickLinkItem {
  name: string;
  /** id-based deep link, when one could be built. */
  direct?: string;
  /** title/slug search link, when the recipe defines one. */
  search?: string;
}

function QuickLinks({ items }: { items: QuickLinkItem[] }) {
  if (items.length === 0) return null;
  return (
    <div class="ql">
      <style>{CSS}</style>
      <div class="ql-head">Watch on</div>
      <div class="ql-list">
        {items.map((i) => {
          // Wide button → the deep link if we have one, else search. A small
          // magnifier appears only as a secondary option (when both exist), so a
          // site never takes two wide slots.
          const primary = i.direct ?? i.search;
          if (!primary) return null;
          return (
            <div class="ql-row" key={i.name}>
              <a class="ql-link" href={primary} target="_blank" rel="noreferrer">
                {i.name}
              </a>
              {i.direct && i.search && (
                <a
                  class="ql-search"
                  href={i.search}
                  target="_blank"
                  rel="noreferrer"
                  title={`Search ${i.name}`}
                  aria-label={`Search ${i.name}`}
                >
                  ⌕
                </a>
              )}
            </div>
          );
        })}
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
.ql-row { display: inline-flex; align-items: stretch; gap: 2px; }
.ql-link { display: inline-flex; align-items: center; padding: 5px 10px;
  border-radius: 6px; background: rgba(255,255,255,0.08); color: #d6d6d6;
  text-decoration: none; border: 1px solid rgba(255,255,255,0.1); }
.ql-link:hover { background: rgba(255,255,255,0.16); color: #fff; }
.ql-search { display: inline-flex; align-items: center; justify-content: center; width: 26px;
  border-radius: 6px; background: rgba(255,255,255,0.08); color: #d6d6d6; text-decoration: none;
  border: 1px solid rgba(255,255,255,0.1); font-size: 14px; }
.ql-search:hover { background: rgba(255,255,255,0.16); color: #fff; }
`;
