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

// --- RATING TYPES: MODIFIED ---
export interface IndividualRating {
    userRating: number | null;
    ratedAt?: string;
}

export interface MediaRatings {
    show?: IndividualRating; // For a movie, this holds the movie's rating
    season?: IndividualRating;
    episode?: IndividualRating;
}
// --- END MODIFICATION ---

export interface MediaStatusPayload {
    mediaInfo: MediaInfoResponse | null;
    originalQuery: { type: string; query: string; years: string };
    confidence: 'high' | 'low';
    watchStatus?: WatchStatusInfo;
    progressInfo?: TraktShowWatchedProgress | null;
    ratingInfo?: MediaRatings; // <-- UPDATED
}

export interface RequestScrobbleStartParams {
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
    progress: number;
}
export interface RequestScrobbleStartRequest {
    action: 'requestScrobbleStart';
    params: RequestScrobbleStartParams;
}

export interface RequestScrobblePauseParams {
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
    progress: number;
}
export interface RequestScrobblePauseRequest {
    action: 'requestScrobblePause';
    params: RequestScrobblePauseParams;
}

export interface RequestScrobbleStopParams {
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
    progress: number;
}
export interface RequestScrobbleStopRequest {
    action: 'requestScrobbleStop';
    params: RequestScrobbleStopParams;
}

export interface ScrobbleStopResponseData {
    traktHistoryId?: number;
    action: 'watched' | 'paused_incomplete' | 'error';
}

export interface RequestManualAddToHistoryParams {
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
}
export interface RequestManualAddToHistoryRequest {
    action: 'requestManualAddToHistory';
    params: RequestManualAddToHistoryParams;
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

// --- RATING REQUESTS: MODIFIED ---
export interface RateShowRequest {
    action: 'rateShow';
    params: { mediaInfo: ShowMediaInfo; rating: number };
}
export interface RateMovieRequest {
    action: 'rateMovie';
    params: { mediaInfo: MovieMediaInfo; rating: number };
}
export interface RateSeasonRequest {
    action: 'rateSeason';
    params: {
        mediaInfo: ShowMediaInfo;
        episodeInfo: SeasonEpisodeObj;
        rating: number;
    };
}
export interface RateEpisodeRequest {
    action: 'rateEpisode';
    params: {
        mediaInfo: ShowMediaInfo;
        episodeInfo: SeasonEpisodeObj;
        rating: number;
    };
}
// --- END MODIFICATION ---

export type MessageRequest =
    | MediaInfoRequest
    | ScrobbleRequest
    | UndoScrobbleRequest
    | VideoMonitorRequest
    | ManualSearchRequest
    | ConfirmMediaRequest
    | RequestScrobbleStartRequest
    | RequestScrobblePauseRequest
    | RequestScrobbleStopRequest
    | RequestManualAddToHistoryRequest
    // --- ADDED NEW REQUESTS ---
    | RateShowRequest
    | RateMovieRequest
    | RateSeasonRequest
    | RateEpisodeRequest;

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

export type ActiveScrobbleStatus = 'idle' | 'started' | 'paused';

export interface ActiveScrobbleState {
    tabId: number | null;
    mediaInfo: MediaInfoResponse | null;
    episodeInfo?: SeasonEpisodeObj | null;
    currentProgress: number;
    status: ActiveScrobbleStatus;
    traktMediaType: 'movie' | 'episode' | null;
    lastUpdateTime: number;
    previousScrobbledUrl?: string;
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
