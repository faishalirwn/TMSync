import { waitForElm } from './utils/content';
import {
    MediaInfoRequest,
    MediaInfoResponse,
    MessageResponse,
    ScrobbleRequest,
    ScrobbleResponse
} from './utils/types';
import { getUrlIdentifier } from './utils/url';

// TODO: way to change media info if it's wrong
// IDEA: ditch main. have a initial page load listener using setInterval, and have a mutation observer to detect
// changes in the page. if the page changes, run the main function again. if the page changes to a different page,
// run the cleanup function and then run the main function again.
// listener, scrapper, scrobble/video monitoring.

// Set up URL monitoring using different methods to ensure we catch navigation changes
let url = location.href;
let urlIdentifier = getUrlIdentifier(url);
let urlObj = new URL(url);

let title = document.title;
let titleChanged = false;
let urlChanged = false;

setInterval(() => {
    if (document.title !== title) {
        title = document.title;
        titleChanged = true;
    }

    if (location.href !== url) {
        url = location.href;
        urlIdentifier = getUrlIdentifier(url);
        urlObj = new URL(url);
        urlChanged = true;
    }

    if (
        urlObj.hostname === 'www.cineby.app' &&
        (urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie')) &&
        titleChanged &&
        urlChanged
    ) {
        // First run the cleanup from the previous page
        if (typeof cleanup === 'function') {
            cleanup();
        }

        // Then run main() for the new page and store its cleanup function
        cleanup = main();

        // Reset change flags
        titleChanged = false;
        urlChanged = false;
    }
}, 1000);

// Main function to handle media content
function main() {
    console.log('Main function executing for:', url);

    if (
        urlObj.hostname === 'www.cineby.app' &&
        (urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie'))
    ) {
        function getMediaType(url: string) {
            let type = '';
            const urlObj = new URL(url);
            const urlPath = urlObj.pathname.split('/');

            if (urlPath[1] === 'movie') {
                type = 'movie';
            } else if (urlPath[1] === 'tv') {
                type = 'show';
            }
            return type;
        }

        // Store interval IDs for cleanup
        const intervals = new Set<NodeJS.Timeout>();

        // Media info detection
        function getMediaInfo() {
            const titleElement = waitForElm('head > title');
            const yearElement = waitForElm(
                '#__next > div.relative.w-full.h-screen > div.z-\\[1\\].mx-0.max-w-screen-lg.px-4.pb-4.md\\:mx-4.lg\\:mx-auto.lg\\:pb-20.xl\\:px-0 > div.flex.items-center.justify-center.min-h-screen.gap-12.text-center > div > div.flex.items-center.gap-3.font-semibold > div:nth-child(1)'
            );
            Promise.all([titleElement, yearElement]).then(
                ([titleElement, yearElement]) => {
                    if (!titleElement || !yearElement) {
                        return;
                    }

                    const title = titleElement.textContent;
                    const year = yearElement.textContent
                        ? yearElement.textContent.split('/')[2]
                        : undefined;
                    const mediaType = getMediaType(url);

                    if (!title || !year || !mediaType) {
                        console.error('Title, year, or media type not found');
                        return;
                    }

                    // Call API through background script because content scripts can't make API requests directly because of CORS
                    chrome.runtime
                        .sendMessage<
                            MediaInfoRequest,
                            MessageResponse<MediaInfoResponse>
                        >({
                            action: 'mediaInfo',
                            params: {
                                type: getMediaType(url),
                                query: title,
                                years: year
                            }
                        })
                        .then((resp) => {
                            if (resp.success) {
                                console.log('Media info response:', resp.data);
                            } else {
                                console.error(
                                    'Error sending media info:',
                                    resp.error
                                );
                            }
                        })
                        .catch((err) => {
                            console.error('Error sending media info:', err);
                        });
                }
            );
        }

        chrome.storage.local.get(urlIdentifier).then((mediaInfoGet) => {
            if (mediaInfoGet[urlIdentifier]) {
                console.log('Media info already stored:');
                console.log(mediaInfoGet[urlIdentifier]);
                return;
            }

            const titleChangeInterval = setInterval(() => {
                if (document.title !== 'Cineby') {
                    getMediaInfo();
                    clearInterval(titleChangeInterval);
                } else {
                    console.log('Waiting for title change...');
                }
            }, 1000);
        });

        let isWatched = false;

        // Video progress monitoring
        console.log('Initiate Video progress monitoring');
        const watchInterval = setInterval(() => {
            try {
                const video = document.querySelector('video');
                if (!video) {
                    return;
                }

                const watchPercentage =
                    (video.currentTime / video.duration) * 100;

                if (watchPercentage >= 80 && !isWatched) {
                    console.log('Watch percentage:', watchPercentage);
                    isWatched = true;

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
        intervals.add(watchInterval);

        // Return cleanup function
        return function cleanup() {
            console.log('Cleaning up intervals...');
            for (const interval of intervals) {
                clearInterval(interval);
            }
            intervals.clear();
        };
    }

    // Return empty cleanup function if URL doesn't match
    return function cleanup() {};
}

// Initial call
let cleanup = main();
