import { ScrobbleNotification } from './components/ScrobbleNotification';
import './styles/index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from 'react-dom/client';
import { getCurrentSiteConfig } from './utils/siteConfigs';
import {
    HostnameType,
    MediaInfoRequest,
    MediaInfoResponse,
    MessageResponse,
    ScrobbleNotificationMediaType,
    ScrobbleRequest,
    ScrobbleResponse,
    UndoScrobbleRequest
} from './utils/types';

// Get current URL information
let url = location.href;
let urlObj = new URL(url);
let hostname = urlObj.hostname;

// Get the configuration for the current site
let siteConfig = getCurrentSiteConfig(hostname as HostnameType);
const isIframe = window.self !== window.top;

// Track page changes for SPA sites
let title = document.title;
let titleChanged = false;
let urlChanged = false;
let urlIdentifier = siteConfig ? siteConfig.getUrlIdentifier(url) : null;

// Store media info and scrobble state
let currentMediaInfo: MediaInfoResponse | null = null;
let reactRoot: Root | null = null;
let isScrobbled: boolean = false;
let currentTraktHistoryId: number | null = null;

// Monitor for page changes in Single Page Applications
function monitorPageChanges(): number | undefined {
    if (isIframe || !siteConfig) {
        return;
    }

    const SPAPageChangeInterval = window.setInterval(() => {
        const newUrl = location.href;
        if (newUrl !== url) {
            url = newUrl;
            urlIdentifier = siteConfig!.getUrlIdentifier(url);
            urlObj = new URL(url);
            hostname = urlObj.hostname;
            urlChanged = true;
        }

        const newTitle = document.title;
        if (newTitle !== title) {
            title = newTitle;
            titleChanged = true;
        }

        // Check if we're on a watch page to trigger processing
        if (siteConfig && siteConfig.isWatchPage(url)) {
            // Handle different site-specific triggers
            if (hostname === 'www.cineby.app' && titleChanged && urlChanged) {
                titleChanged = false;
                urlChanged = false;

                if (document.title !== 'Cineby') {
                    processCurrentPage();
                }
            } else if (hostname === 'freek.to' && urlChanged) {
                urlChanged = false;
                processCurrentPage();
            } else if (urlChanged) {
                // Generic handler for other sites
                urlChanged = false;
                processCurrentPage();
            }
        }
    }, 1000);

    return SPAPageChangeInterval;
}

function startVideoMonitoring(): number {
    let isWatched = false;
    console.log('Initiate Video progress monitoring', hostname);

    const monitorVideoInterval = window.setInterval(() => {
        try {
            const video = document.querySelector('video');
            if (!video) {
                return;
            }

            const watchPercentage = (video.currentTime / video.duration) * 100;

            if (watchPercentage >= 80 && !isWatched) {
                console.log('Watch percentage:', watchPercentage);
                isWatched = true;

                window.clearInterval(monitorVideoInterval);

                // Send scrobble request to background script
                scrobbleMedia(watchPercentage);
            }
        } catch (error) {
            console.error('Error in video monitoring:', error);
        }
    }, 1000);

    return monitorVideoInterval;
}

function scrobbleMedia(
    progress?: number
): Promise<MessageResponse<ScrobbleResponse>> {
    return chrome.runtime
        .sendMessage<ScrobbleRequest, MessageResponse<ScrobbleResponse>>({
            action: 'scrobble',
            params: {
                progress: progress || 100
            }
        })
        .then(handleScrobbleResponse)
        .catch((err: Error) => {
            console.error('Error sending scrobble:', err);
            return { success: false, error: err.message };
        });
}

function undoScrobbleMedia(
    historyId: number
): Promise<MessageResponse<unknown>> {
    return chrome.runtime
        .sendMessage<UndoScrobbleRequest, MessageResponse<unknown>>({
            action: 'undoScrobble',
            params: {
                historyId: historyId
            }
        })
        .then((resp: MessageResponse<unknown>) => {
            if (resp.success) {
                console.log('Undo scrobble response:', resp);
            } else {
                console.error('Error undoing scrobble:', resp.error);
            }
            return resp;
        })
        .catch((err: Error) => {
            console.error('Error undoing scrobble:', err);
            return { success: false, error: err.message };
        });
}

function handleScrobbleResponse(
    resp: MessageResponse<ScrobbleResponse>
): MessageResponse<ScrobbleResponse> {
    if (!resp.success) {
        console.error('Error sending scrobble:', resp.error);
        return resp;
    }

    console.log('Scrobble response:', resp.data);
    if (!resp.data) return resp;

    const traktHistoryId = resp.data.traktHistoryId;

    // Store the scrobble state globally
    isScrobbled = true;
    currentTraktHistoryId = traktHistoryId;

    // Handle iframe communication or update UI
    if (isIframe) {
        // Send message to parent window
        window.top?.postMessage(
            {
                type: 'TMSYNC_SCROBBLE_EVENT',
                traktHistoryId: traktHistoryId
            },
            '*'
        );
        console.log('Sent scrobble event to parent:', traktHistoryId);
    } else if (currentMediaInfo) {
        // Re-render notification with updated state
        injectReactApp(currentMediaInfo);
    }

    return resp;
}

async function getMediaInfo(): Promise<MediaInfoResponse | null | undefined> {
    if (!siteConfig) return null;

    try {
        const title = await siteConfig.getTitle(url);
        const year = await siteConfig.getYear(url);
        const mediaType = siteConfig.getMediaType(url);

        if (!title || !year || !mediaType) {
            console.error('Title, year, or media type not found');
            return null;
        }

        return chrome.runtime
            .sendMessage<MediaInfoRequest, MessageResponse<MediaInfoResponse>>({
                action: 'mediaInfo',
                params: {
                    type: mediaType,
                    query: title,
                    years: year
                }
            })
            .then((resp) => {
                if (resp.success) {
                    console.log('Media info response:', resp.data);
                    return resp.data;
                } else {
                    console.error('Error sending media info:', resp.error);
                    return null;
                }
            });
    } catch (error) {
        console.error('Error getting media info:', error);
        return null;
    }
}

function injectReactApp(mediaInfo: ScrobbleNotificationMediaType): void {
    // Create container if it doesn't exist
    let container = document.getElementById('tmsync-container');

    if (!container) {
        const body = document.querySelector('body');
        container = document.createElement('div');
        container.id = 'tmsync-container';

        if (body) {
            body.append(container);
        }
    }

    // Create or reuse the React root
    if (!reactRoot && container) {
        reactRoot = createRoot(container);
    }

    // Define callbacks to update the global state
    const handleScrobble = async (): Promise<
        MessageResponse<ScrobbleResponse>
    > => {
        const response = await scrobbleMedia();
        // State update is handled in handleScrobbleResponse
        return response;
    };

    const handleUndoScrobble = async (
        historyId: number
    ): Promise<MessageResponse<unknown>> => {
        const response = await undoScrobbleMedia(historyId);
        if (response.success) {
            // Reset scrobble state
            isScrobbled = false;
            currentTraktHistoryId = null;
            // Re-render with updated state
            if (reactRoot && mediaInfo) {
                injectReactApp(mediaInfo);
            }
        }
        return response;
    };

    // Render the notification component with the media info and current state
    if (reactRoot) {
        reactRoot.render(
            <ScrobbleNotification
                mediaInfo={mediaInfo}
                isScrobbled={isScrobbled}
                traktHistoryId={currentTraktHistoryId}
                onScrobble={handleScrobble}
                onUndoScrobble={handleUndoScrobble}
            />
        );
    }
}

async function processCurrentPage(): Promise<void> {
    if (!siteConfig || !siteConfig.isWatchPage(url) || !urlIdentifier) {
        return;
    }

    // Check if we already have media info for this URL
    chrome.storage.local.get(urlIdentifier).then(async (mediaInfoGet) => {
        let mediaInfo: ScrobbleNotificationMediaType | null | undefined = null;

        if (urlIdentifier && mediaInfoGet[urlIdentifier]) {
            console.log(
                'Media info already stored:',
                mediaInfoGet[urlIdentifier]
            );
            mediaInfo = mediaInfoGet[urlIdentifier] as MediaInfoResponse;
        } else {
            mediaInfo = await getMediaInfo();
        }

        if (!mediaInfo) {
            return;
        }

        if (siteConfig.isWatchPage(url)) {
            const seasonEpisode = siteConfig.getSeasonEpisodeObj(url);
            if (seasonEpisode) {
                mediaInfo = {
                    ...mediaInfo,
                    ...seasonEpisode
                };
            }
        }

        // Store media info for use in the component
        currentMediaInfo = mediaInfo;

        // Inject or update the React notification
        injectReactApp(mediaInfo);

        // Start monitoring video progress
        startVideoMonitoring();
    });
}

// Initialize the content script
function initialize(): (() => void) | undefined {
    // Set up message listener for iframe communication
    if (!isIframe) {
        // Only the parent page needs to listen for messages
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (data && data.type === 'TMSYNC_SCROBBLE_EVENT') {
                console.log('Received scrobble event from iframe:', data);
                isScrobbled = true;
                currentTraktHistoryId = data.traktHistoryId;

                // Update the UI if we have media info
                if (currentMediaInfo) {
                    injectReactApp(currentMediaInfo);
                }
            }
        });
    }

    // Start monitoring for page changes (for SPAs)
    const pageChangeInterval = monitorPageChanges();

    // Process the current page
    if (siteConfig && siteConfig.isWatchPage(url)) {
        processCurrentPage();
    }

    if (isIframe) {
        startVideoMonitoring();
    }

    // Return cleanup function for future use
    return () => {
        if (pageChangeInterval) window.clearInterval(pageChangeInterval);
    };
}

// Start the content script
initialize();
