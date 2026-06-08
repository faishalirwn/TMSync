import { customRecipes } from "@/lib/storage";
import { type QuickLinkItem, mountQuickLinks } from "@/lib/ui/quicklinks";
import { type TraktPageMedia, buildSiteLink, parseRecipes } from "@tmsync/shared";
import rawRecipes from "../../../recipes/index.json";

/**
 * Runs on trakt.tv (static, specific host — not the broad runtime registration
 * the streaming content script uses). Reads the media + TMDB/IMDB ids from the
 * page and injects "watch on <site>" links for every recipe that defines link
 * templates, deep-linked to the matching movie / SxEx.
 */
export default defineContentScript({
  matches: ["*://trakt.tv/*", "*://www.trakt.tv/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const recipes = parseRecipes([
      ...(rawRecipes as unknown[]),
      ...(await customRecipes.getValue()),
    ]).filter((r) => r.links);
    if (recipes.length === 0) return; // nothing can produce a link

    await mountQuickLinks(ctx, () => {
      const media = parseTraktPage();
      if (!media) return [];
      const items: QuickLinkItem[] = [];
      for (const r of recipes) {
        if (!r.links) continue;
        const link = buildSiteLink(r.links, media);
        if (link) items.push({ name: r.name, ...link });
      }
      return items;
    });
  },
});

/** Read TMDB/IMDB ids from Trakt's own external-links block. */
function readIds(): { tmdb?: string; imdb?: string } {
  const href = (sel: string) =>
    document.querySelector<HTMLAnchorElement>(sel)?.getAttribute("href") ?? "";
  const tmdb = href("#external-link-tmdb").match(/(?:movie|tv)\/(\d+)/)?.[1];
  const imdb = href("#external-link-imdb").match(/(tt\d+)/)?.[1];
  return { tmdb, imdb };
}

/** Bare title for the search fallback (strip Trakt's suffix + a trailing year). */
function readTitle(): string | undefined {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content;
  const raw = (og || document.title)
    .replace(/\s*[—–-]\s*Trakt.*$/i, "")
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .trim();
  return raw || undefined;
}

/**
 * Map the current Trakt page to outbound media. Per the requested behaviour:
 * movie → movie; show → S1E1; season → S{n}E1; episode → S{n}E{m}.
 */
function parseTraktPage(): TraktPageMedia | null {
  const path = location.pathname;
  const ids = readIds();
  const title = readTitle();

  if (/^\/movies\/[^/]+/.test(path)) {
    return { type: "movie", ...ids, title };
  }
  let m = path.match(/^\/shows\/[^/]+\/seasons\/(\d+)\/episodes\/(\d+)/);
  if (m) return { type: "tv", season: Number(m[1]), episode: Number(m[2]), ...ids, title };
  m = path.match(/^\/shows\/[^/]+\/seasons\/(\d+)/);
  if (m) return { type: "tv", season: Number(m[1]), episode: 1, ...ids, title };
  if (/^\/shows\/[^/]+/.test(path)) {
    return { type: "tv", season: 1, episode: 1, ...ids, title };
  }
  return null;
}
