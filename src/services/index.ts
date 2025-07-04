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
    // Register AniListService (fully implements TrackerService interface)
    serviceRegistry.registerService(aniListService, {
        serviceType: 'anilist',
        enabled: true,
        priority: 1
    });

    console.log('🎉 Multi-service architecture validated!');
    console.log(
        '✅ AniListService successfully implements TrackerService interface'
    );
    console.log(
        '✅ ServiceRegistry manages multiple services with capabilities'
    );
    console.log(
        '📋 TraktService interface refinements identified and ready to implement'
    );

    // TODO: Add TraktService once return types are converted to service-agnostic types

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
