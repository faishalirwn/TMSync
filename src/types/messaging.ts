// Defines the request/response protocol between different parts of the extension.

import {
    MediaInfoResponse,
    MediaRatings,
    SeasonEpisodeObj,
    ShowMediaInfo,
    MovieMediaInfo,
    CommentableType
} from './media';
import { WatchStatusInfo } from './scrobbling';
import { TraktShowWatchedProgress, TraktComment } from './trakt';
import { ServiceProgressInfo, ServiceMediaRatings } from './serviceTypes';

// --- Payloads ---
export interface MediaStatusPayload {
    mediaInfo: MediaInfoResponse | null;
    originalQuery: { type: string; query: string; years: string };
    confidence: 'high' | 'low';
    watchStatus?: WatchStatusInfo;
    progressInfo?: ServiceProgressInfo | null;
    ratingInfo?: ServiceMediaRatings;
}

// --- Requests ---
export interface RequestScrobbleStartParams {
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
    progress: number;
}
export interface RequestScrobblePauseParams {
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
    progress: number;
}
export interface RequestScrobbleStopParams {
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
    progress: number;
}
export interface RequestManualAddToHistoryParams {
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
}
export interface MediaInfoRequestParams {
    type: string;
    query: string;
    years: string;
}
export interface ManualSearchParams {
    type: string;
    query: string;
}
export interface UndoScrobbleParams {
    historyId: number;
}
export interface RateMovieParams {
    mediaInfo: MovieMediaInfo;
    rating: number;
}
export interface RateShowParams {
    mediaInfo: ShowMediaInfo;
    rating: number;
}
export interface RateSeasonParams {
    mediaInfo: ShowMediaInfo;
    episodeInfo: SeasonEpisodeObj;
    rating: number;
}
export interface RateEpisodeParams {
    mediaInfo: ShowMediaInfo;
    episodeInfo: SeasonEpisodeObj;
    rating: number;
}
export interface GetCommentsParams {
    type: CommentableType;
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
}
export interface PostCommentParams {
    type: CommentableType;
    mediaInfo: MediaInfoResponse;
    episodeInfo?: SeasonEpisodeObj;
    comment: string;
    spoiler: boolean;
}
export interface UpdateCommentParams {
    commentId: number | string;
    comment: string;
    spoiler: boolean;
}
export interface DeleteCommentParams {
    commentId: number | string;
}

export type MessageRequest =
    | { action: 'mediaInfo'; params: MediaInfoRequestParams }
    | { action: 'manualSearch'; params: ManualSearchParams }
    | { action: 'confirmMedia'; params: MediaInfoResponse }
    | { action: 'requestScrobbleStart'; params: RequestScrobbleStartParams }
    | { action: 'requestScrobblePause'; params: RequestScrobblePauseParams }
    | { action: 'requestScrobbleStop'; params: RequestScrobbleStopParams }
    | {
          action: 'requestManualAddToHistory';
          params: RequestManualAddToHistoryParams;
      }
    | { action: 'undoScrobble'; params: UndoScrobbleParams }
    | { action: 'rateMovie'; params: RateMovieParams }
    | { action: 'rateShow'; params: RateShowParams }
    | { action: 'rateSeason'; params: RateSeasonParams }
    | { action: 'rateEpisode'; params: RateEpisodeParams }
    | { action: 'getComments'; params: GetCommentsParams }
    | { action: 'postComment'; params: PostCommentParams }
    | { action: 'updateComment'; params: UpdateCommentParams }
    | { action: 'deleteComment'; params: DeleteCommentParams };

// --- Responses ---
export interface MessageResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface ScrobbleResponse {
    traktHistoryId: number;
}

export type MediaInfoMessageResponse = MessageResponse<MediaStatusPayload>;
