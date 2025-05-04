import './traktApi';
import { TraktShowWatchedProgress } from './traktApi';

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

interface HistoryMovie {
    watched_at?: string;
    title?: string;
    year?: number;
    ids: TraktMovieIds;
}

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

interface StandaloneSeason {
    watched_at?: string;
    ids: TraktSeasonIds;
}

interface StandaloneEpisode {
    watched_at?: string;
    ids: TraktEpisodeIds;
}

export interface HistoryBody {
    movies?: HistoryMovie[];
    shows?: HistoryShow[];
    seasons?: StandaloneSeason[];
    episodes?: StandaloneEpisode[];
}

export interface TraktRating {
    rated_at: string;
    rating: number;
    type: 'movie' | 'show' | 'season' | 'episode';
}

export interface WatchStatusInfo {
    isInHistory: boolean;
    lastWatchedAt?: string;
    isCompleted?: boolean;
}

export interface RatingInfo {
    userRating: number | null;
    ratedAt?: string;
}

export interface MediaStatusPayload {
    mediaInfo: MediaInfoResponse | null;
    originalQuery: { type: string; query: string; years: string };
    confidence: 'high' | 'low';
    watchStatus?: WatchStatusInfo;
    progressInfo?: TraktShowWatchedProgress | null;
    ratingInfo?: RatingInfo;
}

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

export interface ManualSearchRequest {
    action: 'manualSearch';
    params: {
        type: string;
        query: string;
    };
}

export interface ConfirmMediaRequest {
    action: 'confirmMedia';
    params: MediaInfoResponse;
}

export interface RateItemRequest {
    action: 'rateItem';
    params: {
        mediaInfo: MediaInfoResponse; // Info to identify the item
        rating: number; // The rating (1-10)
    };
}

export type MessageRequest =
    | MediaInfoRequest
    | ScrobbleRequest
    | UndoScrobbleRequest
    | VideoMonitorRequest
    | ManualSearchRequest
    | ConfirmMediaRequest
    | RateItemRequest; // <-- Add RateItemRequest
export interface MessageResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export type MediaInfoResponse = MovieMediaInfo | ShowMediaInfo;

export interface ScrobbleResponse {
    traktHistoryId: number;
}

export type MediaInfoMessageResponse = MessageResponse<MediaStatusPayload>;

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
