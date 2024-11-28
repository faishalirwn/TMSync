import { callApi } from './utils/api';
import { getEpisode, getUrlIdentifier } from './utils/url';

interface MovieMediaInfo {
    type: string;
    score: number;
    movie: {
        title: string;
        year: number;
        ids: {
            trakt: number;
            slug: string;
            imdb: string;
            tmdb: number;
        };
    };
}

interface ShowMediaInfo {
    type: string;
    score: number;
    show: {
        title: string;
        year: number;
        ids: {
            trakt: number;
            slug: string;
            tvdb: number;
            imdb: string;
            tmdb: number;
        };
    };
}

interface ScrobbleBody {
    movie?: MovieMediaInfo['movie'];
    show?: ShowMediaInfo['show'];
    episode?: ReturnType<typeof getEpisode>;
    progress: number;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'scrobble') {
        (async () => {
            if (sender.tab && sender.tab.url) {
                const tabUrl = getUrlIdentifier(sender.tab.url);
                if (tabUrl) {
                    const mediaInfoGet = await chrome.storage.local.get(tabUrl);
                    const mediaInfo: MovieMediaInfo | ShowMediaInfo =
                        mediaInfoGet[tabUrl];
                    const body: ScrobbleBody = {
                        progress: request.payload.progress
                    };

                    if (mediaInfo.type === 'movie' && 'movie' in mediaInfo) {
                        body.movie = mediaInfo.movie;
                    } else if (
                        mediaInfo.type === 'show' &&
                        'show' in mediaInfo
                    ) {
                        body.show = mediaInfo.show;
                        body.episode = getEpisode(sender.tab.url);
                    }
                    console.log(body);

                    try {
                        await callApi(
                            `https://api.trakt.tv/scrobble/start`,
                            'POST',
                            JSON.stringify(body),
                            true
                        );
                        await new Promise((r) => setTimeout(r, 1000));
                        const stopResult = await callApi(
                            `https://api.trakt.tv/scrobble/stop`,
                            'POST',
                            JSON.stringify(body),
                            true
                        );
                        sendResponse(stopResult);
                    } catch (error) {
                        sendResponse('fail scrobble dawg');
                    }
                }
            }
        })();
    }

    if (request.type === 'mediaInfo') {
        (async () => {
            if (sender.tab && sender.tab.url) {
                try {
                    const result = await callApi(
                        `https://api.trakt.tv/search/${request.payload.type}?` +
                            new URLSearchParams(request.payload).toString(),
                        'GET',
                        '',
                        true
                    );
                    const mediaInfo: MovieMediaInfo | ShowMediaInfo = result[0];
                    chrome.storage.local.set({
                        [getUrlIdentifier(sender.tab.url)]: {
                            ...mediaInfo,
                            type: request.payload.type
                        }
                    });
                    sendResponse(mediaInfo);
                } catch (error) {
                    sendResponse('fail search dawg');
                }
            }
        })();
        return true;
    }
});
