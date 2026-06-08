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
 * User corrections: scraped media key → the Trakt identity the user picked.
 * Authoritative over search results (so a wrong auto-match stays fixed).
 */
export const corrections = storage.defineItem<Record<string, ResolvedIdentity>>(
  "local:corrections",
  { fallback: {} },
);

/**
 * Ratings the user set through TMSync, keyed by reviewKey(identity, level, …).
 * A local mirror for instant UI — ratings made on the Trakt website aren't
 * reflected here (we don't pull the full ratings list). 1–10.
 */
export const ratings = storage.defineItem<Record<string, number>>("local:ratings", {
  fallback: {},
});

/**
 * The user's single note per item (a managed public Trakt comment), keyed by
 * reviewKey. We store the comment id so the note is always edited/deleted, never
 * duplicated.
 */
export interface StoredNote {
  commentId: number;
  text: string;
  spoiler: boolean;
}
export const notes = storage.defineItem<Record<string, StoredNote>>("local:notes", {
  fallback: {},
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
  frame: "auto" | "top" | "iframe";
  /** 0–1; a pause at/after this fraction is committed as a stop. */
  watchedThreshold: number;
  progress: number;
  updatedAt: number;
  /** Frame that owns scrobbling for this tab (first to start). Prevents two
   * frames — e.g. the page + a player iframe — scrobbling the same item. */
  ownerFrameId?: number;
}
export const tabSessions = storage.defineItem<Record<number, TabSession>>("session:tab_sessions", {
  fallback: {},
});
