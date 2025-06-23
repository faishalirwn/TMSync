import {
    RateEpisodeParams,
    RateMovieParams,
    RateSeasonParams,
    RateShowParams
} from '../../types/messaging';
import { callApi } from '../../utils/api';

export async function handleRateMovie(params: RateMovieParams): Promise<void> {
    const body = {
        movies: [{ ids: params.mediaInfo.movie.ids, rating: params.rating }]
    };
    await callApi(`https://api.trakt.tv/sync/ratings`, 'POST', body);
}

export async function handleRateShow(params: RateShowParams): Promise<void> {
    const body = {
        shows: [{ ids: params.mediaInfo.show.ids, rating: params.rating }]
    };
    await callApi(`https://api.trakt.tv/sync/ratings`, 'POST', body);
}

export async function handleRateSeason(
    params: RateSeasonParams
): Promise<void> {
    const seasons = await callApi<any[]>(
        `https://api.trakt.tv/shows/${params.mediaInfo.show.ids.trakt}/seasons`
    );
    const seasonId = seasons.find((s) => s.number === params.episodeInfo.season)
        ?.ids?.trakt;
    if (!seasonId) throw new Error('Could not find Trakt ID for the season.');
    const body = {
        seasons: [{ ids: { trakt: seasonId }, rating: params.rating }]
    };
    await callApi(`https://api.trakt.tv/sync/ratings`, 'POST', body);
}

export async function handleRateEpisode(
    params: RateEpisodeParams
): Promise<void> {
    const epDetails = await callApi<any>(
        `https://api.trakt.tv/shows/${params.mediaInfo.show.ids.trakt}/seasons/${params.episodeInfo.season}/episodes/${params.episodeInfo.number}`
    );
    const episodeId = epDetails?.ids?.trakt;
    if (!episodeId) throw new Error('Could not find Trakt ID for the episode.');
    const body = {
        episodes: [{ ids: { trakt: episodeId }, rating: params.rating }]
    };
    await callApi(`https://api.trakt.tv/sync/ratings`, 'POST', body);
}
