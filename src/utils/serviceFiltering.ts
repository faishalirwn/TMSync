import { TrackerService } from '../types/services';
import { isServiceEnabled } from './servicePreferences';

/**
 * Filter services based on user preferences and authentication status
 * Only returns services that are both enabled by user AND authenticated
 */
export async function filterEnabledAuthenticatedServices(
    services: TrackerService[]
): Promise<TrackerService[]> {
    const filteredServices: TrackerService[] = [];

    for (const service of services) {
        const serviceType = service.getCapabilities().serviceType;

        // Check if user has enabled this service
        const userEnabled = await isServiceEnabled(serviceType);
        if (!userEnabled) {
            console.log(
                `🚫 Service ${serviceType} disabled by user preference`
            );
            continue;
        }

        // Check if service is authenticated
        const isAuthenticated = await service
            .isAuthenticated()
            .catch(() => false);
        if (!isAuthenticated) {
            console.log(`🚫 Service ${serviceType} not authenticated`);
            continue;
        }

        console.log(`✅ Service ${serviceType} enabled and authenticated`);
        filteredServices.push(service);
    }

    return filteredServices;
}
