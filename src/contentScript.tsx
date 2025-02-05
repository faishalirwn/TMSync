import { configs } from './urlConfig';
import {
    HostnameType,
    MediaInfoConfig,
    MediaInfoRequest,
    MediaInfoResponse,
    MessageResponse,
    ScrobbleRequest,
    ScrobbleResponse
} from './utils/types';
import { getUrlIdentifier } from './utils/url';

// TODO: way to change media info if it's wrong
// TODO: add iframe url automatically to manifest

// Set up URL monitoring using different methods to ensure we catch navigation changes
let url = location.href;
let urlIdentifier = getUrlIdentifier(url);
let urlObj = new URL(url);
let urlHostname = urlObj.hostname as HostnameType;

let title = document.title;
let titleChanged = false;
let urlChanged = false;

setInterval(() => {
    const newUrl = location.href;
    if (newUrl !== url) {
        url = newUrl;
        urlIdentifier = getUrlIdentifier(url);
        urlObj = new URL(url);
        urlHostname = urlObj.hostname as HostnameType;
        urlChanged = true;
    }

    const newTitle = document.title;
    if (newTitle !== title) {
        title = newTitle;
        titleChanged = true;
    }

    if (configs[urlHostname].isWatchpage(url)) {
        if (urlHostname === 'www.cineby.app' && titleChanged && urlChanged) {
            // Reset change flags
            titleChanged = false;
            urlChanged = false;

            if (document.title !== 'Cineby') {
                // First run the cleanup from the previous page
                if (typeof cleanup === 'function') {
                    cleanup();
                }

                // Then run main() for the new page and store its cleanup function
                cleanup = main();
            }
        }

        if (urlHostname === 'freek.to' && urlChanged) {
            urlChanged = false;

            if (typeof cleanup === 'function') {
                cleanup();
            }

            cleanup = main();
        }
    }
}, 1000);

function monitorVideoInterval() {
    let isWatched = false;
    // Video progress monitoring
    console.log('Initiate Video progress monitoring');
    return setInterval(() => {
        try {
            const video = document.querySelector('video');
            if (!video) {
                return;
            }

            const watchPercentage = (video.currentTime / video.duration) * 100;

            if (watchPercentage >= 80 && !isWatched) {
                console.log('Watch percentage:', watchPercentage);
                isWatched = true;

                // TODO: wait for media info to be stored before sending scrobble
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
                    .then((resp) => {
                        if (resp.success) {
                            console.log('Scrobble response:', resp.data);

                            if (!resp.data) {
                                return;
                            }

                            const traktHistoryId = resp.data.traktHistoryId;

                            // TODO: undo when the video is in iframe, use message passing chrome.tabs.sendmessage i think
                            const undoScrobble = confirm(
                                'Scrobble complete! Undo scrobble?'
                            );

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
                                            console.log(
                                                'Undo scrobble response:',
                                                resp
                                            );
                                        } else {
                                            console.error(
                                                'Error undoing scrobble:',
                                                resp.error
                                            );
                                        }
                                    })
                                    .catch((err) => {
                                        console.error(
                                            'Error undoing scrobble:',
                                            err
                                        );
                                    });
                            }
                        } else {
                            console.error(
                                'Error sending scrobble:',
                                resp.error
                            );
                        }
                    })
                    .catch((err) => {
                        console.error('Error sending scrobble:', err);
                    });
            }
        } catch (error) {
            console.error('Error in video monitoring:', error);
        }
    }, 1000);
}

function getMediaInfo(config: MediaInfoConfig) {
    const { getTitle, getYear } = config;

    const title = getTitle(url);
    const year = getYear(url);
    const mediaType = config.getMediaType(url);

    Promise.all([title, year]).then(([title, year]) => {
        if (!title || !year || !mediaType) {
            console.error('Title, year, or media type not found');
            return;
        }

        // Call API through background script
        chrome.runtime
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
                    // confirm(JSON.stringify(resp.data));
                } else {
                    console.error('Error sending media info:', resp.error);
                    // confirm('Error sending media info: ' + resp.error);
                }
            })
            .catch((err) => {
                console.error('Error sending media info:', err);
            });
    });
}

// Main function to handle media content
function main() {
    const intervals = new Set<NodeJS.Timeout>();

    console.log('Main function executing for:', url);
    // confirm('Main function executing for:' + url);

    const watchInterval = monitorVideoInterval();
    intervals.add(watchInterval);

    function cleanup() {
        console.log('Cleaning up intervals...');
        for (const interval of intervals) {
            clearInterval(interval);
        }
        intervals.clear();
    }

    if (!(urlHostname in configs)) {
        console.error('Hostname not supported:', urlHostname);
        return cleanup;
    }

    const config = configs[urlHostname];

    if (config.isWatchpage(url)) {
        chrome.storage.local.get(urlIdentifier).then((mediaInfoGet) => {
            if (mediaInfoGet[urlIdentifier]) {
                console.log('Media info already stored:');
                console.log(mediaInfoGet[urlIdentifier]);
                return;
            }

            getMediaInfo(config);
        });
    }

    return cleanup;
}

// Initial call
let cleanup = main();
