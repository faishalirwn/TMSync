import { parseRecipes } from "@tmsync/shared";
import { describe, expect, it } from "vitest";
import rawRecipes from "../../../recipes/index.json";

/**
 * The shipped recipe list must fully validate against the schema. If a new PR
 * adds a malformed recipe, parseRecipes silently drops it — so we assert that
 * every raw entry survives validation (count in === count out).
 */
describe("recipes/index.json", () => {
  it("is an array", () => {
    expect(Array.isArray(rawRecipes)).toBe(true);
  });

  it("every entry passes the Zod schema", () => {
    const parsed = parseRecipes(rawRecipes);
    expect(parsed).toHaveLength((rawRecipes as unknown[]).length);
  });

  it("has unique recipe ids", () => {
    const ids = parseRecipes(rawRecipes).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
