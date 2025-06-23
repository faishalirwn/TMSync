import { MediaInfoResponse, SeasonEpisodeObj } from '../../types/media';
import {
    RequestScrobblePauseParams,
    RequestScrobbleStartParams,
    RequestScrobbleStopParams
} from '../../types/messaging';
import { ScrobbleStopResponseData } from '../../types/scrobbling';
import { ScrobbleBody } from '../../types/trakt';
import { callApi } from '../../utils/api';
import { isMovieMediaInfo, isShowMediaInfo } from '../../utils/typeGuards';
import { scrobbleState, resetActiveScrobbleState } from '../state';

const TRAKT_SCROBBLE_COMPLETION_THRESHOLD = 80;

function buildTraktScrobblePayload(
    mediaInfo: MediaInfoResponse,
    episodeInfo: SeasonEpisodeObj | undefined | null,
    progress: number
): ScrobbleBody {
    const payload: ScrobbleBody = { progress };
    if (isMovieMediaInfo(mediaInfo)) {
        payload.movie = mediaInfo.movie;
    } else if (isShowMediaInfo(mediaInfo) && episodeInfo) {
        payload.show = mediaInfo.show;
        payload.episode = episodeInfo;
    } else {
        throw new Error(
            'Invalid mediaInfo or missing episodeInfo for show to build scrobble payload'
        );
    }
    return payload;
}

export async function handleScrobbleStart(
    params: RequestScrobbleStartParams,
    sender: chrome.runtime.MessageSender
): Promise<void> {
    if (!sender.tab?.id) throw new Error('Tab ID missing for scrobble start');
    const tabId = sender.tab.id;

    if (
        scrobbleState.current.tabId &&
        scrobbleState.current.tabId !== tabId &&
        scrobbleState.current.status === 'started'
    ) {
        const oldPayload = buildTraktScrobblePayload(
            scrobbleState.current.mediaInfo!,
            scrobbleState.current.episodeInfo,
            scrobbleState.current.currentProgress
        );
        await callApi(
            `https://api.trakt.tv/scrobble/pause`,
            'POST',
            oldPayload
        );
    }

    const payload = buildTraktScrobblePayload(
        params.mediaInfo,
        params.episodeInfo,
        params.progress
    );
    await callApi(`https://api.trakt.tv/scrobble/start`, 'POST', payload);

    scrobbleState.current = {
        tabId: tabId,
        mediaInfo: params.mediaInfo,
        episodeInfo: params.episodeInfo,
        currentProgress: params.progress,
        status: 'started',
        traktMediaType: isMovieMediaInfo(params.mediaInfo)
            ? 'movie'
            : 'episode',
        lastUpdateTime: Date.now(),
        previousScrobbledUrl: sender.tab.url
    };
}

export async function handleScrobblePause(
    params: RequestScrobblePauseParams,
    sender: chrome.runtime.MessageSender
): Promise<void> {
    if (!sender.tab?.id) throw new Error('Tab ID missing for scrobble pause');
    if (
        scrobbleState.current.tabId !== sender.tab.id ||
        scrobbleState.current.status !== 'started'
    ) {
        throw new Error('Scrobble not active on this tab or not started.');
    }

    const payload = buildTraktScrobblePayload(
        params.mediaInfo,
        params.episodeInfo,
        params.progress
    );
    await callApi(`https://api.trakt.tv/scrobble/pause`, 'POST', payload);

    scrobbleState.current.currentProgress = params.progress;
    scrobbleState.current.status = 'paused';
    scrobbleState.current.lastUpdateTime = Date.now();
}

export async function handleScrobbleStop(
    params: RequestScrobbleStopParams,
    sender: chrome.runtime.MessageSender
): Promise<ScrobbleStopResponseData> {
    if (!sender.tab?.id) throw new Error('Tab ID missing for scrobble stop');
    if (scrobbleState.current.tabId !== sender.tab.id) {
        throw new Error('Scrobble not active on this tab for stop.');
    }

    const payload = buildTraktScrobblePayload(
        params.mediaInfo,
        params.episodeInfo,
        params.progress
    );
    const traktResponse = await callApi<any>(
        `https://api.trakt.tv/scrobble/stop`,
        'POST',
        payload
    );

    let responseData: ScrobbleStopResponseData = { action: 'error' };
    if (params.progress >= TRAKT_SCROBBLE_COMPLETION_THRESHOLD) {
        // The primary source for the history ID is the `id` property on the response.
        // The complex fallback has been removed to fix the type error.
        const historyId = traktResponse?.id;
        responseData = { action: 'watched', traktHistoryId: historyId };
    } else {
        responseData = { action: 'paused_incomplete' };
    }

    resetActiveScrobbleState();
    return responseData;
}
