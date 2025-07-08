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
import { serviceRegistry } from '../../services/ServiceRegistry';
import { filterEnabledAuthenticatedServices } from '../../utils/serviceFiltering';

export async function handleRateMovie(params: RateMovieParams): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    // Rate movie on ALL services in parallel
    const ratingPromises = ratingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.rateMovie(params.mediaInfo.movie.ids, params.rating);
            console.log(`✅ Successfully rated movie on ${serviceType}`);
            return { serviceType, success: true };
        } catch (error) {
            console.error(`❌ Failed to rate movie on ${serviceType}:`, error);
            return { serviceType, success: false, error };
        }
    });

    await Promise.allSettled(ratingPromises);
}

export async function handleRateShow(params: RateShowParams): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    // Rate show on ALL services in parallel
    const ratingPromises = ratingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.rateShow(params.mediaInfo.show.ids, params.rating);
            console.log(`✅ Successfully rated show on ${serviceType}`);
            return { serviceType, success: true };
        } catch (error) {
            console.error(`❌ Failed to rate show on ${serviceType}:`, error);
            return { serviceType, success: false, error };
        }
    });

    await Promise.allSettled(ratingPromises);
}

export async function handleRateSeason(
    params: RateSeasonParams
): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    // Rate season on ALL services in parallel
    const ratingPromises = ratingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.rateSeason(
                params.mediaInfo.show.ids,
                params.episodeInfo.season,
                params.rating
            );
            console.log(`✅ Successfully rated season on ${serviceType}`);
            return { serviceType, success: true };
        } catch (error) {
            console.error(`❌ Failed to rate season on ${serviceType}:`, error);
            return { serviceType, success: false, error };
        }
    });

    await Promise.allSettled(ratingPromises);
}

export async function handleRateEpisode(
    params: RateEpisodeParams
): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    // Rate episode on ALL services in parallel
    const ratingPromises = ratingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.rateEpisode(
                params.mediaInfo.show.ids,
                params.episodeInfo.season,
                params.episodeInfo.number,
                params.rating
            );
            console.log(`✅ Successfully rated episode on ${serviceType}`);
            return { serviceType, success: true };
        } catch (error) {
            console.error(
                `❌ Failed to rate episode on ${serviceType}:`,
                error
            );
            return { serviceType, success: false, error };
        }
    });

    await Promise.allSettled(ratingPromises);
}

export async function handleUnrateMovie(
    params: UnrateMovieParams
): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    // Unrate movie on ALL services in parallel
    const unratingPromises = ratingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.unrateMovie(params.mediaInfo.movie.ids);
            console.log(`✅ Successfully unrated movie on ${serviceType}`);
            return { serviceType, success: true };
        } catch (error) {
            console.error(
                `❌ Failed to unrate movie on ${serviceType}:`,
                error
            );
            return { serviceType, success: false, error };
        }
    });

    await Promise.allSettled(unratingPromises);
}

export async function handleUnrateShow(
    params: UnrateShowParams
): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    // Unrate show on ALL services in parallel
    const unratingPromises = ratingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.unrateShow(params.mediaInfo.show.ids);
            console.log(`✅ Successfully unrated show on ${serviceType}`);
            return { serviceType, success: true };
        } catch (error) {
            console.error(`❌ Failed to unrate show on ${serviceType}:`, error);
            return { serviceType, success: false, error };
        }
    });

    await Promise.allSettled(unratingPromises);
}

export async function handleUnrateSeason(
    params: UnrateSeasonParams
): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    // Unrate season on ALL services in parallel
    const unratingPromises = ratingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.unrateSeason(
                params.mediaInfo.show.ids,
                params.episodeInfo.season
            );
            console.log(`✅ Successfully unrated season on ${serviceType}`);
            return { serviceType, success: true };
        } catch (error) {
            console.error(
                `❌ Failed to unrate season on ${serviceType}:`,
                error
            );
            return { serviceType, success: false, error };
        }
    });

    await Promise.allSettled(unratingPromises);
}

export async function handleUnrateEpisode(
    params: UnrateEpisodeParams
): Promise<void> {
    const allRatingServices =
        serviceRegistry.getServicesWithCapability('supportsRatings');
    const ratingServices =
        await filterEnabledAuthenticatedServices(allRatingServices);

    // Unrate episode on ALL services in parallel
    const unratingPromises = ratingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.unrateEpisode(
                params.mediaInfo.show.ids,
                params.episodeInfo.season,
                params.episodeInfo.number
            );
            console.log(`✅ Successfully unrated episode on ${serviceType}`);
            return { serviceType, success: true };
        } catch (error) {
            console.error(
                `❌ Failed to unrated episode on ${serviceType}:`,
                error
            );
            return { serviceType, success: false, error };
        }
    });

    await Promise.allSettled(unratingPromises);
}
