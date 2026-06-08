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
type PlayerFrame = "auto" | "top" | "iframe";

export class SessionManager {
  private localMedia: ParsedMedia | null = null;
  private videoSelector = "video";
  private frame: PlayerFrame = "auto";
  private framesObserver: MutationObserver | null = null;
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

  private get isTop(): boolean {
    return window === window.top;
  }

  start(): void {
    ensureLocationChangeEvents();
    window.addEventListener("tmsync:locationchange", this.scheduleReconcile, {
      signal: this.frameSignal(),
    });
    this.ctx.onInvalidated(() => this.teardownSession());
    void this.reconcile();
    if (this.isTop) this.watchPlayerFrames();
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
    this.frame = recipe.video.frame;
    await sendMessage("publishMedia", {
      media: result.media,
      videoSelector: recipe.video.selector,
      frame: recipe.video.frame,
    });
    await sendMessage("reportScrobble", { state: "idle", title: label(result.media) });
  }

  /**
   * The first <video> that isn't a muted, looping background trailer (common on
   * movie landing pages). Falls back to any video if all look like trailers.
   */
  private findVideo(): HTMLVideoElement | null {
    const seen = new Set<HTMLVideoElement>();
    const candidates: HTMLVideoElement[] = [];
    for (const sel of [this.videoSelector, "video"]) {
      for (const v of document.querySelectorAll<HTMLVideoElement>(sel)) {
        if (!seen.has(v)) {
          seen.add(v);
          candidates.push(v);
        }
      }
    }
    return candidates.find((v) => !(v.loop && v.muted)) ?? candidates[0] ?? null;
  }

  private async pullTabMedia(): Promise<{ media: ParsedMedia; frame: PlayerFrame } | null> {
    for (let i = 0; i < TAB_MEDIA_POLL_TRIES; i++) {
      const tab = await sendMessage("getTabMedia", undefined);
      if (tab) {
        this.videoSelector = tab.videoSelector;
        return { media: tab.media, frame: tab.frame };
      }
      await sleep(TAB_MEDIA_POLL_MS);
    }
    return null;
  }

  /** Find the video and start a session for the resolved media (its own or the tab's). */
  private async ensurePlaying(): Promise<void> {
    let media = this.localMedia;
    let frame: PlayerFrame = this.frame;
    if (!media) {
      const tab = await this.pullTabMedia();
      if (!tab) return;
      media = tab.media;
      frame = tab.frame;
    }

    // Frame gating: don't let the wrong frame scrobble (e.g. the top frame's
    // background trailer when the real player is in an iframe).
    if (this.isTop && frame === "iframe") return;
    if (!this.isTop && frame === "top") return;

    const video = this.findVideo();
    if (!video) {
      this.observeForVideo();
      return;
    }

    const key = mediaKey(media);
    if (this.abort && key === this.currentKey && this.currentVideo === video) return; // already running

    this.startSession(video, media);
  }

  /**
   * Top-frame only: watch for cross-origin player iframes. If one appears whose
   * origin we haven't been granted/registered, push an actionable badge hint —
   * the player can't be scrobbled until the user enables that origin. This is the
   * main feedback channel on sites where the console is unavailable.
   */
  private watchPlayerFrames(): void {
    const scan = async () => {
      // Only when the recipe says the player is in an iframe — avoids false hints
      // from ad/analytics iframes on ordinary sites.
      if (this.frame !== "iframe") return;
      const origins = this.crossOriginIframeOrigins();
      if (origins.length === 0) return;
      const enabled = new Set(await sendMessage("listEnabledSites", undefined));
      // If any cross-origin frame is already enabled, the player is set up — the
      // rest are almost certainly ads; stay quiet.
      if (origins.some((o) => enabled.has(o))) return;
      await sendMessage("reportScrobble", {
        state: "error",
        title: this.localMedia ? label(this.localMedia) : undefined,
        detail: `enable player frame in TMSync popup: ${origins.join(", ")}`,
      });
    };
    void scan();
    this.framesObserver = new MutationObserver(() => void scan());
    this.framesObserver.observe(document.documentElement, { childList: true, subtree: true });
    this.ctx.onInvalidated(() => this.framesObserver?.disconnect());
  }

  private crossOriginIframeOrigins(): string[] {
    const set = new Set<string>();
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        const u = new URL((frame as HTMLIFrameElement).src, location.href);
        if ((u.protocol === "http:" || u.protocol === "https:") && u.origin !== location.origin) {
          set.add(u.origin);
        }
      } catch {
        // empty/relative/unparseable src — skip
      }
    }
    return [...set];
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
