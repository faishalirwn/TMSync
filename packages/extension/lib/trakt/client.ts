import { TRAKT } from "@/config";
import { corrections, resolutionCache } from "@/lib/storage";
import type { ParsedMedia } from "@tmsync/shared";
import { getValidAccessToken, refreshTokens } from "./auth";
import type {
  RatingSyncBody,
  ResolvedIdentity,
  ReviewLevel,
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
  method?: "GET" | "POST" | "PUT" | "DELETE";
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
  /** Trakt's error body on failure (truncated) — surfaced for diagnosis. */
  error?: string;
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
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).trim().slice(0, 120);
    } catch {
      // ignore unreadable body
    }
    return { ok: false, status: res.status, error: detail || undefined };
  }
  const data = (await res.json()) as ScrobbleResponse;
  return { ok: true, status: res.status, action: data.action };
}

// --- ratings (1–10) ---

/** POST /sync/ratings (set) or /sync/ratings/remove. Returns ok + status. */
export async function rate(
  body: RatingSyncBody,
  remove = false,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await api(
    `/sync/ratings${remove ? "/remove" : ""}`,
    { method: "POST", body: JSON.stringify(body) },
    true,
  );
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).trim().slice(0, 120);
    } catch {
      // ignore unreadable body
    }
    return { ok: false, status: res.status, error: detail || undefined };
  }
  return { ok: true, status: res.status };
}

// --- comments (managed as the user's single editable note per item) ---

/** Trakt comment object (only the fields we use). */
interface TraktComment {
  id: number;
  comment: string;
  spoiler: boolean;
}

/** The item a comment attaches to. Season/episode need their OWN trakt ids. */
type CommentItem =
  | { movie: { ids: { trakt: number } } }
  | { show: { ids: { trakt: number } } }
  | { season: { ids: { trakt: number } } }
  | { episode: { ids: { trakt: number } } };

/**
 * Resolve the item reference for a comment. Movie/show use the resolved id we
 * already have; season/episode need a lookup (Trakt comments require the item's
 * own trakt id, unlike ratings). Returns null if the lookup fails.
 */
export async function commentItem(
  identity: ResolvedIdentity,
  level: ReviewLevel,
  season?: number,
  episode?: number,
): Promise<CommentItem | null> {
  if (level === "movie") return { movie: { ids: { trakt: identity.traktId } } };
  if (level === "show") return { show: { ids: { trakt: identity.traktId } } };
  if (season === undefined) return null;
  if (level === "season") {
    const res = await api(`/shows/${identity.traktId}/seasons`);
    if (!res.ok) return null;
    const seasons = (await res.json()) as { number: number; ids: { trakt: number } }[];
    const hit = seasons.find((s) => s.number === season);
    return hit ? { season: { ids: { trakt: hit.ids.trakt } } } : null;
  }
  if (episode === undefined) return null;
  const res = await api(`/shows/${identity.traktId}/seasons/${season}/episodes/${episode}`);
  if (!res.ok) return null;
  const ep = (await res.json()) as { ids: { trakt: number } };
  return { episode: { ids: { trakt: ep.ids.trakt } } };
}

/** POST /comments — create a comment. Returns the new comment id. */
export async function postComment(
  item: CommentItem,
  comment: string,
  spoiler: boolean,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const res = await api(
    "/comments",
    { method: "POST", body: JSON.stringify({ ...item, comment, spoiler }) },
    true,
  );
  if (!res.ok) return { ok: false, error: await errorDetail(res) };
  const data = (await res.json()) as TraktComment;
  return { ok: true, id: data.id };
}

/** PUT /comments/{id} — edit an existing comment. */
export async function updateComment(
  id: number,
  comment: string,
  spoiler: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api(
    `/comments/${id}`,
    { method: "PUT", body: JSON.stringify({ comment, spoiler }) },
    true,
  );
  return res.ok ? { ok: true } : { ok: false, error: await errorDetail(res) };
}

/** DELETE /comments/{id}. A 404 means it's already gone — treat as success. */
export async function deleteComment(id: number): Promise<{ ok: boolean; error?: string }> {
  const res = await api(`/comments/${id}`, { method: "DELETE" }, true);
  if (res.ok || res.status === 404) return { ok: true };
  return { ok: false, error: await errorDetail(res) };
}

async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    return (await res.text()).trim().slice(0, 160) || undefined;
  } catch {
    return undefined;
  }
}
