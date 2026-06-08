import { type BadgeStatus, type ScrobbleReply, sendMessage } from "@/messaging";
import { type ParsedMedia, type Recipe, extract, selectRecipe } from "@tmsync/shared";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { ScrobbleController } from "./controller";

const RECONCILE_DEBOUNCE_MS = 600;
const PROGRESS_PERSIST_MS = 5000;
const TAB_MEDIA_POLL_MS = 750;
const TAB_MEDIA_POLL_TRIES = 8;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mediaKey(m: ParsedMedia): string {
  return `${m.mediaType}:${m.title}:${m.season ?? ""}:${m.episode ?? ""}`;
}

function label(m: ParsedMedia): string {
  const ep = m.season !== undefined ? ` S${m.season}E${m.episode ?? "?"}` : "";
  const yr = m.year ? ` (${m.year})` : "";
  return `${m.title}${ep}${yr}`;
}

function statusFromReply(
  action: "start" | "pause" | "stop",
  reply: ScrobbleReply,
  m: ParsedMedia,
): BadgeStatus {
  const title = label(m);
  if (reply.ok) {
    if (action === "start") return { state: "watching", title };
    if (action === "pause") return { state: "paused", title };
    return reply.action === "scrobble"
      ? { state: "scrobbled", title, detail: "added to history" }
      : { state: "stopped", title };
  }
  const detail =
    reply.reason === "not_connected"
      ? "connect Trakt"
      : reply.reason === "unresolved"
        ? "not found on Trakt"
        : reply.reason === "no_episode"
          ? "missing episode #"
          : "scrobble failed";
  return { state: "error", title, detail };
}

/** Patch history once per frame so SPA navigations emit a window event. */
let historyPatched = false;
function ensureLocationChangeEvents(): void {
  if (historyPatched) return;
  historyPatched = true;
  const fire = () => window.dispatchEvent(new Event("tmsync:locationchange"));
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function patched(this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      fire();
      return result;
    } as History[typeof method];
  }
  window.addEventListener("popstate", fire);
}

/**
 * Per-frame watch-session manager. Handles the three roles a frame can play:
 *  - matcher: this frame matches a recipe → extract + publish media for the tab
 *    (so a cross-origin player iframe can consume it) and seed the badge.
 *  - player: this frame owns the <video> → resolve media (its own or pulled from
 *    the tab) and drive the scrobble state machine.
 *  - both (no iframe): the common case.
 * Re-reconciles on SPA navigation and on the video loading new media.
 */
export class SessionManager {
  private localMedia: ParsedMedia | null = null;
  private videoSelector = "video";
  private currentKey: string | null = null;
  private currentVideo: HTMLVideoElement | null = null;
  private controller: ScrobbleController | null = null;
  private abort: AbortController | null = null;
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private videoObserver: MutationObserver | null = null;

  constructor(
    private readonly ctx: ContentScriptContext,
    private readonly recipes: Recipe[],
  ) {}

  start(): void {
    ensureLocationChangeEvents();
    window.addEventListener("tmsync:locationchange", this.scheduleReconcile, {
      signal: this.frameSignal(),
    });
    this.ctx.onInvalidated(() => this.teardownSession());
    void this.reconcile();
  }

  /** AbortSignal tied to the content-script lifetime (frame-level listeners). */
  private frameSignal(): AbortSignal {
    const ac = new AbortController();
    this.ctx.onInvalidated(() => ac.abort());
    return ac.signal;
  }

  private scheduleReconcile = (): void => {
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.reconcileTimer = setTimeout(() => void this.reconcile(), RECONCILE_DEBOUNCE_MS);
  };

  private async reconcile(): Promise<void> {
    await this.matchAndPublish();
    await this.ensurePlaying();
  }

  /** If this frame matches a recipe, extract + publish the media and seed the badge. */
  private async matchAndPublish(): Promise<void> {
    const engineCtx = { document, url: location.href };
    const recipe = selectRecipe(this.recipes, engineCtx);
    if (!recipe) {
      this.localMedia = null;
      return;
    }
    const result = extract(recipe, engineCtx);
    if (!result.ok) {
      this.localMedia = null;
      return;
    }
    this.localMedia = result.media;
    this.videoSelector = recipe.video.selector;
    await sendMessage("publishMedia", {
      media: result.media,
      videoSelector: recipe.video.selector,
    });
    await sendMessage("reportScrobble", { state: "idle", title: label(result.media) });
  }

  private findVideo(): HTMLVideoElement | null {
    return (
      document.querySelector<HTMLVideoElement>(this.videoSelector) ??
      document.querySelector<HTMLVideoElement>("video")
    );
  }

  private async pullTabMedia(): Promise<ParsedMedia | null> {
    for (let i = 0; i < TAB_MEDIA_POLL_TRIES; i++) {
      const tab = await sendMessage("getTabMedia", undefined);
      if (tab) {
        this.videoSelector = tab.videoSelector;
        return tab.media;
      }
      await sleep(TAB_MEDIA_POLL_MS);
    }
    return null;
  }

  /** Find the video and start a session for the resolved media (its own or the tab's). */
  private async ensurePlaying(): Promise<void> {
    const video = this.findVideo();
    if (!video) {
      this.observeForVideo();
      return;
    }
    const media = this.localMedia ?? (await this.pullTabMedia());
    if (!media) return;

    const key = mediaKey(media);
    if (this.abort && key === this.currentKey && this.currentVideo === video) return; // already running

    this.startSession(video, media);
  }

  private observeForVideo(): void {
    if (this.videoObserver) return;
    this.videoObserver = new MutationObserver(() => {
      if (this.findVideo()) {
        this.videoObserver?.disconnect();
        this.videoObserver = null;
        void this.ensurePlaying();
      }
    });
    this.videoObserver.observe(document.documentElement, { childList: true, subtree: true });
    this.ctx.onInvalidated(() => this.videoObserver?.disconnect());
  }

  private startSession(video: HTMLVideoElement, media: ParsedMedia): void {
    this.teardownSession();

    const abort = new AbortController();
    this.abort = abort;
    this.currentVideo = video;
    this.currentKey = mediaKey(media);

    const controller = new ScrobbleController(video, (action, progress) => {
      void sendMessage("scrobble", { action, media, progress }).then((reply) =>
        sendMessage("reportScrobble", statusFromReply(action, reply, media)),
      );
      if (action === "stop") void sendMessage("endSession");
      else void sendMessage("updateProgress", progress);
    });
    this.controller = controller;

    const on = (target: EventTarget, type: string, fn: () => void) =>
      target.addEventListener(type, fn, { signal: abort.signal });

    on(video, "play", () => controller.play());
    on(video, "pause", () => controller.pause());
    on(video, "ended", () => controller.ended());
    // New media loaded into the same element (SPA episode swap) → reconcile.
    on(video, "loadstart", this.scheduleReconcile);
    on(window, "pagehide", () => controller.leave());

    let lastPersist = 0;
    on(video, "timeupdate", () => {
      const now = Date.now();
      if (now - lastPersist < PROGRESS_PERSIST_MS) return;
      lastPersist = now;
      void sendMessage("updateProgress", controller.progress());
    });

    // If playback is already underway when we attach (late injection), kick a start.
    if (!video.paused && !video.ended) controller.play();
  }

  private teardownSession(): void {
    // Emit a stop for the outgoing session (SPA episode swap, nav away) before
    // dropping its listeners. ScrobbleController.leave() is idempotent.
    this.controller?.leave();
    this.controller = null;
    if (this.abort) {
      this.abort.abort(); // remove this session's listeners
      this.abort = null;
    }
    this.currentVideo = null;
    this.currentKey = null;
  }
}
