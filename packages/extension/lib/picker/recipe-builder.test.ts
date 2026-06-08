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
  suggestUrlPattern,
} from "./recipe-builder";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("escapeRegex / suggestUrlPattern", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegex("a.b+c")).toBe("a\\.b\\+c");
  });
  it("suggests the hostname as the url pattern", () => {
    expect(suggestUrlPattern("https://watch.example.tv/movie/42?x=1")).toBe("watch\\.example\\.tv");
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
