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
 * Per-tab watch session, keyed by tabId. Set by the recipe-matching frame and
 * updated by whichever frame owns the <video> (which may be a cross-origin
 * iframe). Lives in `session` storage (ephemeral, per browser session) — the
 * background SW reads it on each wake (constraint #4); the content script and
 * storage own the state, not background memory. Used to (a) hand the media to a
 * player iframe and (b) reconcile a stop if a tab dies before a clean one.
 */
export interface TabSession {
  media: ParsedMedia;
  videoSelector: string;
  progress: number;
  updatedAt: number;
}
export const tabSessions = storage.defineItem<Record<number, TabSession>>("session:tab_sessions", {
  fallback: {},
});
