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
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
