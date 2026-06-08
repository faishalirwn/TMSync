import type { ParsedMedia } from "@tmsync/shared";
import type { ResolvedIdentity, ScrobbleBody, TraktTokens } from "./types";

/**
 * Trakt `progress` is a 0–100 float. Coerce non-finite to 0, clamp, and round to
 * 2 decimals — high-precision floats are a known cause of 422 on /scrobble/*.
 */
export function clampProgress(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const clamped = Math.min(100, Math.max(0, n));
  return Math.round(clamped * 100) / 100;
}

/**
 * Build a /scrobble body from a resolved identity + the scraped media. Returns
 * null for a show that's missing season/episode (we can't scrobble an episode
 * without both). Pure — unit tested.
 */
export function buildScrobbleBody(
  identity: ResolvedIdentity,
  media: ParsedMedia,
  progress: number,
): ScrobbleBody | null {
  const p = clampProgress(progress);
  if (identity.mediaType === "movie") {
    return { movie: { ids: { trakt: identity.traktId } }, progress: p };
  }
  if (media.season === undefined || media.episode === undefined) return null;
  return {
    show: { ids: { trakt: identity.traktId } },
    episode: { season: media.season, number: media.episode },
    progress: p,
  };
}

/** Cache key for a resolution: identity is independent of season/episode. */
export function resolutionCacheKey(media: ParsedMedia): string {
  const mediaType =
    media.season !== undefined || media.episode !== undefined ? "show" : media.mediaType;
  return `${mediaType}:${media.title.trim().toLowerCase()}:${media.year ?? ""}`;
}

/** True if the access token is expired (or within `skewSec` of expiring). */
export function isTokenExpired(tokens: TraktTokens, nowSec: number, skewSec = 60): boolean {
  return nowSec >= tokens.created_at + tokens.expires_in - skewSec;
}
