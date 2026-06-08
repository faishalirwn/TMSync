import type { ScrobbleAction } from "@/lib/trakt/types";
import { clampProgress } from "@/lib/trakt/util";

/** Minimal view of the media element the controller needs (eases testing). */
export interface VideoLike {
  currentTime: number;
  duration: number;
  ended: boolean;
}

export type SendScrobble = (action: ScrobbleAction, progress: number) => void;

/**
 * Watch-session state machine (content-side, constraint #4 owns state here).
 *
 * Rules (per CLAUDE.md "Scrobble rules"):
 * - One `start` per session; debounce play/pause bursts (seeking, ad breaks).
 * - Idempotent: never emit the same action twice in a row.
 * - `ended` → stop(~100). Leaving before `ended` → stop(last progress).
 * - A pause at/after `watchedThreshold` becomes a `stop`: Trakt rejects a pause
 *   that late ("use stop to scrobble"), and a pause this near the end means the
 *   user finished — so we commit it to history. Trakt still owns the ≥80%
 *   watched decision on the stop; this only chooses stop-vs-pause for the late
 *   "treat as finished here" point (per CLAUDE.md `video.watchedThreshold`).
 */
export class ScrobbleController {
  private started = false;
  private stopped = false;
  private lastAction: ScrobbleAction | null = null;
  private pending: ScrobbleAction | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly video: VideoLike,
    private readonly send: SendScrobble,
    /** 0–1; a pause at/after this fraction is sent as a stop. Default 0.8. */
    private readonly watchedThreshold = 0.8,
    private readonly debounceMs = 800,
  ) {}

  /** Current playback progress as a 0–100 percent. */
  progress(): number {
    const { currentTime, duration } = this.video;
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return clampProgress((currentTime / duration) * 100);
  }

  play(): void {
    this.schedule("start");
  }

  pause(): void {
    // `ended` fires a pause too; ignore it (the stop is handled by ended()).
    if (!this.video.ended) this.schedule("pause");
  }

  ended(): void {
    this.clearTimer();
    this.pending = null;
    this.emitStop(100);
  }

  /** Leaving before `ended` — tab close, SPA nav, or video element removed. */
  leave(): void {
    this.clearTimer();
    this.pending = null;
    if (this.started) this.emitStop(this.progress());
  }

  private schedule(action: ScrobbleAction): void {
    if (this.stopped) return;
    this.pending = action;
    this.clearTimer();
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  private flush(): void {
    this.timer = null;
    if (this.stopped) return;
    const action = this.pending;
    this.pending = null;
    if (!action) return;
    if (action === "pause" && !this.started) return; // nothing started to pause
    // A pause past the "finished here" point → stop (commit to history, dodge the
    // 422 Trakt returns for a late pause).
    if (action === "pause" && this.progress() >= this.watchedThreshold * 100) {
      this.emitStop(this.progress());
      return;
    }
    if (action === this.lastAction) return; // idempotent
    this.dispatch(action, this.progress());
    if (action === "start") this.started = true;
  }

  private emitStop(progress: number): void {
    if (this.stopped) return;
    this.dispatch("stop", progress);
    this.stopped = true;
  }

  private dispatch(action: ScrobbleAction, progress: number): void {
    this.lastAction = action;
    this.send(action, progress);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
