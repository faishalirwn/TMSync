import {
    RequestScrobblePauseParams,
    RequestScrobbleStartParams,
    RequestScrobbleStopParams
} from '../../types/messaging';
import { ScrobbleStopResponseData } from '../../types/scrobbling';
import { traktService } from '../../services/TraktService';
import { serviceRegistry } from '../../services/ServiceRegistry';
import { serviceStatusManager } from '../serviceStatusManager';
import { scrobbleState, resetActiveScrobbleState } from '../state';
import { filterEnabledAuthenticatedServices } from '../../utils/serviceFiltering';
import { isServiceEnabled } from '../../utils/servicePreferences';
import { scrobbleOperationManager } from '../scrobbleOperationManager';
import { TraktCooldownError } from '../../types/serviceTypes';

/**
 * Detects if an error from a service should be treated as a "successful failure"
 * (like conflicts/duplicates that indicate the operation already succeeded)
 */
function isServiceConflictError(error: any, serviceType: string): boolean {
    // Trakt 409 conflicts
    if (error instanceof TraktCooldownError) {
        return true;
    }

    // AniList conflicts (example patterns)
    if (serviceType === 'anilist') {
        // Check for AniList-specific conflict patterns
        if (
            error?.message?.includes('already exists') ||
            error?.message?.includes('duplicate') ||
            error?.status === 409
        ) {
            return true;
        }
    }

    // MAL conflicts (example patterns)
    if (serviceType === 'mal') {
        // Check for MAL-specific conflict patterns
        if (
            error?.message?.includes('already in list') ||
            error?.status === 409
        ) {
            return true;
        }
    }

    // Generic conflict detection
    if (
        error?.status === 409 ||
        error?.message?.toLowerCase().includes('conflict') ||
        error?.message?.toLowerCase().includes('duplicate')
    ) {
        return true;
    }

    return false;
}

export async function handleScrobbleStart(
    params: RequestScrobbleStartParams,
    sender: chrome.runtime.MessageSender
): Promise<void> {
    if (!sender.tab?.id) throw new Error('Tab ID missing for scrobble start');

    console.log(
        '🎬 Starting scrobble for:',
        params.mediaInfo.type,
        params.mediaInfo
    );

    // Use operation manager to deduplicate concurrent start requests
    console.log(
        '🔒 handleScrobbleStart called - checking for duplicate operations'
    );
    return scrobbleOperationManager.executeOperation(
        'start',
        params.mediaInfo,
        params.episodeInfo || null,
        async () => {
            console.log('🚀 executeScrobbleStart - executing unique operation');
            return await executeScrobbleStart(params, sender);
        }
    );
}

async function executeScrobbleStart(
    params: RequestScrobbleStartParams,
    sender: chrome.runtime.MessageSender
): Promise<void> {
    const tabId = sender.tab!.id;

    // Get services that support real-time scrobbling (filtered by user preferences + auth)
    const allRealTimeServices = serviceRegistry.getServicesWithCapability(
        'supportsRealTimeScrobbling'
    );
    const realTimeScrobblingServices =
        await filterEnabledAuthenticatedServices(allRealTimeServices);

    // Get services that support progress tracking (currently unused but ready for future implementation)
    // const progressTrackingServices = serviceRegistry.getServicesWithCapability('supportsProgressTracking');

    console.log('📊 Services available:');
    console.log(
        '- Real-time scrobbling services:',
        realTimeScrobblingServices.length
    );
    // console.log('- Progress tracking services:', progressTrackingServices.length);

    // Get all services for status updates
    const allServices = serviceRegistry.getAllServices();

    // Update status for different service types (handle async properly)
    for (const service of allServices) {
        const serviceType = service.getCapabilities().serviceType;
        const capabilities = service.getCapabilities();

        // Check if service is enabled by user preference
        const userEnabled = await isServiceEnabled(serviceType);
        if (!userEnabled) {
            serviceStatusManager.updateServiceActivity(serviceType, 'disabled');
            continue;
        }

        if (capabilities.supportsRealTimeScrobbling) {
            serviceStatusManager.updateServiceActivity(
                serviceType,
                'starting_scrobble'
            );
        } else if (capabilities.supportsProgressTracking) {
            serviceStatusManager.updateServiceActivity(
                serviceType,
                'tracking_progress'
            );
        } else {
            serviceStatusManager.updateServiceActivity(serviceType, 'idle');
        }
    }

    // If there's an active scrobble on a different tab, pause it first
    if (
        scrobbleState.current.tabId &&
        scrobbleState.current.tabId !== tabId &&
        scrobbleState.current.status === 'started'
    ) {
        // Use primary real-time scrobbling service for legacy state management
        const primaryScrobblingService =
            realTimeScrobblingServices[0] || traktService;
        await primaryScrobblingService.pauseScrobble(
            scrobbleState.current.mediaInfo!,
            scrobbleState.current.episodeInfo || null,
            scrobbleState.current.currentProgress
        );
    }

    // Start real-time scrobble on ALL services in parallel
    console.log('🚀 Starting real-time scrobbles in parallel...');
    const startPromises = realTimeScrobblingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        console.log(`📡 Starting scrobble on ${serviceType}...`);
        try {
            await service.startScrobble(
                params.mediaInfo,
                params.episodeInfo || null,
                params.progress
            );
            console.log(`✅ Successfully started scrobble on ${serviceType}`);
            serviceStatusManager.updateServiceActivity(
                serviceType,
                'scrobbling'
            );
            return { serviceType, success: true };
        } catch (error) {
            console.error(
                `❌ Failed to start scrobble on ${serviceType}:`,
                error
            );
            serviceStatusManager.updateServiceActivity(
                serviceType,
                'error',
                error instanceof Error ? error.message : 'Scrobble start failed'
            );
            return { serviceType, success: false, error };
        }
    });

    // Wait for all start operations to complete
    await Promise.allSettled(startPromises);

    // Update the global scrobble state (keeping legacy structure for now)
    scrobbleState.current = {
        tabId: tabId || null,
        mediaInfo: params.mediaInfo,
        episodeInfo: params.episodeInfo,
        currentProgress: params.progress,
        status: 'started',
        traktMediaType: params.mediaInfo.type === 'movie' ? 'movie' : 'episode',
        lastUpdateTime: Date.now(),
        previousScrobbledUrl: sender.tab?.url || ''
    };
}

export async function handleScrobblePause(
    params: RequestScrobblePauseParams,
    sender: chrome.runtime.MessageSender
): Promise<void> {
    if (!sender.tab?.id) throw new Error('Tab ID missing for scrobble pause');
    if (
        scrobbleState.current.tabId !== sender.tab.id ||
        scrobbleState.current.status !== 'started'
    ) {
        throw new Error('Scrobble not active on this tab or not started.');
    }

    // Use operation manager to deduplicate concurrent pause requests
    console.log(
        '🔒 handleScrobblePause called - checking for duplicate operations'
    );
    return scrobbleOperationManager.executeOperation(
        'pause',
        params.mediaInfo,
        params.episodeInfo || null,
        async () => {
            console.log('🚀 executeScrobblePause - executing unique operation');
            return await executeScrobblePause(params, sender);
        }
    );
}

async function executeScrobblePause(
    params: RequestScrobblePauseParams,
    _sender: chrome.runtime.MessageSender
): Promise<void> {
    // Get services that support real-time scrobbling (filtered by user preferences + auth)
    const allRealTimeServices = serviceRegistry.getServicesWithCapability(
        'supportsRealTimeScrobbling'
    );
    const realTimeScrobblingServices =
        await filterEnabledAuthenticatedServices(allRealTimeServices);

    // Get services that support progress tracking (currently unused)
    // const progressTrackingServices = serviceRegistry.getServicesWithCapability('supportsProgressTracking');

    // Update status for all real-time services (including disabled ones)
    for (const service of allRealTimeServices) {
        const serviceType = service.getCapabilities().serviceType;
        const userEnabled = await isServiceEnabled(serviceType);

        if (!userEnabled) {
            serviceStatusManager.updateServiceActivity(serviceType, 'disabled');
        } else {
            serviceStatusManager.updateServiceActivity(
                serviceType,
                'pausing_scrobble'
            );
        }
    }

    // Pause real-time scrobble on ALL services in parallel
    const pausePromises = realTimeScrobblingServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.pauseScrobble(
                params.mediaInfo,
                params.episodeInfo || null,
                params.progress
            );
            serviceStatusManager.updateServiceActivity(serviceType, 'paused');
            return { serviceType, success: true };
        } catch (error) {
            console.error(`Failed to pause scrobble on ${serviceType}:`, error);
            serviceStatusManager.updateServiceActivity(
                serviceType,
                'error',
                error instanceof Error ? error.message : 'Scrobble pause failed'
            );
            return { serviceType, success: false, error };
        }
    });

    // Wait for all pause operations to complete
    await Promise.allSettled(pausePromises);

    // Update the global scrobble state
    scrobbleState.current.currentProgress = params.progress;
    scrobbleState.current.status = 'paused';
    scrobbleState.current.lastUpdateTime = Date.now();
}

export async function handleScrobbleStop(
    params: RequestScrobbleStopParams,
    sender: chrome.runtime.MessageSender
): Promise<ScrobbleStopResponseData> {
    if (!sender.tab?.id) throw new Error('Tab ID missing for scrobble stop');
    if (scrobbleState.current.tabId !== sender.tab.id) {
        throw new Error('Scrobble not active on this tab for stop.');
    }

    // Use operation manager to deduplicate concurrent stop requests
    console.log(
        '🔒 handleScrobbleStop called - checking for duplicate operations'
    );
    return scrobbleOperationManager.executeOperation(
        'stop',
        params.mediaInfo,
        params.episodeInfo || null,
        async () => {
            console.log('🚀 executeScrobbleStop - executing unique operation');
            return await executeScrobbleStop(params, sender);
        }
    );
}

async function executeScrobbleStop(
    params: RequestScrobbleStopParams,
    _sender: chrome.runtime.MessageSender
): Promise<ScrobbleStopResponseData> {
    // Get services that support real-time scrobbling (filtered by user preferences + auth)
    const allRealTimeServices = serviceRegistry.getServicesWithCapability(
        'supportsRealTimeScrobbling'
    );
    const realTimeScrobblingServices =
        await filterEnabledAuthenticatedServices(allRealTimeServices);

    // Get services that support progress tracking (filtered by user preferences + auth)
    const allProgressTrackingServices =
        serviceRegistry.getServicesWithCapability('supportsProgressTracking');
    const progressTrackingServices = await filterEnabledAuthenticatedServices(
        allProgressTrackingServices
    );

    console.log('🎯 Processing stop with services:');
    console.log(
        '- Real-time scrobbling services:',
        realTimeScrobblingServices.length
    );
    console.log(
        '- Progress tracking services:',
        progressTrackingServices.length
    );

    // Process ALL services in parallel (both real-time and progress tracking)
    console.log('🚀 Processing all services in parallel...');

    // Collect service-specific history IDs
    const serviceHistoryIds: { [serviceType: string]: number | string } = {};
    let primaryServiceResponse: any = null;

    // Create promises for all enabled services
    const allServicePromises = [
        // Real-time scrobbling services (stopScrobble)
        ...realTimeScrobblingServices.map(async (service) => {
            const serviceType = service.getCapabilities().serviceType;
            try {
                console.log(`🛑 Stopping scrobble on ${serviceType}...`);
                const result = await service.stopScrobble(
                    params.mediaInfo,
                    params.episodeInfo || null,
                    params.progress
                );
                console.log(
                    `✅ Successfully stopped scrobble on ${serviceType}`
                );

                // Store service-specific history ID
                if (result.historyId) {
                    serviceHistoryIds[serviceType] = result.historyId;
                    console.log(
                        `💾 Stored ${serviceType} history ID: ${result.historyId}`
                    );
                }

                // Use first successful real-time service response as primary
                if (!primaryServiceResponse) {
                    primaryServiceResponse = result;
                }

                serviceStatusManager.updateServiceActivity(serviceType, 'idle');
                return { serviceType, success: true, result, type: 'stop' };
            } catch (error) {
                // Check if this is a "successful failure" (conflict/duplicate)
                const isConflictError = isServiceConflictError(
                    error,
                    serviceType
                );

                if (isConflictError) {
                    console.log(
                        `⚠️ Conflict detected for ${serviceType} stop - treating as success`
                    );
                    // Create a successful response with special conflict ID
                    const conflictResult = {
                        action: 'watched' as const,
                        historyId: -1, // Special ID for conflicts
                        serviceType: serviceType as any
                    };

                    serviceStatusManager.updateServiceActivity(
                        serviceType,
                        'idle'
                    );
                    return {
                        serviceType,
                        success: true,
                        result: conflictResult,
                        type: 'stop'
                    };
                }

                console.error(
                    `❌ Failed to stop scrobble on ${serviceType}:`,
                    error
                );
                serviceStatusManager.updateServiceActivity(
                    serviceType,
                    'error',
                    error instanceof Error
                        ? error.message
                        : 'Stop scrobble failed'
                );
                return { serviceType, success: false, error, type: 'stop' };
            }
        }),

        // Progress tracking services (addToHistory)
        ...progressTrackingServices.map(async (service) => {
            const serviceType = service.getCapabilities().serviceType;
            try {
                console.log(`📈 Adding to history on ${serviceType}...`);
                const result = await service.addToHistory(
                    params.mediaInfo,
                    params.episodeInfo || null
                );
                console.log(
                    `✅ Successfully added to history on ${serviceType}`
                );

                // Store service-specific history ID
                if (result.historyId) {
                    serviceHistoryIds[serviceType] = result.historyId;
                    console.log(
                        `💾 Stored ${serviceType} history ID: ${result.historyId}`
                    );
                }

                serviceStatusManager.updateServiceActivity(serviceType, 'idle');
                return { serviceType, success: true, result, type: 'history' };
            } catch (error) {
                // Check if this is a "successful failure" (conflict/duplicate)
                const isConflictError = isServiceConflictError(
                    error,
                    serviceType
                );

                if (isConflictError) {
                    console.log(
                        `⚠️ Conflict detected for ${serviceType} addToHistory - treating as success`
                    );
                    // Create a successful response with special conflict ID
                    const conflictResult = {
                        historyId: -1 // Special ID for conflicts
                    };

                    serviceStatusManager.updateServiceActivity(
                        serviceType,
                        'idle'
                    );
                    return {
                        serviceType,
                        success: true,
                        result: conflictResult,
                        type: 'history'
                    };
                }

                console.error(
                    `❌ Failed to add to history on ${serviceType}:`,
                    error
                );
                serviceStatusManager.updateServiceActivity(
                    serviceType,
                    'error',
                    error instanceof Error
                        ? error.message
                        : 'Progress tracking failed'
                );
                return { serviceType, success: false, error, type: 'history' };
            }
        })
    ];

    // Wait for ALL service operations to complete in parallel
    const results = await Promise.allSettled(allServicePromises);

    // Log results for debugging
    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            console.log(`✅ Service ${index} completed:`, result.value);
        } else {
            console.log(`❌ Service ${index} failed:`, result.reason);
        }
    });

    // Reset the global scrobble state
    resetActiveScrobbleState();

    // Use primary service response or create fallback
    const serviceResponse = primaryServiceResponse || {
        action: 'watched',
        historyId: null
    };

    // Map ServiceScrobbleResponse to ScrobbleStopResponseData
    const responseData: ScrobbleStopResponseData = {
        action: serviceResponse.action,
        traktHistoryId:
            typeof serviceResponse.historyId === 'string'
                ? parseInt(serviceResponse.historyId, 10)
                : serviceResponse.historyId,
        serviceHistoryIds:
            Object.keys(serviceHistoryIds).length > 0
                ? serviceHistoryIds
                : undefined
    };

    console.log('🎯 Mapped scrobble stop response:', {
        serviceResponse,
        responseData
    });

    return responseData;
}
