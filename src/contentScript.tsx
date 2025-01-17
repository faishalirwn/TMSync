import { waitForElm } from './utils/content';
import { getUrlIdentifier } from './utils/url';

// TODO: way to change media info if it's wrong

// Set up URL monitoring using different methods to ensure we catch navigation changes
let url = location.href;
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
            let type;
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

                    // Call API through background script because content scripts can't make API requests directly because of CORS
                    chrome.runtime
                        .sendMessage({
                            type: 'mediaInfo',
                            payload: {
                                type: getMediaType(url),
                                query: title || undefined,
                                years: year
                            }
                        })
                        .then((resp) => {
                            console.log('Media info response:', resp);
                        })
                        .catch((err) => {
                            console.error('Error sending media info:', err);
                        });
                }
            );
        }

        chrome.storage.local.get(getUrlIdentifier(url)).then((mediaInfoGet) => {
            if (mediaInfoGet[getUrlIdentifier(url)]) {
                console.log(
                    'Media info already stored:',
                    mediaInfoGet[getUrlIdentifier(url)]
                );
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
                if (video) {
                    const watchPercentage =
                        (video.currentTime / video.duration) * 100;

                    if (watchPercentage >= 80 && !isWatched) {
                        console.log('Watch percentage:', watchPercentage);
                        isWatched = true;

                        chrome.runtime
                            .sendMessage({
                                type: 'scrobble',
                                payload: {
                                    progress: watchPercentage
                                }
                            })
                            .then((resp) => {
                                console.log('Scrobble response:', resp);
                            })
                            .catch((err) => {
                                console.error('Error sending scrobble:', err);
                            });
                    }
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
