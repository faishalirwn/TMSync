import { onMessage } from "@/messaging";

/**
 * MV3 service worker. STATELESS by constraint #4: no watch-session state, no
 * timers, no buffers held here. Everything needed is read from `storage` on each
 * wake. Handlers below are stubs for this milestone (no Trakt yet).
 */
export default defineBackground(() => {
  onMessage("ping", () => "pong" as const);
  onMessage("resolveMedia", () => ({ status: "not-implemented" as const }));
});
