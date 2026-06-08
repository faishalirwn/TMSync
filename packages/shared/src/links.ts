import type { RecipeLinks } from "./schema";

/**
 * Media identified on a Trakt page, used to build an outbound quick link.
 * `type` decides movie vs tv template; season/episode are already resolved per
 * the page level (show → 1/1, season → n/1, episode → n/m).
 */
export interface TraktPageMedia {
  type: "movie" | "tv";
  tmdb?: string;
  imdb?: string;
  title?: string;
  season?: number;
  episode?: number;
}

export interface SiteLink {
  url: string;
  /** "direct" = built from ids; "search" = title-based fallback. */
  kind: "direct" | "search";
}

/**
 * Substitute `{placeholder}` tokens in a template. Returns null if any
 * referenced placeholder is missing/empty — so a `{tmdb}` template is skipped
 * when we couldn't read a TMDB id, rather than producing a broken URL.
 */
export function fillTemplate(
  template: string,
  params: Record<string, string | number | undefined>,
): string | null {
  let missing = false;
  const url = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    if (v === undefined || v === "") {
      missing = true;
      return "";
    }
    return String(v);
  });
  return missing ? null : url;
}

/**
 * Build the best outbound link for a site: the id-based `movie`/`tv` template if
 * it can be filled, else the title-based `search` template. Null if neither
 * applies (e.g. a tmdb-only template with no tmdb id and no search fallback).
 */
export function buildSiteLink(links: RecipeLinks, media: TraktPageMedia): SiteLink | null {
  const title = media.title !== undefined ? encodeURIComponent(media.title) : undefined;
  const direct = media.type === "movie" ? links.movie : links.tv;
  if (direct) {
    const url = fillTemplate(direct, {
      tmdb: media.tmdb,
      imdb: media.imdb,
      title,
      season: media.season,
      episode: media.episode,
    });
    if (url) return { url, kind: "direct" };
  }
  if (links.search && title) {
    const url = fillTemplate(links.search, { title });
    if (url) return { url, kind: "search" };
  }
  return null;
}
