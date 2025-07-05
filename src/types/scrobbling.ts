// Contains types specific to the scrobbling state machine and UI.

import { MediaInfoResponse, SeasonEpisodeObj } from './media';

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

export interface WatchStatusInfo {
    isInHistory: boolean;
    lastWatchedAt?: string;
    isCompleted?: boolean;
}

export interface ScrobbleStopResponseData {
    traktHistoryId?: number;
    action: 'watched' | 'paused_incomplete' | 'error';
    serviceHistoryIds?: { [serviceType: string]: number | string };
}

export type ScrobbleNotificationMediaType =
    | MediaInfoResponse
    | (MediaInfoResponse & SeasonEpisodeObj);
