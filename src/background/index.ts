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
import { handleAuthTokenExchange } from './handlers/handleAuth';
import { serviceStatusManager } from './serviceStatusManager';
import { initializeServices } from '../services';
import { scrobbleState, resetActiveScrobbleState } from './state';
import { callApi } from '../utils/api';
import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';
import { MessageRequest } from '../types/messaging';
import { scrobbleOperationManager } from './scrobbleOperationManager';

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
    deleteComment: handleDeleteComment,
    // Authentication
    authTokenExchange: handleAuthTokenExchange,
    // Service Status
    registerStatusListener: async (
        params: any,
        sender: chrome.runtime.MessageSender
    ) => {
        if (sender.tab?.id) {
            serviceStatusManager.addStatusListener(sender.tab.id);
        }
        return { success: true };
    },
    unregisterStatusListener: async (
        params: any,
        sender: chrome.runtime.MessageSender
    ) => {
        if (sender.tab?.id) {
            serviceStatusManager.removeStatusListener(sender.tab.id);
        }
        return { success: true };
    },
    getServiceStatuses: async () => {
        return serviceStatusManager.getAllServiceStatuses();
    },
    updateServiceAuthentication: async (params: { serviceType: string }) => {
        await serviceStatusManager.updateServiceAuthentication(
            params.serviceType as any
        );
        return { success: true };
    }
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

        const { mediaInfo, episodeInfo } = scrobbleState.current;

        if (
            (scrobbleState.current.status === 'started' ||
                scrobbleState.current.status === 'paused') &&
            scrobbleState.current.currentProgress >=
                TRAKT_SCROBBLE_COMPLETION_THRESHOLD
        ) {
            // Use operation manager to prevent conflicts with manual stops
            await scrobbleOperationManager
                .executeOperation(
                    'stop',
                    mediaInfo,
                    episodeInfo || null,
                    async () => {
                        await callApi(
                            `https://api.trakt.tv/scrobble/stop`,
                            'POST',
                            payload
                        );
                    }
                )
                .catch((e) =>
                    console.error('Error on tab-close scrobble stop:', e)
                );
        } else if (scrobbleState.current.status === 'started') {
            // Use operation manager to prevent conflicts with manual pauses
            await scrobbleOperationManager
                .executeOperation(
                    'pause',
                    mediaInfo,
                    episodeInfo || null,
                    async () => {
                        await callApi(
                            `https://api.trakt.tv/scrobble/pause`,
                            'POST',
                            payload
                        );
                    }
                )
                .catch((e) =>
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

// Initialize services when background script starts
console.log('🚀 Background script starting, initializing services...');
initializeServices();
console.log('✅ Services initialized in background script');

// Initialize service status manager after services are ready
serviceStatusManager
    .initializeServiceStatuses()
    .then(() => {
        console.log('✅ Service status manager initialized');
    })
    .catch((error) => {
        console.error('❌ Failed to initialize service status manager:', error);
    });
