import {
    RateEpisodeParams,
    RateMovieParams,
    RateSeasonParams,
    RateShowParams
} from '../../types/messaging';
import { serviceRegistry } from '../../services/ServiceRegistry';
import { filterEnabledAuthenticatedServices } from '../../utils/serviceFiltering';

export async function handleRateMovie(params: RateMovieParams): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    for (const service of ratingServices) {
        try {
            await service.rateMovie(params.mediaInfo.movie.ids, params.rating);
        } catch (error) {
            console.error(
                `Failed to rate movie on ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }
}

export async function handleRateShow(params: RateShowParams): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    for (const service of ratingServices) {
        try {
            await service.rateShow(params.mediaInfo.show.ids, params.rating);
        } catch (error) {
            console.error(
                `Failed to rate show on ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }
}

export async function handleRateSeason(
    params: RateSeasonParams
): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    for (const service of ratingServices) {
        try {
            await service.rateSeason(
                params.mediaInfo.show.ids,
                params.episodeInfo.season,
                params.rating
            );
        } catch (error) {
            console.error(
                `Failed to rate season on ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }
}

export async function handleRateEpisode(
    params: RateEpisodeParams
): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    for (const service of ratingServices) {
        try {
            await service.rateEpisode(
                params.mediaInfo.show.ids,
                params.episodeInfo.season,
                params.episodeInfo.number,
                params.rating
            );
        } catch (error) {
            console.error(
                `Failed to rate episode on ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }
}
