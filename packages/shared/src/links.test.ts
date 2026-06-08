import { describe, expect, it } from "vitest";
import { buildSiteLinks, fillTemplate, slugify } from "./links";
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
});

describe("slugify", () => {
  it("lowercases and hyphen-joins, trimming stray separators", () => {
    expect(slugify("The Rookie")).toBe("the-rookie");
    expect(slugify("Spider-Man: No Way Home!")).toBe("spider-man-no-way-home");
  });
});

describe("buildSiteLinks", () => {
  const cineby: RecipeLinks = {
    movie: "https://cineby.app/movie/{tmdb}",
    tv: "https://cineby.app/tv/{tmdb}/{season}/{episode}",
    search: "https://cineby.app/search/{title}",
  };

  it("returns a direct movie link from tmdb plus a search fallback", () => {
    expect(
      buildSiteLinks(cineby, { type: "movie", tmdb: "1034541", title: "Terrifier 3" }),
    ).toEqual({
      direct: "https://cineby.app/movie/1034541",
      search: "https://cineby.app/search/Terrifier%203",
    });
  });

  it("builds a direct tv link with season/episode", () => {
    expect(
      buildSiteLinks(cineby, { type: "tv", tmdb: "273240", season: 1, episode: 2 }).direct,
    ).toBe("https://cineby.app/tv/273240/1/2");
  });

  it("omits direct when the id is missing, keeping search", () => {
    expect(buildSiteLinks(cineby, { type: "movie", title: "The Rookie" })).toEqual({
      search: "https://cineby.app/search/The%20Rookie",
    });
  });

  it("supports a {slug} search (hyphen-joined title)", () => {
    const slugSite: RecipeLinks = { search: "https://popcornmovies.org/search/{slug}" };
    expect(
      buildSiteLinks(slugSite, { type: "tv", season: 2, episode: 4, title: "The Rookie" }),
    ).toEqual({
      search: "https://popcornmovies.org/search/the-rookie",
    });
  });

  it("returns nothing when no template can be filled", () => {
    const tmdbOnly: RecipeLinks = { movie: "https://s/movie/{tmdb}" };
    expect(buildSiteLinks(tmdbOnly, { type: "movie", title: "X" })).toEqual({});
  });
});
