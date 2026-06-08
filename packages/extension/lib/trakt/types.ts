/** Trakt API types — only the fields TMSync uses. */

/** OAuth token set as returned by POST /oauth/token, plus our storage timestamp. */
export interface TraktTokens {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  /** Lifetime in seconds. */
  expires_in: number;
  /** Unix seconds when the token was issued (Trakt-provided). */
  created_at: number;
  scope: string;
}

export interface TraktIds {
  trakt: number;
  slug?: string;
  imdb?: string;
  tmdb?: number;
}

export interface TraktMovie {
  title: string;
  year?: number;
  ids: TraktIds;
}

export interface TraktShow {
  title: string;
  year?: number;
  ids: TraktIds;
}

/** One item from GET /search/movie,show. */
export interface TraktSearchResult {
  type: "movie" | "show" | "episode" | "person" | "list";
  score: number;
  movie?: TraktMovie;
  show?: TraktShow;
}

/**
 * A resolved Trakt identity, cached per scraped (type,title,year). For a show we
 * cache only the show's trakt id; the scraped season/episode are attached at
 * scrobble time (no absolute-numbering translation — constraint #2).
 */
export interface ResolvedIdentity {
  mediaType: "movie" | "show";
  traktId: number;
  title: string;
  year?: number;
}

/** A simplified search result for the correction picker. */
export interface TraktSearchOption {
  type: "movie" | "show";
  traktId: number;
  title: string;
  year?: number;
}

export type ScrobbleAction = "start" | "pause" | "stop";

/** Body for POST /scrobble/{start,pause,stop}. */
export type ScrobbleBody =
  | { movie: { ids: { trakt: number } }; progress: number }
  | {
      show: { ids: { trakt: number } };
      episode: { season: number; number: number };
      progress: number;
    };

/** Echoed by a successful scrobble call. `action: "scrobble"` means added to history. */
export interface ScrobbleResponse {
  id?: number;
  action: "start" | "pause" | "scrobble";
  progress: number;
}
