import {
    RequestManualAddToHistoryParams,
    ScrobbleResponse
} from '../../types/messaging';
import { serviceRegistry } from '../../services/ServiceRegistry';
import { filterEnabledAuthenticatedServices } from '../../utils/serviceFiltering';

export async function handleManualAddToHistory(
    params: RequestManualAddToHistoryParams
): Promise<ScrobbleResponse> {
    const allHistoryServices =
        serviceRegistry.getServicesWithCapability('supportsHistory');
    const historyServices =
        await filterEnabledAuthenticatedServices(allHistoryServices);

    // Use primary service for history response (return the first successful result)
    for (const service of historyServices) {
        try {
            const result = await service.addToHistory(
                params.mediaInfo,
                params.episodeInfo || null
            );
            const historyId =
                typeof result.historyId === 'string'
                    ? parseInt(result.historyId, 10)
                    : result.historyId!;
            return { traktHistoryId: historyId };
        } catch (error) {
            console.error(
                `Failed to add to history on ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }

    throw new Error('No available services to add to history');
}

export async function handleUndoScrobble(params: {
    historyId?: number;
    serviceHistoryIds?: { [serviceType: string]: number | string };
}): Promise<void> {
    const allHistoryServices =
        serviceRegistry.getServicesWithCapability('supportsHistory');
    const historyServices =
        await filterEnabledAuthenticatedServices(allHistoryServices);

    console.log('🔄 Attempting to undo scrobble...');

    if (params.serviceHistoryIds) {
        console.log(
            '📋 Using service-specific history IDs:',
            params.serviceHistoryIds
        );

        // Use service-specific IDs for targeted removal
        for (const service of historyServices) {
            const serviceType = service.getCapabilities().serviceType;
            const serviceHistoryId = params.serviceHistoryIds[serviceType];

            if (serviceHistoryId) {
                try {
                    console.log(
                        `🗑️ Removing from ${serviceType} with ID: ${serviceHistoryId}`
                    );
                    await service.removeFromHistory(serviceHistoryId);
                    console.log(`✅ Successfully removed from ${serviceType}`);
                } catch (error) {
                    console.error(
                        `❌ Failed to remove from history on ${serviceType}:`,
                        error
                    );
                }
            } else {
                console.log(
                    `⚠️ No history ID found for ${serviceType}, skipping`
                );
            }
        }
    } else if (params.historyId) {
        // Legacy fallback - try to use single ID for all services
        console.log(`⚠️ Using legacy single history ID: ${params.historyId}`);

        for (const service of historyServices) {
            const serviceType = service.getCapabilities().serviceType;
            try {
                console.log(
                    `🗑️ Attempting to remove from ${serviceType} with ID: ${params.historyId}`
                );
                await service.removeFromHistory(params.historyId);
                console.log(`✅ Successfully removed from ${serviceType}`);
            } catch (error) {
                console.error(
                    `❌ Failed to remove from history on ${serviceType}:`,
                    error
                );
                // Don't fail the entire undo operation if one service fails
                // This is especially important since Trakt and AniList have different ID systems
            }
        }
    } else {
        throw new Error('No history IDs provided for undo operation');
    }
}
