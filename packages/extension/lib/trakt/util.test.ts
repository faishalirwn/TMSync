import type { ParsedMedia } from "@tmsync/shared";
import { describe, expect, it } from "vitest";
import type { ResolvedIdentity, TraktTokens } from "./types";
import { buildScrobbleBody, clampProgress, isTokenExpired, resolutionCacheKey } from "./util";

describe("clampProgress", () => {
  it("clamps to 0..100 and coerces non-finite to 0", () => {
    expect(clampProgress(42.5)).toBe(42.5);
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("buildScrobbleBody", () => {
  const movieId: ResolvedIdentity = { mediaType: "movie", traktId: 28, title: "Neon Tides" };
  const showId: ResolvedIdentity = { mediaType: "show", traktId: 1, title: "The Pixel Frontier" };

  it("builds a movie body", () => {
    const media: ParsedMedia = { mediaType: "movie", title: "Neon Tides" };
    expect(buildScrobbleBody(movieId, media, 42.5)).toEqual({
      movie: { ids: { trakt: 28 } },
      progress: 42.5,
    });
  });

  it("builds an episode body with show + season/number", () => {
    const media: ParsedMedia = { mediaType: "show", title: "X", season: 2, episode: 4 };
    expect(buildScrobbleBody(showId, media, 99.9)).toEqual({
      show: { ids: { trakt: 1 } },
      episode: { season: 2, number: 4 },
      progress: 99.9,
    });
  });

  it("returns null for a show missing season/episode", () => {
    const media: ParsedMedia = { mediaType: "show", title: "X", season: 2 };
    expect(buildScrobbleBody(showId, media, 50)).toBeNull();
  });

  it("clamps progress in the built body", () => {
    const media: ParsedMedia = { mediaType: "movie", title: "X" };
    expect(buildScrobbleBody(movieId, media, 250)?.progress).toBe(100);
  });
});

describe("resolutionCacheKey", () => {
  it("is identical across episodes of the same show", () => {
    const a: ParsedMedia = {
      mediaType: "show",
      title: "The Show",
      year: 2020,
      season: 1,
      episode: 1,
    };
    const b: ParsedMedia = {
      mediaType: "show",
      title: "the show ",
      year: 2020,
      season: 3,
      episode: 9,
    };
    expect(resolutionCacheKey(a)).toBe(resolutionCacheKey(b));
    expect(resolutionCacheKey(a)).toBe("show:the show:2020");
  });

  it("distinguishes movie vs show and year", () => {
    const movie: ParsedMedia = { mediaType: "movie", title: "Dune", year: 2021 };
    expect(resolutionCacheKey(movie)).toBe("movie:dune:2021");
  });
});

describe("isTokenExpired", () => {
  const tokens: TraktTokens = {
    access_token: "a",
    refresh_token: "r",
    token_type: "bearer",
    expires_in: 1000,
    created_at: 10_000,
    scope: "public",
  };

  it("is false well before expiry", () => {
    expect(isTokenExpired(tokens, 10_500)).toBe(false);
  });

  it("is true within the skew window", () => {
    expect(isTokenExpired(tokens, 10_950)).toBe(true); // 10000+1000-60 = 10940
  });

  it("is true after expiry", () => {
    expect(isTokenExpired(tokens, 11_500)).toBe(true);
  });
});
