import type { ScrobbleAction } from "@/lib/trakt/types";
import type { ParsedMedia } from "@tmsync/shared";
import { defineExtensionMessaging } from "@webext-core/messaging";

export interface ScrobbleRequest {
  action: ScrobbleAction;
  media: ParsedMedia;
  /** 0–100. */
  progress: number;
}

export interface ScrobbleReply {
  ok: boolean;
  /** HTTP status from Trakt (when a call was made). */
  status?: number;
  /** False when the title couldn't be resolved against Trakt. */
  resolved: boolean;
  /** Trakt's echoed action; "scrobble" means it was added to history. */
  action?: "start" | "pause" | "scrobble";
  /** Why a scrobble failed, for the badge. */
  reason?: "not_connected" | "unresolved" | "no_episode" | "http";
}

export type BadgeState = "idle" | "watching" | "paused" | "scrobbled" | "stopped" | "error";

export interface BadgeStatus {
  state: BadgeState;
  /** e.g. "The Pixel Frontier S2E4". */
  title?: string;
  /** short human detail, e.g. "added to history" or "not connected". */
  detail?: string;
}

export interface TabMedia {
  media: ParsedMedia;
  videoSelector: string;
  /** Where the player lives: which frame should drive scrobbling. */
  frame: "auto" | "top" | "iframe";
}

export interface TraktStatus {
  connected: boolean;
  /** The redirect URI to register in the Trakt app (shown in the popup). */
  redirectUri: string;
}

/**
 * Typed content↔background↔popup contract. Background handlers are stateless and
 * read everything from storage on each call (constraint #4).
 */
export interface ProtocolMap {
  ping(): "pong";
  getTraktStatus(): TraktStatus;
  connectTrakt(): { ok: boolean; error?: string };
  disconnectTrakt(): void;
  scrobble(req: ScrobbleRequest): ScrobbleReply;
  /** Register the content script for an origin the user just granted access to. */
  registerSite(origin: string): { ok: boolean; error?: string };
  unregisterSite(origin: string): { ok: boolean };
  listEnabledSites(): string[];

  // --- per-tab session coordination (top frame ↔ player iframe ↔ background) ---
  /** The recipe-matching frame publishes the media so a cross-origin player iframe can pick it up. */
  publishMedia(data: TabMedia): void;
  /** A player iframe asks for the media the top frame published for this tab. */
  getTabMedia(): TabMedia | null;
  /** Playing frame reports latest progress (reconciliation safety net). */
  updateProgress(progress: number): void;
  /** Playing frame signals a clean stop so the background won't re-reconcile. */
  endSession(): void;
  /** Playing frame reports scrobble state; background relays to the top frame's badge. */
  reportScrobble(status: BadgeStatus): void;
  /** Background → top frame: update the badge. */
  scrobbleStatus(status: BadgeStatus): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
