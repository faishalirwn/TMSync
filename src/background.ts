import { callApi } from './utils/api';
import {
    HistoryBody,
    MovieMediaInfo,
    ScrobbleBody,
    ShowMediaInfo
} from './utils/types';
import { getSeasonEpisodeObj, getUrlIdentifier } from './utils/url';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        if (!sender.tab || !sender.tab.url) {
            sendResponse('no sender.tab');
            return;
        }

        const tabUrl = getUrlIdentifier(sender.tab.url);

        if (!tabUrl) {
            sendResponse('tab url parse fail');
            return;
        }

        if (request.type === 'scrobble') {
            const mediaInfoGet = await chrome.storage.local.get(tabUrl);
            const mediaInfo: MovieMediaInfo | ShowMediaInfo =
                mediaInfoGet[tabUrl];
            let body: HistoryBody = {};

            if (mediaInfo.type === 'movie' && 'movie' in mediaInfo) {
                body.movies = [mediaInfo.movie];
            } else if (mediaInfo.type === 'show' && 'show' in mediaInfo) {
                body.shows = [mediaInfo.show];
                const seasonEpisode = getSeasonEpisodeObj(sender.tab.url);
                if (!seasonEpisode) {
                    sendResponse('season episode parse fail');
                    return;
                }
                const { season, number } = seasonEpisode;
                body.shows[0].seasons = [
                    {
                        number: season,
                        episodes: [{ number }]
                    }
                ];
            }
            console.log(body);

            try {
                const historyResponse = await callApi(
                    `https://api.trakt.tv/sync/history`,
                    'POST',
                    JSON.stringify(body),
                    true
                );

                sendResponse(historyResponse);
            } catch (error) {
                sendResponse('fail scrobble dawg');
            }
        }

        if (request.type === 'mediaInfo') {
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
                    [tabUrl]: {
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

    // Important! Return true to indicate you want to send a response asynchronously
    return true;
});
