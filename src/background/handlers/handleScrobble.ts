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

export async function handleScrobbleStart(
    params: RequestScrobbleStartParams,
    sender: chrome.runtime.MessageSender
): Promise<void> {
    if (!sender.tab?.id) throw new Error('Tab ID missing for scrobble start');
    const tabId = sender.tab.id;

    console.log(
        '🎬 Starting scrobble for:',
        params.mediaInfo.type,
        params.mediaInfo
    );

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

    // Start real-time scrobble on services that support it
    console.log('🚀 Starting real-time scrobbles...');
    for (const service of realTimeScrobblingServices) {
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
        }
    }

    // Update the global scrobble state (keeping legacy structure for now)
    scrobbleState.current = {
        tabId: tabId,
        mediaInfo: params.mediaInfo,
        episodeInfo: params.episodeInfo,
        currentProgress: params.progress,
        status: 'started',
        traktMediaType: params.mediaInfo.type === 'movie' ? 'movie' : 'episode',
        lastUpdateTime: Date.now(),
        previousScrobbledUrl: sender.tab.url
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

    // Get services that support real-time scrobbling (filtered by user preferences + auth)
    const allRealTimeServices = serviceRegistry.getServicesWithCapability(
        'supportsRealTimeScrobbling'
    );
    const realTimeScrobblingServices =
        await filterEnabledAuthenticatedServices(allRealTimeServices);

    // Get services that support progress tracking (currently unused)
    // const progressTrackingServices = serviceRegistry.getServicesWithCapability('supportsProgressTracking');

    // Update status to pausing for real-time scrobbling services
    realTimeScrobblingServices.forEach((service) => {
        const serviceType = service.getCapabilities().serviceType;
        serviceStatusManager.updateServiceActivity(
            serviceType,
            'pausing_scrobble'
        );
    });

    // Pause real-time scrobble on services that support it
    for (const service of realTimeScrobblingServices) {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await service.pauseScrobble(
                params.mediaInfo,
                params.episodeInfo || null,
                params.progress
            );
            serviceStatusManager.updateServiceActivity(serviceType, 'paused');
        } catch (error) {
            console.error(`Failed to pause scrobble on ${serviceType}:`, error);
            serviceStatusManager.updateServiceActivity(
                serviceType,
                'error',
                error instanceof Error ? error.message : 'Scrobble pause failed'
            );
        }
    }

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

    // Get services that support real-time scrobbling (filtered by user preferences + auth)
    const allRealTimeServices = serviceRegistry.getServicesWithCapability(
        'supportsRealTimeScrobbling'
    );
    const realTimeScrobblingServices =
        await filterEnabledAuthenticatedServices(allRealTimeServices);

    // Use primary service for stop response (fallback to traktService for legacy compatibility)
    const primaryService = realTimeScrobblingServices[0] || traktService;
    const serviceResponse = await primaryService.stopScrobble(
        params.mediaInfo,
        params.episodeInfo || null,
        params.progress
    );

    // Reset the global scrobble state
    resetActiveScrobbleState();

    // Map ServiceScrobbleResponse to ScrobbleStopResponseData
    const responseData: ScrobbleStopResponseData = {
        action: serviceResponse.action,
        traktHistoryId:
            typeof serviceResponse.historyId === 'string'
                ? parseInt(serviceResponse.historyId, 10)
                : serviceResponse.historyId
    };

    console.log('🎯 Mapped scrobble stop response:', {
        serviceResponse,
        responseData
    });

    return responseData;
}
