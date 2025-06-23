import { MessageRequest } from '../utils/types';
import {
    handleConfirmMedia,
    handleManualSearch,
    handleMediaInfo
} from './handlers/handleMedia';
import {
    handleScrobblePause,
    handleScrobbleStart,
    handleScrobbleStop
} from './handlers/handleScrobble';
import {
    handleManualAddToHistory,
    handleUndoScrobble
} from './handlers/handleHistory';
import {
    handleRateEpisode,
    handleRateMovie,
    handleRateSeason,
    handleRateShow
} from './handlers/handleRatings';
import {
    handleGetComments,
    handlePostComment,
    handleUpdateComment,
    handleDeleteComment
} from './handlers/handleComments';
import { scrobbleState, resetActiveScrobbleState } from './state';
import { callApi } from '../utils/api';
import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';

type MessageHandler = (
    params: any,
    sender: chrome.runtime.MessageSender
) => Promise<any>;

const messageHandlers: Record<string, MessageHandler> = {
    // Media
    mediaInfo: handleMediaInfo,
    manualSearch: handleManualSearch,
    confirmMedia: handleConfirmMedia,
    // Scrobble
    requestScrobbleStart: handleScrobbleStart,
    requestScrobblePause: handleScrobblePause,
    requestScrobbleStop: handleScrobbleStop,
    // History
    requestManualAddToHistory: handleManualAddToHistory,
    undoScrobble: handleUndoScrobble,
    // Ratings
    rateMovie: handleRateMovie,
    rateShow: handleRateShow,
    rateSeason: handleRateSeason,
    rateEpisode: handleRateEpisode,
    // Comments
    getComments: handleGetComments,
    postComment: handlePostComment,
    updateComment: handleUpdateComment,
    deleteComment: handleDeleteComment
};

chrome.runtime.onMessage.addListener(
    (request: MessageRequest, sender, sendResponse) => {
        const handler = messageHandlers[request.action];
        if (handler) {
            handler(request.params, sender)
                .then((data) => sendResponse({ success: true, data }))
                .catch((error) => {
                    console.error(
                        `Error handling action '${request.action}':`,
                        error
                    );
                    sendResponse({
                        success: false,
                        error: error?.message || 'An unknown error occurred.'
                    });
                });
        } else {
            sendResponse({
                success: false,
                error: `No handler for action: ${request.action}`
            });
        }
        return true; // Indicates asynchronous response
    }
);

// Tab Listeners
const TRAKT_SCROBBLE_COMPLETION_THRESHOLD = 80;

function buildPayloadForTabClose() {
    const { mediaInfo, episodeInfo, currentProgress } = scrobbleState.current;
    if (!mediaInfo) return null;

    const payload: any = { progress: currentProgress };

    // Correctly narrow the type before accessing properties
    if (isMovieMediaInfo(mediaInfo)) {
        payload.movie = mediaInfo.movie;
    } else if (isShowMediaInfo(mediaInfo) && episodeInfo) {
        payload.show = mediaInfo.show;
        payload.episode = episodeInfo;
    } else {
        return null;
    }
    return payload;
}

async function handleTabCloseOrNavigate(tabId: number) {
    if (
        scrobbleState.current.tabId === tabId &&
        scrobbleState.current.mediaInfo
    ) {
        const payload = buildPayloadForTabClose();
        if (!payload) {
            resetActiveScrobbleState();
            return;
        }

        if (
            (scrobbleState.current.status === 'started' ||
                scrobbleState.current.status === 'paused') &&
            scrobbleState.current.currentProgress >=
                TRAKT_SCROBBLE_COMPLETION_THRESHOLD
        ) {
            await callApi(
                `https://api.trakt.tv/scrobble/stop`,
                'POST',
                payload
            ).catch((e) =>
                console.error('Error on tab-close scrobble stop:', e)
            );
        } else if (scrobbleState.current.status === 'started') {
            await callApi(
                `https://api.trakt.tv/scrobble/pause`,
                'POST',
                payload
            ).catch((e) =>
                console.error('Error on tab-close scrobble pause:', e)
            );
        }
        resetActiveScrobbleState();
    }
}

chrome.tabs.onRemoved.addListener((tabId) => handleTabCloseOrNavigate(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (scrobbleState.current.tabId === tabId && changeInfo.url && tab.url) {
        if (
            scrobbleState.current.previousScrobbledUrl &&
            new URL(scrobbleState.current.previousScrobbledUrl).pathname !==
                new URL(tab.url).pathname
        ) {
            handleTabCloseOrNavigate(tabId);
        }
    }
});
