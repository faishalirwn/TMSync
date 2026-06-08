/**
 * Static Trakt configuration. Credentials come from `.env` (WXT_* vars, inlined
 * at build — see .env for the secret-in-bundle note). Endpoints/headers per the
 * Trakt API docs.
 */
export const TRAKT = {
  clientId: import.meta.env.WXT_TRAKT_CLIENT_ID,
  clientSecret: import.meta.env.WXT_TRAKT_CLIENT_SECRET,
  /** API host (data). Requires a matching host permission in the manifest. */
  apiBase: "https://api.trakt.tv",
  /** Web host (OAuth authorize page, opened via launchWebAuthFlow). */
  authBase: "https://trakt.tv",
  apiVersion: "2",
  /** Sent on every request. Browsers may drop User-Agent on fetch; harmless if so. */
  userAgent: "tmsync/1.0",
} as const;
