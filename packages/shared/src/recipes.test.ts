import { describe, expect, it } from "vitest";
import { parseRecipes } from "./recipes";

const good = {
  id: "ok",
  schemaVersion: 1,
  name: "OK",
  match: { urlPattern: ".*" },
  extract: { title: { source: "title" } },
};

describe("parseRecipes", () => {
  it("returns [] for non-array input", () => {
    expect(parseRecipes(null)).toEqual([]);
    expect(parseRecipes({})).toEqual([]);
  });

  it("keeps valid recipes and discards invalid ones individually", () => {
    const bad = { id: "bad", schemaVersion: 1, name: "Bad", match: {}, extract: {} };
    const result = parseRecipes([good, bad]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("ok");
  });
});
