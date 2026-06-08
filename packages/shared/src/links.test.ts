import { describe, expect, it } from "vitest";
import { buildSiteLink, fillTemplate } from "./links";
import type { RecipeLinks } from "./schema";

describe("fillTemplate", () => {
  it("substitutes present placeholders", () => {
    expect(
      fillTemplate("https://s/tv/{tmdb}/{season}/{episode}", { tmdb: "42", season: 1, episode: 2 }),
    ).toBe("https://s/tv/42/1/2");
  });

  it("returns null when a referenced placeholder is missing", () => {
    expect(fillTemplate("https://s/movie/{tmdb}", { tmdb: undefined })).toBeNull();
    expect(fillTemplate("https://s/movie/{tmdb}", {})).toBeNull();
  });

  it("leaves unrelated braces-free text intact", () => {
    expect(fillTemplate("https://s/movie/{imdb}", { imdb: "tt99" })).toBe("https://s/movie/tt99");
  });
});

describe("buildSiteLink", () => {
  const cineby: RecipeLinks = {
    movie: "https://cineby.app/movie/{tmdb}",
    tv: "https://cineby.app/tv/{tmdb}/{season}/{episode}",
    search: "https://cineby.app/search/{title}",
  };

  it("builds a direct movie link from tmdb", () => {
    expect(buildSiteLink(cineby, { type: "movie", tmdb: "1034541", title: "Terrifier 3" })).toEqual(
      {
        url: "https://cineby.app/movie/1034541",
        kind: "direct",
      },
    );
  });

  it("builds a direct tv link with season/episode", () => {
    expect(buildSiteLink(cineby, { type: "tv", tmdb: "273240", season: 1, episode: 2 })).toEqual({
      url: "https://cineby.app/tv/273240/1/2",
      kind: "direct",
    });
  });

  it("falls back to search when the id is missing", () => {
    expect(buildSiteLink(cineby, { type: "movie", title: "The Rookie" })).toEqual({
      url: "https://cineby.app/search/The%20Rookie",
      kind: "search",
    });
  });

  it("returns null when neither a fillable template nor search applies", () => {
    const tmdbOnly: RecipeLinks = { movie: "https://s/movie/{tmdb}" };
    expect(buildSiteLink(tmdbOnly, { type: "movie", title: "X" })).toBeNull();
  });

  it("uses search for a slug-only site (no direct template)", () => {
    const slugSite: RecipeLinks = { search: "https://popcornmovies.org/search/{title}" };
    expect(
      buildSiteLink(slugSite, { type: "tv", season: 2, episode: 4, title: "The Rookie" }),
    ).toEqual({
      url: "https://popcornmovies.org/search/The%20Rookie",
      kind: "search",
    });
  });
});
