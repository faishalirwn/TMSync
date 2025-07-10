import {
    RateEpisodeParams,
    RateMovieParams,
    RateSeasonParams,
    RateShowParams,
    UnrateEpisodeParams,
    UnrateMovieParams,
    UnrateSeasonParams,
    UnrateShowParams
} from '../../types/messaging';
import { executeRatingOperation } from '../utils/serviceOperations';

export async function handleRateMovie(params: RateMovieParams): Promise<void> {
    await executeRatingOperation(
        (service, p) => service.rateMovie(p.mediaInfo.movie.ids, p.rating),
        params,
        'rated movie'
    );
}

export async function handleRateShow(params: RateShowParams): Promise<void> {
    await executeRatingOperation(
        (service, p) => service.rateShow(p.mediaInfo.show.ids, p.rating),
        params,
        'rated show'
    );
}

export async function handleRateSeason(
    params: RateSeasonParams
): Promise<void> {
    await executeRatingOperation(
        (service, p) =>
            service.rateSeason(
                p.mediaInfo.show.ids,
                p.episodeInfo.season,
                p.rating
            ),
        params,
        'rated season'
    );
}

export async function handleRateEpisode(
    params: RateEpisodeParams
): Promise<void> {
    await executeRatingOperation(
        (service, p) =>
            service.rateEpisode(
                p.mediaInfo.show.ids,
                p.episodeInfo.season,
                p.episodeInfo.number,
                p.rating
            ),
        params,
        'rated episode'
    );
}

export async function handleUnrateMovie(
    params: UnrateMovieParams
): Promise<void> {
    await executeRatingOperation(
        (service, p) => service.unrateMovie(p.mediaInfo.movie.ids),
        params,
        'unrated movie'
    );
}

export async function handleUnrateShow(
    params: UnrateShowParams
): Promise<void> {
    await executeRatingOperation(
        (service, p) => service.unrateShow(p.mediaInfo.show.ids),
        params,
        'unrated show'
    );
}

export async function handleUnrateSeason(
    params: UnrateSeasonParams
): Promise<void> {
    await executeRatingOperation(
        (service, p) =>
            service.unrateSeason(p.mediaInfo.show.ids, p.episodeInfo.season),
        params,
        'unrated season'
    );
}

export async function handleUnrateEpisode(
    params: UnrateEpisodeParams
): Promise<void> {
    await executeRatingOperation(
        (service, p) =>
            service.unrateEpisode(
                p.mediaInfo.show.ids,
                p.episodeInfo.season,
                p.episodeInfo.number
            ),
        params,
        'unrated episode'
    );
}
