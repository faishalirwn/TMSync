import { extract, parseRecipes, selectRecipe } from "@tmsync/shared";
// Versioned recipe list (Phase 1 source of truth). Validated through the Zod
// schema at runtime via parseRecipes — never trusted as-is.
import rawRecipes from "../../../recipes/index.json";

/**
 * Content script. Owns watch-session state (constraint #4) and runs the recipe
 * engine against the live page.
 *
 * `registration: "runtime"` keeps this OUT of the manifest's content_scripts so
 * we ship NO broad host access at install (constraint #5). It is registered per
 * origin via chrome.scripting.registerContentScripts after a user grants
 * permission — that flow is a later milestone. For now this entrypoint only
 * builds the engine wiring and logs what it would scrobble.
 */
export default defineContentScript({
  matches: ["*://*/*"],
  registration: "runtime",
  allFrames: true,
  main() {
    const recipes = parseRecipes(rawRecipes);
    const ctx = { document, url: location.href };

    const recipe = selectRecipe(recipes, ctx);
    if (!recipe) return;

    const result = extract(recipe, ctx);
    if (!result.ok) {
      console.debug("[TMSync] couldn't read this page:", result.error);
      return;
    }
    console.debug("[TMSync] matched", recipe.name, "→", result.media);
  },
});
