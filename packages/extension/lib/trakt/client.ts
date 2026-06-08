import { TRAKT } from "@/config";
import { corrections, resolutionCache } from "@/lib/storage";
import type { ParsedMedia } from "@tmsync/shared";
import { getValidAccessToken, refreshTokens } from "./auth";
import type {
  ResolvedIdentity,
  ScrobbleAction,
  ScrobbleBody,
  ScrobbleResponse,
  TraktSearchOption,
  TraktSearchResult,
} from "./types";
import { resolutionCacheKey } from "./util";

export class TraktNotConnectedError extends Error {
  constructor() {
    super("Not connected to Trakt");
    this.name = "TraktNotConnectedError";
  }
}

function baseHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "trakt-api-version": TRAKT.apiVersion,
    "trakt-api-key": TRAKT.clientId,
    "User-Agent": TRAKT.userAgent,
  };
}

interface ApiInit {
  method?: "GET" | "POST";
  body?: string;
}

/**
 * Fetch a Trakt API path with the standard headers. Attaches the bearer token
 * when connected; on a 401 it refreshes once and retries. `requireAuth` throws
 * when there's no token (used by scrobble, which is meaningless unauthenticated).
 */
async function api(path: string, init: ApiInit = {}, requireAuth = false): Promise<Response> {
  let token = await getValidAccessToken();
  if (requireAuth && !token) throw new TraktNotConnectedError();

  const send = (t: string | null) =>
    fetch(`${TRAKT.apiBase}${path}`, {
      method: init.method ?? "GET",
      body: init.body,
      headers: t ? { ...baseHeaders(), Authorization: `Bearer ${t}` } : baseHeaders(),
    });

  let res = await send(token);
  if (res.status === 401 && token) {
    token = (await refreshTokens())?.access_token ?? null;
    if (token) res = await send(token);
  }
  return res;
}

/**
 * Resolve scraped media to a Trakt identity (cached). For shows we resolve the
 * show only; season/episode are attached at scrobble time. `years` disambiguates
 * movies. Returns null if nothing matches.
 */
export async function resolve(media: ParsedMedia): Promise<ResolvedIdentity | null> {
  const key = resolutionCacheKey(media);

  // A user correction is authoritative — never overridden by search.
  const correction = (await corrections.getValue())[key];
  if (correction) return correction;

  const cache = await resolutionCache.getValue();
  const cached = cache[key];
  if (cached) return cached;

  const type: "movie" | "show" =
    media.season !== undefined || media.episode !== undefined ? "show" : media.mediaType;

  const query = new URLSearchParams({ query: media.title });
  // Year filters results, so only use it for movies — a scraped show "year"
  // is often the wrong (non-first-aired) year and would filter out the match.
  if (type === "movie" && media.year !== undefined) query.set("years", String(media.year));

  const res = await api(`/search/${type}?${query.toString()}`);
  if (!res.ok) return null;

  const results = (await res.json()) as TraktSearchResult[];
  const hit = results.find((r) => r.type === type);
  const obj = type === "movie" ? hit?.movie : hit?.show;
  if (!obj) return null;

  const identity: ResolvedIdentity = {
    mediaType: type,
    traktId: obj.ids.trakt,
    title: obj.title,
    year: obj.year,
  };
  await resolutionCache.setValue({ ...cache, [key]: identity });
  return identity;
}

/** Free-text Trakt search for the correction picker. */
export async function search(query: string, type?: "movie" | "show"): Promise<TraktSearchOption[]> {
  if (!query.trim()) return [];
  const res = await api(`/search/${type ?? "movie,show"}?query=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const results = (await res.json()) as TraktSearchResult[];
  const options: TraktSearchOption[] = [];
  for (const r of results) {
    const obj = r.type === "movie" ? r.movie : r.type === "show" ? r.show : undefined;
    if (obj && (r.type === "movie" || r.type === "show")) {
      options.push({ type: r.type, traktId: obj.ids.trakt, title: obj.title, year: obj.year });
    }
  }
  return options;
}

export interface ScrobbleOutcome {
  ok: boolean;
  status: number;
  /** Trakt's echoed action; "scrobble" means it was added to history. */
  action?: ScrobbleResponse["action"];
}

/** POST /scrobble/{action}. A 409 ("already scrobbling") is treated as a no-op success. */
export async function scrobble(
  action: ScrobbleAction,
  body: ScrobbleBody,
): Promise<ScrobbleOutcome> {
  const res = await api(
    `/scrobble/${action}`,
    { method: "POST", body: JSON.stringify(body) },
    true,
  );
  if (res.status === 409) return { ok: true, status: 409 };
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as ScrobbleResponse;
  return { ok: true, status: res.status, action: data.action };
}
