import { callApi } from './utils/api';
import {
    HistoryBody,
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
            if (request.action === 'scrobble') {
                let body: HistoryBody = {};

                if (request.params.type === 'movie') {
                    body.movies = [
                        {
                            ids: {
                                trakt: request.params.traktId
                            }
                        }
                    ];
                } else if (request.params.type === 'show') {
                    body.shows = [
                        {
                            ids: {
                                trakt: request.params.traktId
                            },
                            seasons: [
                                {
                                    number: request.params.season,
                                    episodes: [
                                        { number: request.params.episode || 1 }
                                    ]
                                }
                            ]
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

                    let traktId: number;
                    if ('movie' in mediaInfo) {
                        traktId = mediaInfo.movie.ids.trakt;
                    } else if ('show' in mediaInfo) {
                        traktId = mediaInfo.show.ids.trakt;
                    } else {
                        throw new Error('Unknown media type');
                    }
                    const response: MessageResponse<MediaInfoResponse> = {
                        success: true,
                        data: {
                            traktId
                        }
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
