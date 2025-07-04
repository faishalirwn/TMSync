import {
    RateEpisodeParams,
    RateMovieParams,
    RateSeasonParams,
    RateShowParams
} from '../../types/messaging';
import { traktService } from '../../services/TraktService';

export async function handleRateMovie(params: RateMovieParams): Promise<void> {
    await traktService.rateMovie(params.mediaInfo.movie.ids, params.rating);
}

export async function handleRateShow(params: RateShowParams): Promise<void> {
    await traktService.rateShow(params.mediaInfo.show.ids, params.rating);
}

export async function handleRateSeason(
    params: RateSeasonParams
): Promise<void> {
    await traktService.rateSeason(
        params.mediaInfo.show.ids,
        params.episodeInfo.season,
        params.rating
    );
}

export async function handleRateEpisode(
    params: RateEpisodeParams
): Promise<void> {
    await traktService.rateEpisode(
        params.mediaInfo.show.ids,
        params.episodeInfo.season,
        params.episodeInfo.number,
        params.rating
    );
}
