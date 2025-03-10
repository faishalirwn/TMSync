import { getCurrentSiteConfig } from './utils/siteConfigs';
import {
    HostnameType,
    MediaInfoConfig,
    MediaInfoRequest,
    MediaInfoResponse,
    MessageResponse,
    ScrobbleRequest,
    ScrobbleResponse
} from './utils/types';

// TODO: way to change media info if it's wrong
// TODO: add iframe url automatically to manifest

// Get current URL information
let url = location.href;
let urlObj = new URL(url);
let hostname = urlObj.hostname;

// Get the configuration for the current site
let siteConfig = getCurrentSiteConfig(hostname);
const isIframe = !siteConfig;

// Track page changes for SPA sites
let title = document.title;
let titleChanged = false;
let urlChanged = false;

let urlIdentifier = siteConfig ? siteConfig.getUrlIdentifier(url) : null;

// Monitor for page changes in Single Page Applications
const monitorPageChanges = () => {
    if (isIframe || !siteConfig) {
        return;
    }

    const SPAPageChangeInterval = setInterval(() => {
        const newUrl = location.href;
        if (newUrl !== url) {
            url = newUrl;
            urlIdentifier = siteConfig.getUrlIdentifier(url);
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
};

function startVideoMonitoring() {
    let isWatched = false;
    console.log('Initiate Video progress monitoring', hostname);

    const monitorVideoInterval = setInterval(() => {
        try {
            const video = document.querySelector('video');
            if (!video) {
                return;
            }

            const watchPercentage = (video.currentTime / video.duration) * 100;

            if (watchPercentage >= 80 && !isWatched) {
                console.log('Watch percentage:', watchPercentage);
                isWatched = true;

                clearInterval(monitorVideoInterval);

                chrome.runtime
                    .sendMessage<
                        ScrobbleRequest,
                        MessageResponse<ScrobbleResponse>
                    >({
                        action: 'scrobble',
                        params: {
                            progress: watchPercentage
                        }
                    })
                    .then(handleScrobbleResponse)
                    .catch((err) => {
                        console.error('Error sending scrobble:', err);
                    });
            }
        } catch (error) {
            console.error('Error in video monitoring:', error);
        }
    }, 1000);

    return monitorVideoInterval;
}

function handleScrobbleResponse(resp: MessageResponse<ScrobbleResponse>) {
    if (resp.success) {
        console.log('Scrobble response:', resp.data);

        if (!resp.data) {
            return;
        }

        const traktHistoryId = resp.data.traktHistoryId;

        const undoScrobble = confirm('Scrobble complete! Undo scrobble?');

        if (undoScrobble) {
            chrome.runtime
                .sendMessage({
                    action: 'undoScrobble',
                    params: {
                        historyId: traktHistoryId
                    }
                })
                .then((resp) => {
                    if (resp.success) {
                        console.log('Undo scrobble response:', resp);
                    } else {
                        console.error('Error undoing scrobble:', resp.error);
                    }
                })
                .catch((err) => {
                    console.error('Error undoing scrobble:', err);
                });
        }
    } else {
        console.error('Error sending scrobble:', resp.error);
    }
}

async function getMediaInfo() {
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

async function processCurrentPage() {
    if (!siteConfig || !siteConfig.isWatchPage(url) || !urlIdentifier) {
        return;
    }

    // Check if we already have media info for this URL
    chrome.storage.local.get(urlIdentifier).then(async (mediaInfoGet) => {
        let mediaInfo = null;

        if (urlIdentifier && mediaInfoGet[urlIdentifier]) {
            console.log(
                'Media info already stored:',
                mediaInfoGet[urlIdentifier]
            );
            mediaInfo = mediaInfoGet[urlIdentifier];
        } else {
            mediaInfo = await getMediaInfo();
        }

        if (!mediaInfo) {
            return;
        }

        startVideoMonitoring();
    });
}

// Initialize the content script
function initialize() {
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
        if (pageChangeInterval) clearInterval(pageChangeInterval);
    };
}

// Start the content script
initialize();
