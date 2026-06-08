import {
  type EngineContext,
  type ExtractResult,
  type Field,
  type Recipe,
  type RecipeLinks,
  RecipeSchema,
  SCHEMA_VERSION,
  extract,
  readField,
} from "@tmsync/shared";

/**
 * An in-progress recipe being assembled by the element picker. Mirrors the
 * recipe shape but with every extracted field optional while the user builds it.
 */
export interface RecipeDraft {
  match: { urlPattern: string; domFingerprint?: string; hostnames?: string[] };
  mediaType: "auto" | "movie" | "show";
  video: { selector: string; frame: "auto" | "top" | "iframe" };
  fields: {
    title?: Field;
    year?: Field;
    season?: Field;
    episode?: Field;
  };
  links?: RecipeLinks;
}

export type DraftFieldKey = keyof RecipeDraft["fields"];

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Regex (for a `url` Field) capturing the Nth number in the URL — robust for
 * season/episode in paths like `/tv/273240/1/1` (n=1 → season 1, n=2 → episode
 * 1) or `/episode/the-rookie/1-2` (n=0 → season 1, n=1 → episode 2).
 */
export function urlTokenRegex(ordinal: number): string {
  return `(?:\\D*\\d+){${ordinal}}\\D*(\\d+)`;
}

/**
 * A urlPattern matching the hostname + first path segment (e.g.
 * "cineby\.at/movie"), so a movie recipe doesn't fire on the home/search pages.
 * Hostname-scoped rather than full-URL so it survives the dynamic id segment.
 */
export function suggestUrlPattern(url: string): string {
  try {
    const u = new URL(url);
    const firstSegment = u.pathname.split("/").filter(Boolean)[0];
    const base = firstSegment ? `${u.hostname}/${firstSegment}` : u.hostname;
    return escapeRegex(base);
  } catch {
    return escapeRegex(url);
  }
}

/**
 * Pre-fill a quick-link template from the current page URL by replacing the
 * scraped season/episode path segments with `{season}`/`{episode}`. The site's
 * id segment stays literal — the user swaps it for `{tmdb}`/`{imdb}` (or clears
 * it and uses a `{title}` search for slug-based sites). Best-effort.
 */
export function suggestLinkTemplate(url: string, season?: number, episode?: number): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/");
    const idxS = season !== undefined ? segs.indexOf(String(season)) : -1;
    if (idxS >= 0) segs[idxS] = "{season}";
    if (episode !== undefined) {
      const idxE = segs.indexOf(String(episode), idxS >= 0 ? idxS + 1 : 0);
      if (idxE >= 0) segs[idxE] = "{episode}";
    }
    return `${u.origin}${segs.join("/")}${u.search}`;
  } catch {
    return url;
  }
}

export function emptyDraft(url: string): RecipeDraft {
  let hostname: string | undefined;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = undefined;
  }
  return {
    match: {
      urlPattern: suggestUrlPattern(url),
      hostnames: hostname ? [hostname] : undefined,
    },
    mediaType: "auto",
    video: { selector: "video", frame: "auto" },
    fields: {},
  };
}

/** Reverse of buildRecipe: load a saved recipe back into an editable draft. */
export function recipeToDraft(recipe: Recipe): RecipeDraft {
  return {
    match: {
      urlPattern: recipe.match.urlPattern,
      domFingerprint: recipe.match.domFingerprint,
      hostnames: recipe.match.hostnames,
    },
    mediaType: recipe.mediaType,
    video: { selector: recipe.video.selector, frame: recipe.video.frame },
    fields: {
      title: recipe.extract.title,
      year: recipe.extract.year,
      season: recipe.extract.season,
      episode: recipe.extract.episode,
    },
    links: recipe.links,
  };
}

/**
 * Whether a saved recipe belongs to this host — used to reload it into the
 * picker for editing, even from a non-media page (homepage) where its urlPattern
 * wouldn't match the current URL. Checks the hostnames hint, then falls back to
 * the escaped hostname appearing in the urlPattern (how the picker builds them).
 */
export function recipeMatchesHost(recipe: Recipe, hostname: string): boolean {
  if (recipe.match.hostnames?.includes(hostname)) return true;
  return recipe.match.urlPattern.includes(escapeRegex(hostname));
}

function firstWorking(candidates: Field[], ctx: EngineContext): Field | undefined {
  for (const field of candidates) {
    if (readField(field, ctx) !== null) return field;
  }
  return undefined;
}

/**
 * Best-effort field detection from page metadata, preferring url/meta/jsonld over
 * dom (per CLAUDE.md conventions: the picker should auto-detect before asking the
 * user to click). Returns only the fields that actually yield a value.
 */
export function autoDetectFields(ctx: EngineContext): RecipeDraft["fields"] {
  const title = firstWorking(
    [
      { source: "meta", selector: "og:title", transforms: ["trim", "collapseSpaces"] },
      { source: "jsonld", selector: "partOfSeries.name", transforms: ["trim", "collapseSpaces"] },
      { source: "jsonld", selector: "name", transforms: ["trim", "collapseSpaces"] },
      { source: "title", transforms: ["trim", "collapseSpaces"] },
    ],
    ctx,
  );
  const season = firstWorking(
    [{ source: "jsonld", selector: "partOfTVSeason.seasonNumber", transforms: ["toInt"] }],
    ctx,
  );
  const episode = firstWorking(
    [{ source: "jsonld", selector: "episodeNumber", transforms: ["toInt"] }],
    ctx,
  );
  const year = firstWorking(
    [
      { source: "jsonld", selector: "datePublished", regex: "(\\d{4})", transforms: ["toInt"] },
      {
        source: "meta",
        selector: "og:video:release_date",
        regex: "(\\d{4})",
        transforms: ["toInt"],
      },
    ],
    ctx,
  );
  return { title, year, season, episode };
}

/** Drop empty link fields; return undefined if nothing's set (keeps recipes clean). */
function normalizeLinks(links: RecipeLinks | undefined): RecipeLinks | undefined {
  if (!links) return undefined;
  const out: RecipeLinks = {};
  if (links.movie?.trim()) out.movie = links.movie.trim();
  if (links.tv?.trim()) out.tv = links.tv.trim();
  if (links.search?.trim()) out.search = links.search.trim();
  return out.movie || out.tv || out.search ? out : undefined;
}

export type BuildResult = { ok: true; recipe: Recipe } | { ok: false; error: string };

/** Assemble + validate a recipe from a draft. */
export function buildRecipe(draft: RecipeDraft, meta: { id: string; name: string }): BuildResult {
  if (!draft.fields.title) return { ok: false, error: "Pick a title first." };

  const candidate = {
    id: meta.id,
    schemaVersion: SCHEMA_VERSION,
    name: meta.name,
    match: draft.match,
    mediaType: draft.mediaType,
    video: { selector: draft.video.selector, frame: draft.video.frame },
    extract: {
      title: draft.fields.title,
      year: draft.fields.year,
      season: draft.fields.season,
      episode: draft.fields.episode,
    },
    links: normalizeLinks(draft.links),
  };

  const parsed = RecipeSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid recipe" };
  }
  return { ok: true, recipe: parsed.data };
}

/** Live preview: run the real engine against the page with the current draft. */
export function previewDraft(draft: RecipeDraft, ctx: EngineContext): ExtractResult {
  const built = buildRecipe(draft, { id: "preview", name: "preview" });
  if (!built.ok) return { ok: false, error: built.error };
  return extract(built.recipe, ctx);
}
