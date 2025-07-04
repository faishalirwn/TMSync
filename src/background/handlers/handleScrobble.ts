import {
    RequestScrobblePauseParams,
    RequestScrobbleStartParams,
    RequestScrobbleStopParams
} from '../../types/messaging';
import { ScrobbleStopResponseData } from '../../types/scrobbling';
import { traktService } from '../../services/TraktService';
import { scrobbleState, resetActiveScrobbleState } from '../state';

export async function handleScrobbleStart(
    params: RequestScrobbleStartParams,
    sender: chrome.runtime.MessageSender
): Promise<void> {
    if (!sender.tab?.id) throw new Error('Tab ID missing for scrobble start');
    const tabId = sender.tab.id;

    // If there's an active scrobble on a different tab, pause it first
    if (
        scrobbleState.current.tabId &&
        scrobbleState.current.tabId !== tabId &&
        scrobbleState.current.status === 'started'
    ) {
        await traktService.pauseScrobble(
            scrobbleState.current.mediaInfo!,
            scrobbleState.current.episodeInfo || null,
            scrobbleState.current.currentProgress
        );
    }

    // Start the new scrobble
    await traktService.startScrobble(
        params.mediaInfo,
        params.episodeInfo || null,
        params.progress
    );

    // Update the global scrobble state
    scrobbleState.current = {
        tabId: tabId,
        mediaInfo: params.mediaInfo,
        episodeInfo: params.episodeInfo,
        currentProgress: params.progress,
        status: 'started',
        traktMediaType: params.mediaInfo.type === 'movie' ? 'movie' : 'episode',
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

    // Pause the scrobble via TraktService
    await traktService.pauseScrobble(
        params.mediaInfo,
        params.episodeInfo || null,
        params.progress
    );

    // Update the global scrobble state
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

    // Stop the scrobble via TraktService (it handles completion logic internally)
    const responseData = await traktService.stopScrobble(
        params.mediaInfo,
        params.episodeInfo || null,
        params.progress
    );

    // Reset the global scrobble state
    resetActiveScrobbleState();

    return responseData;
}
