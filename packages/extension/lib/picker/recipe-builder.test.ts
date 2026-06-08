import { type Recipe, extract } from "@tmsync/shared";
import { describe, expect, it } from "vitest";
// Reuse the recipe-snapshot fixtures.
import episodeHtml from "../../test/fixtures/sample-episode.html?raw";
import movieHtml from "../../test/fixtures/sample-movie.html?raw";
import {
  type RecipeDraft,
  autoDetectFields,
  buildRecipe,
  emptyDraft,
  escapeRegex,
  previewDraft,
  suggestLinkTemplate,
  suggestUrlPattern,
  urlTokenRegex,
} from "./recipe-builder";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("suggestLinkTemplate", () => {
  it("replaces season/episode path segments, leaving the id literal", () => {
    expect(suggestLinkTemplate("https://www.cineby.at/tv/273240/1/2", 1, 2)).toBe(
      "https://www.cineby.at/tv/273240/{season}/{episode}",
    );
  });

  it("keeps the season/episode order when both numbers are equal", () => {
    expect(suggestLinkTemplate("https://www.cineby.at/tv/273240/1/1", 1, 1)).toBe(
      "https://www.cineby.at/tv/273240/{season}/{episode}",
    );
  });

  it("returns a movie URL unchanged when there is no season/episode", () => {
    expect(suggestLinkTemplate("https://www.cineby.at/movie/1273221")).toBe(
      "https://www.cineby.at/movie/1273221",
    );
  });

  it("preserves the query string", () => {
    expect(suggestLinkTemplate("https://www.cineby.at/tv/273240/1/1?play=true", 1, 1)).toBe(
      "https://www.cineby.at/tv/273240/{season}/{episode}?play=true",
    );
  });

  it("leaves slug URLs (no matching number segment) intact", () => {
    expect(suggestLinkTemplate("https://popcornmovies.org/episode/the-rookie/1-2", 1, 2)).toBe(
      "https://popcornmovies.org/episode/the-rookie/1-2",
    );
  });
});

describe("escapeRegex / suggestUrlPattern", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegex("a.b+c")).toBe("a\\.b\\+c");
  });
  it("suggests hostname + first path segment as the url pattern", () => {
    expect(suggestUrlPattern("https://watch.example.tv/movie/42?x=1")).toBe(
      "watch\\.example\\.tv/movie",
    );
    expect(suggestUrlPattern("https://watch.example.tv/")).toBe("watch\\.example\\.tv");
  });
});

describe("urlTokenRegex (season/episode from URL)", () => {
  // Build a show recipe whose season/episode come from the Nth URL number.
  function urlRecipe(seasonOrdinal: number, episodeOrdinal: number): Recipe {
    return {
      id: "u",
      schemaVersion: 1,
      name: "U",
      match: { urlPattern: ".*" },
      mediaType: "show",
      video: { selector: "video", frame: "auto", watchedThreshold: 0.8 },
      extract: {
        title: { source: "title" },
        season: {
          source: "url",
          regex: urlTokenRegex(seasonOrdinal),
          group: 1,
          transforms: ["toInt"],
        },
        episode: {
          source: "url",
          regex: urlTokenRegex(episodeOrdinal),
          group: 1,
          transforms: ["toInt"],
        },
      },
    };
  }

  it("cineby /tv/273240/1/2 → S1E2 (skip the show id)", () => {
    const doc = new DOMParser().parseFromString("<title>x</title>", "text/html");
    const url = "https://www.cineby.at/tv/273240/1/2?play=true";
    const r = extract(urlRecipe(1, 2), { document: doc, url });
    expect(r).toMatchObject({ ok: true, media: { season: 1, episode: 2 } });
  });

  it("popcornmovies /episode/the-rookie/1-2 → S1E2", () => {
    const doc = new DOMParser().parseFromString("<title>x</title>", "text/html");
    const url = "https://popcornmovies.org/episode/the-rookie/1-2";
    const r = extract(urlRecipe(0, 1), { document: doc, url });
    expect(r).toMatchObject({ ok: true, media: { season: 1, episode: 2 } });
  });
});

describe("autoDetectFields", () => {
  it("detects title + season + episode for an episode page (meta + jsonld)", () => {
    const ctx = { document: parse(episodeHtml), url: "https://x/watch" };
    const fields = autoDetectFields(ctx);
    expect(fields.title?.source).toBe("meta");
    expect(fields.season?.source).toBe("jsonld");
    expect(fields.episode?.source).toBe("jsonld");
  });

  it("detects title + year for a movie page", () => {
    const ctx = { document: parse(movieHtml), url: "https://x/film" };
    const fields = autoDetectFields(ctx);
    expect(fields.title).toBeDefined();
    expect(fields.year?.source).toBe("jsonld");
    expect(fields.season).toBeUndefined();
    expect(fields.episode).toBeUndefined();
  });
});

describe("buildRecipe + previewDraft", () => {
  it("fails without a title", () => {
    const draft = emptyDraft("https://x/watch");
    expect(buildRecipe(draft, { id: "x", name: "X" })).toMatchObject({ ok: false });
  });

  it("builds a valid recipe and previews the parsed media end-to-end", () => {
    const ctx = { document: parse(episodeHtml), url: "https://samplestreamer.example/watch/1" };
    const draft: RecipeDraft = {
      ...emptyDraft(ctx.url),
      fields: autoDetectFields(ctx),
    };

    const built = buildRecipe(draft, { id: "custom-1", name: "My Site" });
    expect(built.ok).toBe(true);

    const preview = previewDraft(draft, ctx);
    expect(preview).toEqual({
      ok: true,
      media: { mediaType: "show", title: "The Pixel Frontier", season: 2, episode: 4 },
    });
  });
});
