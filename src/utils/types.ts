export interface MovieMediaInfo {
    type: string;
    score: number;
    movie: {
        title: string;
        year: number;
        ids: {
            trakt: number;
            slug: string;
            imdb: string;
            tmdb: number;
        };
    };
}

export interface ShowMediaInfo {
    type: string;
    score: number;
    show: {
        title: string;
        year: number;
        ids: {
            trakt: number;
            slug: string;
            tvdb: number;
            imdb: string;
            tmdb: number;
        };
    };
}

export interface ScrobbleBody {
    movie?: MovieMediaInfo['movie'];
    show?: ShowMediaInfo['show'];
    episode?: SeasonEpisodeObj;
    progress: number;
}

// Basic ID interfaces
interface TraktMovieIds {
    trakt?: number;
    slug?: string;
    imdb?: string;
    tmdb?: number;
}

interface TraktShowIds extends TraktMovieIds {
    tvdb?: number;
}

interface TraktSeasonIds {
    trakt?: number;
    tvdb?: number;
    tmdb?: number;
}

interface TraktEpisodeIds extends TraktSeasonIds {
    imdb?: string;
}

// Movie interfaces
interface HistoryMovie {
    watched_at?: string;
    title?: string;
    year?: number;
    ids: TraktMovieIds;
}

// Show interfaces
interface HistoryEpisode {
    watched_at?: string;
    number: number;
}

interface HistorySeason {
    watched_at?: string;
    number?: number;
    episodes?: HistoryEpisode[];
    ids?: TraktSeasonIds;
}

interface HistoryShow {
    title?: string;
    year?: number;
    ids: TraktShowIds;
    seasons?: HistorySeason[];
}

// Standalone season and episode interfaces
interface StandaloneSeason {
    watched_at?: string;
    ids: TraktSeasonIds;
}

interface StandaloneEpisode {
    watched_at?: string;
    ids: TraktEpisodeIds;
}

// Main history body interface
export interface HistoryBody {
    movies?: HistoryMovie[];
    shows?: HistoryShow[];
    seasons?: StandaloneSeason[];
    episodes?: StandaloneEpisode[];
}

// Request types sent from content script
export interface MediaInfoRequest {
    action: 'mediaInfo';
    params: {
        type: string;
        query: string;
        years: string;
    };
}

export interface ScrobbleRequest {
    action: 'scrobble';
    params: { progress: number };
}

export interface UndoScrobbleRequest {
    action: 'undoScrobble';
    params: { historyId: number };
}

export interface VideoMonitorRequest {
    action: 'videoMonitor';
    params?: { tabId: number };
}

// Define a union of all possible request types
export type MessageRequest =
    | MediaInfoRequest
    | ScrobbleRequest
    | UndoScrobbleRequest
    | VideoMonitorRequest;

// Define the response type
export interface MessageResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

// Response data types for specific actions
export type MediaInfoResponse = MovieMediaInfo | ShowMediaInfo;

export interface ScrobbleResponse {
    traktHistoryId: number;
}

export type HostnameType = 'www.cineby.app' | 'freek.to';

interface UrlMediaPath {
    pos: number;
    keywords: {
        movie: string;
        show: string;
    };
}

export interface SeasonEpisodeObj {
    season: number;
    number: number;
}

export interface MediaInfoConfig {
    getTitle(url: string): Promise<string | null>;
    getYear(url: string): Promise<string | null>;
    hostname: HostnameType;
    isWatchPage(url: string): boolean;
    isShowPage(url: string): boolean;
    urlMediaPath: UrlMediaPath;
    getMediaType(url: string): string;
    getUrlIdentifier(url: string): string;
    getSeasonEpisodeObj(url: string): SeasonEpisodeObj | null;
}

export type ConfigsType = {
    [key in HostnameType]: MediaInfoConfig;
};

export type ScrobbleNotificationMediaType =
    | MediaInfoResponse
    | (MediaInfoResponse & SeasonEpisodeObj);
