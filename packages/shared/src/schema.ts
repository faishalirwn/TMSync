import { z } from "zod";

/**
 * Recipe schema version understood by this build of the engine.
 * Clients ignore recipes whose `schemaVersion` is newer than this.
 */
export const SCHEMA_VERSION = 1;

export const Transform = z.enum(["trim", "lowercase", "uppercase", "toInt", "collapseSpaces"]);
export type Transform = z.infer<typeof Transform>;

/**
 * A `Field` says *where* a value is and *how to clean it* — never *how to
 * compute it* with code. The engine interprets this declaratively.
 */
export const Field = z.object({
  source: z.enum(["url", "meta", "jsonld", "dom", "title"]),
  // dom: CSS selector; meta: property/name (e.g. "og:title");
  // jsonld: dotted path (e.g. "partOfTVSeason.seasonNumber")
  selector: z.string().optional(),
  attr: z.string().optional(), // dom only: read an attribute instead of textContent
  regex: z.string().optional(), // applied to the raw string
  group: z.number().int().optional(), // capture group index (default 1)
  transforms: z.array(Transform).optional(),
});
export type Field = z.infer<typeof Field>;

export const Recipe = z.object({
  id: z.string(),
  schemaVersion: z.number().int(), // client ignores recipes with a newer schemaVersion than it supports
  name: z.string(), // human-readable site name
  match: z.object({
    urlPattern: z.string(), // regex tested against location.href
    domFingerprint: z.string().optional(), // a selector that must exist; primary clone-resilient key
    hostnames: z.array(z.string()).optional(), // hints only, not the primary match
  }),
  mediaType: z.enum(["auto", "movie", "show"]).default("auto"),
  video: z
    .object({
      selector: z.string().default("video"),
      frame: z.enum(["auto", "top", "iframe"]).default("auto"),
      // per-site "treat as finished here" point for firing stop on sites with long
      // credits; NOT the watched decision (Trakt applies its own 80% on /scrobble/stop)
      watchedThreshold: z.number().min(0).max(1).default(0.8),
    })
    .default({}),
  extract: z.object({
    title: Field,
    year: Field.optional(), // helps movie disambiguation
    season: Field.optional(), // shows
    episode: Field.optional(), // shows
  }),
});

export type Recipe = z.infer<typeof Recipe>;
export const RecipeSchema = Recipe;
