import type { LinkTemplates } from "./schema";

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

/** The links a site can offer for one Trakt item: a direct deep link and/or search. */
export interface SiteLinks {
  direct?: string;
  search?: string;
}

/** Lowercase, hyphen-joined slug of a title (e.g. "The Rookie" → "the-rookie"). */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
 * Build the outbound links for a site from its templates and the Trakt page
 * media: the id-based `movie`/`tv` deep link (if fillable) and the title-based
 * `search` link (if defined). Placeholders: {tmdb} {imdb} {season} {episode}
 * {title} (URL-encoded, spaces → %20) and {slug} (lowercase, hyphen-joined).
 */
export function buildSiteLinks(links: LinkTemplates, media: TraktPageMedia): SiteLinks {
  const params = {
    tmdb: media.tmdb,
    imdb: media.imdb,
    title: media.title !== undefined ? encodeURIComponent(media.title) : undefined,
    slug: media.title !== undefined ? slugify(media.title) : undefined,
    season: media.season,
    episode: media.episode,
  };
  const out: SiteLinks = {};
  const directTpl = media.type === "movie" ? links.movie : links.tv;
  if (directTpl) {
    const url = fillTemplate(directTpl, params);
    if (url) out.direct = url;
  }
  if (links.search) {
    const url = fillTemplate(links.search, params);
    if (url) out.search = url;
  }
  return out;
}
