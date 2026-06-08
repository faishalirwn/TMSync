import { describe, expect, it } from "vitest";
import { RecipeSchema } from "./schema";

const validRecipe = {
  id: "example-show",
  schemaVersion: 1,
  name: "Example",
  match: { urlPattern: "example\\.com/watch", domFingerprint: "#player" },
  extract: {
    title: { source: "meta", selector: "og:title", transforms: ["trim"] },
  },
};

describe("RecipeSchema", () => {
  it("accepts a minimal valid recipe and applies defaults", () => {
    const parsed = RecipeSchema.parse(validRecipe);
    expect(parsed.mediaType).toBe("auto");
    expect(parsed.video.selector).toBe("video");
    expect(parsed.video.frame).toBe("auto");
    expect(parsed.video.watchedThreshold).toBe(0.8);
  });

  it("rejects an unknown transform enum value", () => {
    const bad = {
      ...validRecipe,
      extract: { title: { source: "dom", selector: "h1", transforms: ["explode"] } },
    };
    expect(RecipeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a bad source enum value", () => {
    const bad = {
      ...validRecipe,
      extract: { title: { source: "cookie" } },
    };
    expect(RecipeSchema.safeParse(bad).success).toBe(false);
  });

  it("requires a title field in extract", () => {
    const bad = { ...validRecipe, extract: {} };
    expect(RecipeSchema.safeParse(bad).success).toBe(false);
  });

  it("requires match.urlPattern", () => {
    const bad = { ...validRecipe, match: { domFingerprint: "#player" } };
    expect(RecipeSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects watchedThreshold outside 0..1", () => {
    const bad = { ...validRecipe, video: { watchedThreshold: 1.5 } };
    expect(RecipeSchema.safeParse(bad).success).toBe(false);
  });
});
