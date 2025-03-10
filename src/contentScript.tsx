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

// TODO: way to change media info if it's wrong
// TODO: add iframe url automatically to manifest

let url = location.href;
let urlObj = new URL(url);
let urlHostname = urlObj.hostname as HostnameType;

let title = document.title;
let titleChanged = false;
let urlChanged = false;

let config: MediaInfoConfig | null = null;
const isIframe = !(urlHostname in configs);

if (!isIframe) {
    config = configs[urlHostname];
}

let urlIdentifier = config ? config.getUrlIdentifier(url) : null;

const SPAPageChangeInterval = setInterval(() => {
    if (isIframe || !config) {
        clearInterval(SPAPageChangeInterval);
        return;
    }

    const newUrl = location.href;
    if (newUrl !== url) {
        url = newUrl;
        urlIdentifier = config.getUrlIdentifier(url);
        urlObj = new URL(url);
        urlHostname = urlObj.hostname as HostnameType;
        urlChanged = true;
    }

    const newTitle = document.title;
    if (newTitle !== title) {
        title = newTitle;
        titleChanged = true;
    }

    if (config && config.isWatchPage(url)) {
        if (urlHostname === 'www.cineby.app' && titleChanged && urlChanged) {
            titleChanged = false;
            urlChanged = false;

            if (document.title !== 'Cineby') {
                main();
            }
        }

        if (urlHostname === 'freek.to' && urlChanged) {
            urlChanged = false;

            main();
        }
    }
}, 1000);

function startMonitorVideoInterval() {
    let isWatched = false;
    console.log('Initiate Video progress monitoring', urlHostname);

    let monitorVideoInterval: NodeJS.Timeout;
    monitorVideoInterval = setInterval(() => {
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

function getMediaInfo(config: MediaInfoConfig) {
    const { getTitle, getYear } = config;

    const title = getTitle(url);
    const year = getYear(url);
    const mediaType = config.getMediaType(url);

    return Promise.all([title, year]).then(([title, year]) => {
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
            })
            .catch((err) => {
                console.error('Error sending media info:', err);
                return null;
            });
    });
}

function main() {
    if (config && config.isWatchPage(url)) {
        chrome.storage.local.get(urlIdentifier).then(async (mediaInfoGet) => {
            let mediaInfo = null;
            if (urlIdentifier && mediaInfoGet[urlIdentifier]) {
                console.log('Media info already stored:');
                console.log(mediaInfoGet[urlIdentifier]);
                mediaInfo = mediaInfoGet[urlIdentifier];
            } else {
                mediaInfo = await getMediaInfo(config);
            }

            if (!mediaInfo) {
                return;
            }
        });
    }
    startMonitorVideoInterval();
}

main();
