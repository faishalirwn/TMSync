import type { ParsedMedia } from "@tmsync/shared";
import { defineExtensionMessaging } from "@webext-core/messaging";

/**
 * Typed content↔background↔options message contract. This is the seam between
 * the (stateful) content script and the (stateless) background service worker.
 * Handlers are stubbed for this milestone; Trakt resolution/scrobbling land later.
 */
export interface ProtocolMap {
  /** Liveness check. */
  ping(): "pong";
  /** Resolve scraped media to Trakt IDs (background → Trakt search). Stubbed for now. */
  resolveMedia(media: ParsedMedia): { status: "not-implemented" };
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
