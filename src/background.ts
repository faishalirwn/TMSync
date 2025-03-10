import { configs } from './urlConfig';
import { callApi } from './utils/api';
import {
    HistoryBody,
    HostnameType,
    MediaInfoResponse,
    MessageRequest,
    MessageResponse,
    MovieMediaInfo,
    ScrobbleResponse,
    ShowMediaInfo
} from './utils/types';

chrome.runtime.onMessage.addListener(
    (request: MessageRequest, sender, sendResponse) => {
        (async () => {
            if (!sender.tab || !sender.tab.url) {
                const response: MessageResponse<null> = {
                    success: false,
                    error: 'no sender.tab'
                };
                sendResponse(response);
                return;
            }

            // important: we use geturlidentifer because sender.tab.url is only accessible in background script.
            // this function can be used in content script as well. so the url is consistent.
            let url = sender.tab.url;
            let urlObj = new URL(url);
            let urlHostname = urlObj.hostname as HostnameType;
            const config = configs[urlHostname];
            const tabUrl = config.getUrlIdentifier(url);

            if (!tabUrl) {
                const response: MessageResponse<null> = {
                    success: false,
                    error: 'tab url parse fail'
                };
                sendResponse(response);
                return;
            }

            if (request.action === 'scrobble') {
                const mediaInfoGet = await chrome.storage.local.get(tabUrl);
                const mediaInfo: MovieMediaInfo | ShowMediaInfo =
                    mediaInfoGet[tabUrl];
                let body: HistoryBody = {};

                if (mediaInfo.type === 'movie' && 'movie' in mediaInfo) {
                    body.movies = [mediaInfo.movie];
                } else if (mediaInfo.type === 'show' && 'show' in mediaInfo) {
                    body.shows = [mediaInfo.show];
                    const seasonEpisode = config.getSeasonEpisodeObj(url);
                    if (!seasonEpisode) {
                        const response: MessageResponse<null> = {
                            success: false,
                            error: 'season episode parse fail'
                        };
                        sendResponse(response);
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
                    await callApi(
                        `https://api.trakt.tv/sync/history`,
                        'POST',
                        JSON.stringify(body),
                        true
                    );
                    const historyResponse = await callApi(
                        `https://api.trakt.tv/sync/history`,
                        'GET'
                    );
                    const traktHistoryId = historyResponse[0].id;

                    const response: MessageResponse<ScrobbleResponse> = {
                        success: true,
                        data: { traktHistoryId }
                    };
                    sendResponse(response);
                } catch (error) {
                    const response: MessageResponse<null> = {
                        success: false,
                        error: 'fail scrobble dawg'
                    };
                    sendResponse(response);
                }
            }

            if (request.action === 'undoScrobble') {
                const historyId = request.params.historyId;
                try {
                    await callApi(
                        `https://api.trakt.tv/sync/history/remove`,
                        'POST',
                        JSON.stringify({ ids: [historyId] })
                    );
                    const response: MessageResponse<null> = {
                        success: true
                    };
                    sendResponse(response);
                } catch (error) {
                    const response: MessageResponse<null> = {
                        success: false,
                        error: 'fail undo scrobble dawg'
                    };
                    sendResponse(response);
                }
            }

            if (request.action === 'mediaInfo') {
                try {
                    const result = await callApi(
                        `https://api.trakt.tv/search/${request.params.type}?` +
                            new URLSearchParams(request.params).toString(),
                        'GET'
                    );
                    const mediaInfo: MovieMediaInfo | ShowMediaInfo = result[0];
                    // IMPORTANT: we store the info in local storage so we can use it in a site that uses iframe as video player.
                    // global variable content script won't work because the parent website is different from the iframe website.
                    // they have their own content script, they trigger independently.
                    chrome.storage.local.set({
                        [tabUrl]: {
                            ...mediaInfo,
                            type: request.params.type
                        }
                    });
                    const response: MessageResponse<MediaInfoResponse> = {
                        success: true,
                        data: mediaInfo
                    };
                    sendResponse(response);
                } catch (error) {
                    const response: MessageResponse<null> = {
                        success: false,
                        error: 'fail search dawg'
                    };
                    sendResponse(response);
                }
            }
        })();

        // Important! Return true to indicate you want to send a response asynchronously
        return true;
    }
);
