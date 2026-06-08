import type { ParsedMedia, Recipe } from "@tmsync/shared";
import { storage } from "wxt/utils/storage";
import type { ResolvedIdentity, TraktTokens } from "./trakt/types";

/**
 * All persisted state lives here. The background SW is stateless (constraint
 * #4): it reads everything from storage on each wake. `local` for caches/tokens,
 * never `sync` for secrets.
 */

export const traktTokens = storage.defineItem<TraktTokens | null>("local:trakt_tokens", {
  fallback: null,
});

/** Resolution cache keyed by resolutionCacheKey(media). */
export const resolutionCache = storage.defineItem<Record<string, ResolvedIdentity>>(
  "local:resolution_cache",
  { fallback: {} },
);

/** Origins where the user granted host access and we registered the content script. */
export const enabledOrigins = storage.defineItem<string[]>("local:enabled_origins", {
  fallback: [],
});

/** Recipes authored locally via the element picker (merged with the bundled list). */
export const customRecipes = storage.defineItem<Recipe[]>("local:custom_recipes", {
  fallback: [],
});

/**
 * Last-known progress of the active watch session, throttle-persisted by the
 * content script. Safety net for reconciliation if a page dies before a clean
 * stop (constraint #4 — state lives in content+storage, not background memory).
 */
export interface ActiveScrobble {
  media: ParsedMedia;
  progress: number;
  updatedAt: number;
}
export const activeScrobble = storage.defineItem<ActiveScrobble | null>("local:active_scrobble", {
  fallback: null,
});
