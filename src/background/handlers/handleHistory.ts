import { callApi } from '../../utils/api';
import { isMovieMediaInfo, isShowMediaInfo } from '../../utils/typeGuards';
import {
    HistoryBody,
    RequestManualAddToHistoryParams,
    ScrobbleResponse
} from '../../utils/types';

export async function handleManualAddToHistory(
    params: RequestManualAddToHistoryParams
): Promise<ScrobbleResponse> {
    const historyBody: HistoryBody = {};
    if (isMovieMediaInfo(params.mediaInfo)) {
        historyBody.movies = [{ ids: params.mediaInfo.movie.ids }];
    } else if (isShowMediaInfo(params.mediaInfo) && params.episodeInfo) {
        historyBody.shows = [
            {
                ids: params.mediaInfo.show.ids,
                seasons: [
                    {
                        number: params.episodeInfo.season,
                        episodes: [{ number: params.episodeInfo.number }]
                    }
                ]
            }
        ];
    } else {
        throw new Error('Invalid media for manual history add');
    }

    await callApi(`https://api.trakt.tv/sync/history`, 'POST', historyBody);

    const historyResponse = await callApi(
        `https://api.trakt.tv/sync/history/${isMovieMediaInfo(params.mediaInfo) ? 'movies' : 'episodes'}/${isMovieMediaInfo(params.mediaInfo) ? params.mediaInfo.movie.ids.trakt : params.mediaInfo.show.ids.trakt}?limit=1`,
        'GET'
    );

    let traktHistoryId: number | undefined;
    if (
        Array.isArray(historyResponse) &&
        historyResponse.length > 0 &&
        historyResponse[0].id
    ) {
        traktHistoryId = historyResponse[0].id;
    }

    return { traktHistoryId: traktHistoryId! };
}

export async function handleUndoScrobble(params: {
    historyId: number;
}): Promise<void> {
    await callApi(`https://api.trakt.tv/sync/history/remove`, 'POST', {
        ids: [params.historyId]
    });
}
