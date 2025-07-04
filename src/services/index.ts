/**
 * Service initialization and registration
 *
 * This file sets up all tracking services and registers them
 * with the ServiceRegistry for multi-service functionality.
 */

import { serviceRegistry } from './ServiceRegistry';
import { traktService } from './TraktService';
import { aniListService } from './AniListService';

/**
 * Initialize and register all tracking services
 */
export function initializeServices(): void {
    // Register AniListService (only service fully implementing interface for now)
    serviceRegistry.registerService(aniListService, {
        serviceType: 'anilist',
        enabled: true,
        priority: 1
    });

    // TODO: Register TraktService once it properly implements TrackerService interface
    // serviceRegistry.registerService(traktService, {
    //     serviceType: 'trakt',
    //     enabled: true,
    //     priority: 2
    // });

    console.log('Multi-service architecture initialized:');
    console.log(
        '- Primary service:',
        serviceRegistry.getPrimaryService()?.getCapabilities().serviceType
    );
    console.log(
        '- Enabled services:',
        serviceRegistry
            .getEnabledServices()
            .map((s) => s.getCapabilities().serviceType)
    );
    console.log(
        '- Services with scrobbling:',
        serviceRegistry
            .getServicesWithCapability('supportsScrobbling')
            .map((s) => s.getCapabilities().serviceType)
    );
    console.log(
        '- Services with ratings:',
        serviceRegistry
            .getServicesWithCapability('supportsRatings')
            .map((s) => s.getCapabilities().serviceType)
    );
}

/**
 * Get all available services
 */
export function getServices() {
    return {
        registry: serviceRegistry,
        trakt: traktService,
        anilist: aniListService
    };
}

// Export individual services and registry
export { serviceRegistry, traktService, aniListService };
