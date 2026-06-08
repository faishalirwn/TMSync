import { type Recipe, SCHEMA_VERSION } from "./schema";
import type { EngineContext } from "./types";

/**
 * Match a recipe against the current page by URL pattern + DOM fingerprint.
 * The fingerprint is the primary clone-resilient key: one recipe can cover a
 * site's many mirror/clone domains as long as the marker selector exists.
 * Hostnames in the recipe are hints only and are intentionally not consulted here.
 */
export function matchRecipe(recipe: Recipe, ctx: EngineContext): boolean {
  let urlRe: RegExp;
  try {
    urlRe = new RegExp(recipe.match.urlPattern);
  } catch {
    return false; // malformed pattern — never matches
  }
  if (!urlRe.test(ctx.url)) return false;

  const fingerprint = recipe.match.domFingerprint;
  if (!fingerprint) return true;
  try {
    return ctx.document.querySelector(fingerprint) !== null;
  } catch {
    return false; // invalid selector — never matches
  }
}

/**
 * Pick the first recipe that both (a) targets a schema version this engine
 * understands and (b) matches the page. Returns `null` when nothing matches.
 */
export function selectRecipe(recipes: Recipe[], ctx: EngineContext): Recipe | null {
  for (const recipe of recipes) {
    if (recipe.schemaVersion > SCHEMA_VERSION) continue;
    if (matchRecipe(recipe, ctx)) return recipe;
  }
  return null;
}
