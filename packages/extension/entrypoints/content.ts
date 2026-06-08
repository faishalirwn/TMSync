import { ScrobbleController } from "@/lib/scrobble/controller";
import { activeScrobble } from "@/lib/storage";
import { sendMessage } from "@/messaging";
import { type ParsedMedia, type Recipe, extract, parseRecipes, selectRecipe } from "@tmsync/shared";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
// Versioned recipe list (Phase 1 source of truth). Validated via parseRecipes.
import rawRecipes from "../../../recipes/index.json";

const PERSIST_INTERVAL_MS = 5000;

/**
 * Content script. Owns the watch-session state (constraint #4). Registered at
 * runtime per origin (constraint #5) — see background `registerSite`. Finds the
 * video, runs the recipe engine, and drives the scrobble state machine.
 */
export default defineContentScript({
  matches: ["*://*/*"],
  registration: "runtime",
  allFrames: true,
  main(ctx) {
    const engineCtx = { document, url: location.href };
    const recipe = selectRecipe(parseRecipes(rawRecipes), engineCtx);
    if (!recipe) return;

    const result = extract(recipe, engineCtx);
    if (!result.ok) {
      console.debug("[TMSync] couldn't read this page:", result.error);
      return;
    }
    whenVideo(recipe, ctx, (video) => attach(recipe, result.media, video, ctx));
  },
});

/** Resolve the recipe's video element now, or wait for it to appear (SPA players). */
function whenVideo(
  recipe: Recipe,
  ctx: ContentScriptContext,
  onFound: (video: HTMLVideoElement) => void,
): void {
  const find = () => document.querySelector<HTMLVideoElement>(recipe.video.selector);
  const existing = find();
  if (existing) {
    onFound(existing);
    return;
  }
  const observer = new MutationObserver(() => {
    const video = find();
    if (video) {
      observer.disconnect();
      onFound(video);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ctx.onInvalidated(() => observer.disconnect());
}

function attach(
  recipe: Recipe,
  media: ParsedMedia,
  video: HTMLVideoElement,
  ctx: ContentScriptContext,
): void {
  const controller = new ScrobbleController(video, (action, progress) => {
    void sendMessage("scrobble", { action, media, progress });
    if (action === "stop") void activeScrobble.setValue(null);
  });

  ctx.addEventListener(video, "play", () => controller.play());
  ctx.addEventListener(video, "pause", () => controller.pause());
  ctx.addEventListener(video, "ended", () => controller.ended());

  // Throttle-persist progress as a reconciliation safety net (constraint #4).
  let lastPersist = 0;
  ctx.addEventListener(video, "timeupdate", () => {
    const now = Date.now();
    if (now - lastPersist < PERSIST_INTERVAL_MS) return;
    lastPersist = now;
    void activeScrobble.setValue({ media, progress: controller.progress(), updatedAt: now });
  });

  // Leaving before `ended` (tab close / navigation) → reconciling stop.
  ctx.addEventListener(window, "pagehide", () => controller.leave());

  console.debug("[TMSync] scrobbling", recipe.name, media);
}
