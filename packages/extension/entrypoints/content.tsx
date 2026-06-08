import { SessionManager } from "@/lib/scrobble/session";
import { customRecipes } from "@/lib/storage";
import { mountBadge } from "@/lib/ui/badge";
import { parseRecipes } from "@tmsync/shared";
// Versioned recipe list (Phase 1 source of truth). Validated via parseRecipes.
import rawRecipes from "../../../recipes/index.json";

/**
 * Content script — runs in EVERY frame of an enabled origin (allFrames). Owns
 * the watch-session state (constraint #4). Registered at runtime per origin
 * (constraint #5).
 *
 * The SessionManager handles the matcher/player split: the frame that matches a
 * recipe publishes the media for the tab; the frame that owns the <video> (which
 * may be a cross-origin player iframe) consumes it and scrobbles. The badge is
 * mounted only in the top frame.
 */
export default defineContentScript({
  matches: ["*://*/*"],
  registration: "runtime",
  allFrames: true,
  cssInjectionMode: "ui",
  async main(ctx) {
    const recipes = parseRecipes([
      ...(rawRecipes as unknown[]),
      ...(await customRecipes.getValue()),
    ]);

    if (window === window.top) await mountBadge(ctx);

    new SessionManager(ctx, recipes).start();
  },
});
