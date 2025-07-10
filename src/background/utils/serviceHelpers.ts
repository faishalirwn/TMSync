import { serviceRegistry } from '../../services/ServiceRegistry';
import { filterEnabledAuthenticatedServices } from '../../utils/serviceFiltering';
import { TrackerService } from '../../types/services';
import { ServiceCapabilities } from '../../types/serviceTypes';

/**
 * Get all services with a specific capability that are enabled and authenticated
 * Eliminates the repeated pattern of: getServicesWithCapability + filterEnabledAuthenticatedServices
 */
export async function getActiveServicesForCapability(
    capability: keyof Pick<
        ServiceCapabilities,
        | 'supportsRatings'
        | 'supportsComments'
        | 'supportsRealTimeScrobbling'
        | 'supportsProgressTracking'
    >
): Promise<TrackerService[]> {
    const allServices = serviceRegistry.getServicesWithCapability(capability);
    return await filterEnabledAuthenticatedServices(allServices);
}

/**
 * Get services for scrobbling operations - returns both real-time and progress tracking
 */
export async function getScrobblingServices(): Promise<{
    realTimeServices: TrackerService[];
    progressTrackingServices: TrackerService[];
}> {
    const [realTimeServices, progressTrackingServices] = await Promise.all([
        getActiveServicesForCapability('supportsRealTimeScrobbling'),
        getActiveServicesForCapability('supportsProgressTracking')
    ]);

    return { realTimeServices, progressTrackingServices };
}
