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
    historyId: number;
}): Promise<void> {
    const allHistoryServices =
        serviceRegistry.getServicesWithCapability('supportsHistory');
    const historyServices =
        await filterEnabledAuthenticatedServices(allHistoryServices);

    for (const service of historyServices) {
        try {
            await service.removeFromHistory(params.historyId);
        } catch (error) {
            console.error(
                `Failed to remove from history on ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }
}
