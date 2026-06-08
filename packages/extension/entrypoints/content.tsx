import { loadRecipes } from "@/lib/recipes";
import { SessionManager } from "@/lib/scrobble/session";
import { mountBadge } from "@/lib/ui/badge";

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
    const recipes = await loadRecipes();

    if (window === window.top) await mountBadge(ctx);

    new SessionManager(ctx, recipes).start();
  },
});
