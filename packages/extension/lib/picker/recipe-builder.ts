import {
  type EngineContext,
  type ExtractResult,
  type Field,
  type Recipe,
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
  match: { urlPattern: string; domFingerprint?: string };
  mediaType: "auto" | "movie" | "show";
  video: { selector: string };
  fields: {
    title?: Field;
    year?: Field;
    season?: Field;
    episode?: Field;
  };
}

export type DraftFieldKey = keyof RecipeDraft["fields"];

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A urlPattern that matches the current site's hostname (clone domains differ; the fingerprint is the resilient key). */
export function suggestUrlPattern(url: string): string {
  try {
    return escapeRegex(new URL(url).hostname);
  } catch {
    return escapeRegex(url);
  }
}

export function emptyDraft(url: string): RecipeDraft {
  return {
    match: { urlPattern: suggestUrlPattern(url) },
    mediaType: "auto",
    video: { selector: "video" },
    fields: {},
  };
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
    video: { selector: draft.video.selector },
    extract: {
      title: draft.fields.title,
      year: draft.fields.year,
      season: draft.fields.season,
      episode: draft.fields.episode,
    },
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
