import { type Recipe, RecipeSchema } from "./schema";

/**
 * Validate an untrusted recipe list (e.g. fetched JSON) against the schema.
 * Each entry is validated independently and a failing recipe is **discarded**,
 * never partially applied — so one malformed entry can't poison the whole list.
 */
export function parseRecipes(input: unknown): Recipe[] {
  if (!Array.isArray(input)) return [];
  const out: Recipe[] = [];
  for (const entry of input) {
    const result = RecipeSchema.safeParse(entry);
    if (result.success) out.push(result.data);
  }
  return out;
}
