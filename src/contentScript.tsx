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

// Set up URL monitoring using different methods to ensure we catch navigation changes
let url = location.href;
let urlIdentifier = getUrlIdentifier(url);
let urlObj = new URL(url);
let urlHostname = urlObj.hostname as HostnameType;

let title = document.title;
let titleChanged = false;
let urlChanged = false;

type HostnameType = 'www.cineby.app' | 'freek.to';

interface UrlMediaPath {
    pos: number;
    keywords: {
        movie: string;
        show: string;
    };
}

interface MediaInfoConfig {
    titleSelector: string;
    yearSelector: string;
    yearParser?: (text: string) => string | undefined;
    hostname: HostnameType;
    isWatchpage(): boolean;
    urlMediaPath: UrlMediaPath;
}

const cinebyConfig: MediaInfoConfig = {
    titleSelector: 'head > title',
    yearSelector:
        '#__next > div.relative.w-full.h-screen > div.z-\\[1\\].mx-0.max-w-screen-lg.px-4.pb-4.md\\:mx-4.lg\\:mx-auto.lg\\:pb-20.xl\\:px-0 > div.flex.items-center.justify-center.min-h-screen.gap-12.text-center > div > div.flex.items-center.gap-3.font-semibold > div:nth-child(1)',
    hostname: 'www.cineby.app',
    isWatchpage() {
        return (
            urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie')
        );
    },
    urlMediaPath: {
        pos: 1,
        keywords: {
            movie: 'movie',
            show: 'tv'
        }
    }
};

const freekConfig: MediaInfoConfig = {
    titleSelector:
        '#root > div > div.flex.flex-col.size-full > div > div.bg-white/[.07].overflow-hidden > div > div.flex.flex-col.size-full.gap-6.p-4.pt-3.overflow-auto > div > div.flex-grow.flex.flex-col.gap-4 > div > span',
    yearSelector:
        '#root > div > div.flex.flex-col.size-full > div > div.bg-white/[.07].overflow-hidden > div > div.flex.flex-col.size-full.gap-6.p-4.pt-3.overflow-auto > div > div.flex.gap-3.w-full.relative > div.flex.flex-col.gap-4.flex-grow.w-1/2.justify-end.text-white.shrink-0.text-sm.\\32 xl:text-base.!tracking-wider > div:nth-child(3) > span:nth-child(2)',
    hostname: 'freek.to',
    isWatchpage() {
        return (
            urlObj.pathname.startsWith('/watch/tv') ||
            urlObj.pathname.startsWith('/watch/movie')
        );
    },
    urlMediaPath: {
        pos: 2,
        keywords: {
            movie: 'movie',
            show: 'tv'
        }
    },
    yearParser(text: string) {
        return text.split(',')[1].replace(' ', '');
    }
};

type ConfigsType = {
    [key in HostnameType]: MediaInfoConfig;
};

const configs: ConfigsType = {
    'www.cineby.app': cinebyConfig,
    'freek.to': freekConfig
};

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

    if (configs[urlHostname].isWatchpage()) {
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

function getMediaType(
    url: string,
    pos: number,
    keywords: { movie: string; show: string }
) {
    let type = '';
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    console.log(urlPath[pos]);

    if (urlPath[pos] === keywords.movie) {
        type = 'movie';
    } else if (urlPath[pos] === keywords.show) {
        type = 'show';
    }

    return type;
}

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

function getMediaInfo(url: string, config: MediaInfoConfig) {
    const {
        titleSelector,
        yearSelector,
        yearParser = (text) => text.split('/')[2],
        urlMediaPath
    } = config;

    const titleElement = waitForElm(titleSelector);
    const yearElement = waitForElm(yearSelector);
    // TODO: freek fail here. wtf is with these promises

    Promise.all([titleElement, yearElement]).then(
        ([titleElement, yearElement]) => {
            if (!titleElement || !yearElement) {
                console.error('Title or year element not found');
                return;
            }

            const title = titleElement.textContent;
            const year = yearElement.textContent
                ? yearParser(yearElement.textContent)
                : undefined;
            const mediaType = getMediaType(
                url,
                urlMediaPath.pos,
                urlMediaPath.keywords
            );

            if (!title || !year || !mediaType) {
                console.error('Title, year, or media type not found');
                return;
            }

            // Call API through background script
            chrome.runtime
                .sendMessage<
                    MediaInfoRequest,
                    MessageResponse<MediaInfoResponse>
                >({
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
                        alert(JSON.stringify(resp.data));
                    } else {
                        console.error('Error sending media info:', resp.error);
                    }
                })
                .catch((err) => {
                    console.error('Error sending media info:', err);
                });
        }
    );
}

// Main function to handle media content
function main() {
    const intervals = new Set<NodeJS.Timeout>();

    console.log('Main function executing for:', url);
    // alert('Main function executing for:' + url);

    const config = configs[urlHostname];

    if (configs[urlHostname].isWatchpage()) {
        chrome.storage.local.get(urlIdentifier).then((mediaInfoGet) => {
            if (mediaInfoGet[urlIdentifier]) {
                console.log('Media info already stored:');
                console.log(mediaInfoGet[urlIdentifier]);
                return;
            }

            getMediaInfo(url, config);
        });
    }

    const watchInterval = monitorVideoInterval();
    intervals.add(watchInterval);

    return function cleanup() {
        console.log('Cleaning up intervals...');
        for (const interval of intervals) {
            clearInterval(interval);
        }
        intervals.clear();
    };
}

// Initial call
let cleanup = main();
