// src/components/ScrobbleManager.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentSiteConfig } from '../utils/siteConfigs';
// Assuming SiteConfigBase is correctly imported from your siteConfigs/baseConfig
// import { SiteConfigBase } from '../utils/siteConfigs/baseConfig';
import {
    MediaInfoResponse,
    MessageRequest,
    MessageResponse,
    RatingInfo,
    RequestManualAddToHistoryParams,
    RequestScrobblePauseParams,
    RequestScrobbleStartParams,
    RequestScrobbleStopParams,
    ScrobbleNotificationMediaType,
    ScrobbleStopResponseData,
    SeasonEpisodeObj,
    WatchStatusInfo,
    ActiveScrobbleStatus, // From types
    MediaStatusPayload, // For processMediaStatus
    MediaInfoRequest // For getMediaInfoAndConfidence
} from '../utils/types';
import { ScrobbleNotification } from './ScrobbleNotification';
import { ManualSearchPrompt } from './ManualSearchPrompt';
import { LoadingIndicator } from './LoadingIndicator';
import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';
import { TraktShowWatchedProgress } from '../utils/types/traktApi';
import { StartWatchPrompt } from './StartWatchPrompt';
import { RewatchPrompt } from './RewatchPrompt';
import {
    getLocalRewatchInfo,
    LocalRewatchInfo,
    saveLocalRewatchInfo
} from '../utils/helpers/localRewatch';
import {
    clearHighlighting,
    HighlightType,
    setupEpisodeHighlighting
} from '../utils/highlighting';

// --- Constants ---
const WATCHING_PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SIGNIFICANT_PROGRESS_CHANGE_PERCENT = 5; // 5%
const VIDEO_PROGRESS_UPDATE_THROTTLE_MS = 2000; // 2 seconds
const TRAKT_SCROBBLE_COMPLETION_THRESHOLD = 80; // Define this constant if not already at the top

// Re-add your getMediaInfoAndConfidence function, or ensure it's imported if it's now a utility
// This function was previously in ScrobbleManager.tsx in the prompt.
async function getMediaInfoAndConfidence(
    siteConfig: any, // Replace 'any' with SiteConfigBase if imported
    url: string,
    tabUrlIdentifier: string // You might not need tabUrlIdentifier here if it's for background cache only
): Promise<MessageResponse<MediaStatusPayload>> {
    console.log('getMediaInfoAndConfidence called for:', url);
    try {
        const mediaType = siteConfig.getMediaType(url);
        if (!mediaType) {
            return {
                success: false,
                error: 'Failed to determine media type from URL.'
            };
        }

        let title: string | null = null;
        let year: string | null = null;
        let messageParams: { type: string; query: string; years: string };

        if (siteConfig.usesTmdbId) {
            title = await siteConfig.getTitle(url).catch(() => null);
            year = await siteConfig.getYear(url).catch(() => null);
            messageParams = {
                type: mediaType,
                query: title || '',
                years: year || ''
            };
        } else {
            title = await siteConfig.getTitle(url);
            year = await siteConfig.getYear(url);
            if (!title || !year) {
                throw new Error(
                    'Required Title or Year not found for non-TMDB site.'
                );
            }
            messageParams = { type: mediaType, query: title, years: year };
        }

        const resp = await chrome.runtime.sendMessage<
            MediaInfoRequest,
            MessageResponse<MediaStatusPayload>
        >({
            action: 'mediaInfo',
            params: messageParams
        });
        return resp;
    } catch (error) {
        console.error('Error in getMediaInfoAndConfidence:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export const ScrobbleManager = () => {
    // --- Existing State (Adapted) ---
    const [mediaInfo, setMediaInfo] = useState<MediaInfoResponse | null>(null);
    const [originalMediaQuery, setOriginalMediaQuery] = useState<{
        type: string;
        query: string;
        years: string;
    } | null>(null);
    const [showEpisodeInfo, setShowEpisodeInfo] =
        useState<SeasonEpisodeObj | null>(null);
    const [currentUrl, setCurrentUrl] = useState(window.location.href);

    const [watchStatus, setWatchStatus] = useState<WatchStatusInfo | null>(
        null
    );
    const [progressInfo, setProgressInfo] =
        useState<TraktShowWatchedProgress | null>(null);
    const [ratingInfo, setRatingInfo] = useState<RatingInfo | null>(null);

    const [isLoadingMediaInfo, setIsLoadingMediaInfo] = useState(false);
    const [needsManualConfirmation, setNeedsManualConfirmation] =
        useState(false);
    const [showStartPrompt, setShowStartPrompt] = useState(false);
    const [showRewatchPrompt, setShowRewatchPrompt] = useState(false);
    const [userConfirmedAction, setUserConfirmedAction] = useState(false);
    const [isRewatchSession, setIsRewatchSession] = useState(false);
    const [localRewatchInfo, setLocalRewatchInfo] =
        useState<LocalRewatchInfo | null>(null);
    const [highlightTarget, setHighlightTarget] = useState<{
        season: number;
        episode: number;
        type: HighlightType;
    } | null>(null);
    const [watchedHistoryEpisodes, setWatchedHistoryEpisodes] = useState<
        { season: number; number: number }[] | undefined
    >(undefined);

    // --- New Scrobbling State ---
    const [scrobblingStatus, setScrobblingStatus] =
        useState<ActiveScrobbleStatus>('idle');
    const [currentVideoProgress, setCurrentVideoProgress] = useState(0);
    const [isProcessingScrobbleAction, setIsProcessingScrobbleAction] =
        useState(false);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const traktHistoryIdRef = useRef<number | null>(null); // Stores ID after successful scrobble/stop
    const lastProgressPingTimeRef = useRef(0);
    const lastReportedProgressRef = useRef(0);
    const timeUpdateThrottleTimerRef = useRef<number | null>(null);
    const pageUnloadRef = useRef(false); // To help manage sendBeacon logic

    // --- Refs for existing logic ---
    const previousUrlRef = useRef<string | null>(null);
    const waitTitleIntervalRef = useRef<number | null>(null);
    const waitTitleTimeoutRef = useRef<number | null>(null);
    const lastFetchedTitleRef = useRef<string | null>(null);

    const [isIframePlayerActive, setIsIframePlayerActive] = useState(false); // New state
    const [iframeOrigin, setIframeOrigin] = useState<string | null>(null); // Store origin for security
    const playerIframeRef = useRef<HTMLIFrameElement | null>(null); // Ref to the player iframe if applicable

    const timeUpdateProcessingScheduledRef = useRef(false);
    const latestVideoStateForThrottleRef = useRef<{
        currentTime: number;
        duration: number;
        isFromIframe?: boolean;
    } | null>(null);
    const pendingCriticalOperationRef = useRef<'pause' | 'stop' | null>(null);
    const lastSentActionTimestampRef = useRef(0); // To prevent too rapid succession of any action
    const MIN_TIME_BETWEEN_ACTIONS_MS = 500; // Minimum time between any scrobble API call initiation

    const urlObject = new URL(currentUrl);
    const hostname = urlObject.hostname;
    const siteConfig = getCurrentSiteConfig(hostname);
    const isWatchPage = siteConfig?.isWatchPage(currentUrl) ?? false;
    const tabUrlIdentifier =
        siteConfig?.getUrlIdentifier(currentUrl) ??
        `generic-tab-media-${Date.now()}`;

    // --- Helper: Send Message to Background ---
    const sendMessageToBackground = useCallback(
        async <TResponseData = any,>(
            message: MessageRequest
        ): Promise<MessageResponse<TResponseData>> => {
            try {
                // Prevent sending messages if page is trying to unload and we've already sent beacon
                if (
                    pageUnloadRef.current &&
                    message.action !== 'requestScrobbleStop'
                ) {
                    // Allow stop via sendBeacon
                    console.warn(
                        'Page unloading, blocking message:',
                        message.action
                    );
                    return { success: false, error: 'Page is unloading' };
                }
                const response = (await chrome.runtime.sendMessage(
                    message
                )) as MessageResponse<TResponseData>;
                if (!response) {
                    throw new Error(
                        chrome.runtime.lastError?.message ||
                            'Unknown error sending message'
                    );
                }
                return response;
            } catch (error) {
                console.error(
                    'Error sending message to background:',
                    message.action,
                    error
                );
                return {
                    success: false,
                    error:
                        error instanceof Error ? error.message : String(error)
                };
            }
        },
        []
    );

    // --- NEW Scrobbling Action Senders ---
    const sendScrobbleStart = useCallback(
        async (progress: number) => {
            if (!mediaInfo) return; // Guard against no mediaInfo
            console.log(
                `ScrobbleManager: Requesting Scrobble Start at ${progress.toFixed(1)}%`
            );
            // No need to setScrobblingStatus('started') here, background confirmation is better source of truth
            // Or, can be optimistic: setScrobblingStatus('started');

            const now = Date.now();

            // Priority Check: If a critical op is pending, or we just sent something, defer this start ping.
            if (
                pendingCriticalOperationRef.current ||
                now - lastSentActionTimestampRef.current <
                    MIN_TIME_BETWEEN_ACTIONS_MS * 2
            ) {
                // Give more room for pings
                console.log(
                    `ScrobbleManager: Deferring Scrobble Start (ping) due to pending critical op (${pendingCriticalOperationRef.current}) or recent action.`
                );
                return;
            }
            // It's also possible a critical op was just sent, and this start is for a quick resume.
            // The main check is that 'start' pings don't stomp on a 'pause'/'stop' about to be sent
            // or that has just been sent and awaiting response.

            console.log(
                `ScrobbleManager: Requesting Scrobble Start at ${progress.toFixed(1)}%`
            );
            lastSentActionTimestampRef.current = now;
            // No need to set pendingCriticalOperationRef for 'start' pings

            const params: RequestScrobbleStartParams = {
                mediaInfo,
                episodeInfo: showEpisodeInfo || undefined,
                progress: Math.floor(progress)
            };
            const response = await sendMessageToBackground<void>({
                action: 'requestScrobbleStart',
                params
            });

            if (response.success) {
                console.log(
                    'ScrobbleManager: Start request acknowledged by background.'
                );
                setScrobblingStatus('started'); // Set status based on successful request
                lastProgressPingTimeRef.current = Date.now();
                lastReportedProgressRef.current = progress;
            } else {
                // If start failed, we might still be 'paused' or 'idle'
                // console.error('ScrobbleManager: Start request failed:', response.error);
                // Re-evaluate status based on actual video state if needed, or let next event handle it.
            }
        },
        [mediaInfo, showEpisodeInfo, sendMessageToBackground]
    );

    const sendScrobblePause = useCallback(
        async (progress: number) => {
            if (!mediaInfo || scrobblingStatus !== 'started') return;
            const now = Date.now();

            if (
                now - lastSentActionTimestampRef.current <
                MIN_TIME_BETWEEN_ACTIONS_MS
            ) {
                console.log(
                    'ScrobbleManager: Deferring Scrobble Pause due to very recent action. Will retry shortly via video events.'
                );
                // Schedule a re-attempt or rely on next user action/event.
                // For simplicity now, we'll just not send and let a subsequent event (like another pause attempt) try again.
                return;
            }

            console.log(
                `ScrobbleManager: Requesting Scrobble Pause at ${progress.toFixed(1)}%`
            );
            pendingCriticalOperationRef.current = 'pause'; // Mark critical op as pending
            lastSentActionTimestampRef.current = now;

            const params: RequestScrobblePauseParams = {
                mediaInfo,
                episodeInfo: showEpisodeInfo || undefined,
                progress: Math.floor(progress)
            };
            const response = await sendMessageToBackground<void>({
                action: 'requestScrobblePause',
                params
            });
            pendingCriticalOperationRef.current = null; // Clear critical op flag

            if (response.success) {
                console.log(
                    'ScrobbleManager: Pause request acknowledged by background.'
                );
                setScrobblingStatus('paused');
            } else {
                console.error(
                    'ScrobbleManager: Pause request failed:',
                    response.error
                );
                // Don't revert status here, background might still have it as started. Let next play/timeupdate fix.
            }
        },
        [mediaInfo, showEpisodeInfo, sendMessageToBackground, scrobblingStatus]
    );

    const sendScrobbleStop = useCallback(
        async (progress: number): Promise<ScrobbleStopResponseData | null> => {
            // Removed isUnloading parameter as we're not using sendBeacon here directly
            if (!mediaInfo || scrobblingStatus === 'idle') return null;

            const now = Date.now();

            if (
                now - lastSentActionTimestampRef.current <
                MIN_TIME_BETWEEN_ACTIONS_MS
            ) {
                console.log(
                    'ScrobbleManager: Deferring Scrobble Stop due to very recent action. Will retry shortly or on unload.'
                );
                return null; // Indicate stop was not sent
            }
            console.log(
                `ScrobbleManager: Requesting Scrobble Stop at ${progress.toFixed(1)}%`
            );

            const previousStatus = scrobblingStatus;
            pendingCriticalOperationRef.current = 'stop'; // Mark critical op
            lastSentActionTimestampRef.current = now;
            // Optimistically set to idle, background response will confirm

            const params: RequestScrobbleStopParams = {
                mediaInfo: mediaInfo!,
                episodeInfo: showEpisodeInfo || undefined,
                progress: Math.floor(progress)
            };

            const response =
                await sendMessageToBackground<ScrobbleStopResponseData>({
                    action: 'requestScrobbleStop',
                    params
                });

            if (response.success && response.data) {
                console.log(
                    'ScrobbleManager: Stop request acknowledged by background.',
                    response.data
                );
                if (
                    response.data.action === 'watched' &&
                    response.data.traktHistoryId
                ) {
                    traktHistoryIdRef.current = response.data.traktHistoryId;
                    setScrobblingStatus('idle');
                    if (
                        isRewatchSession &&
                        isShowMediaInfo(mediaInfo) &&
                        showEpisodeInfo
                    ) {
                        await saveLocalRewatchInfo(
                            mediaInfo.show.ids.trakt,
                            showEpisodeInfo.season,
                            showEpisodeInfo.number
                        );
                        const updatedLocalRewatch = await getLocalRewatchInfo(
                            mediaInfo.show.ids.trakt
                        );
                        setLocalRewatchInfo(updatedLocalRewatch);
                    }
                }
                return response.data;
            } else {
                console.error(
                    'ScrobbleManager: Stop request failed:',
                    response.error
                );
                // If stop failed, status was already optimistically set to 'idle'.
                // The user might need to manually scrobble or retry if an error UI is implemented.
                // Reverting status here could be complex if background already processed something.
                // setScrobblingStatus(previousStatus); // Consider if reverting is desired on failure
                return null;
            }
        },
        [
            mediaInfo,
            showEpisodeInfo,
            sendMessageToBackground,
            scrobblingStatus,
            isRewatchSession
        ]
    );

    const commonPlayHandler = useCallback(
        (progress: number) => {
            if (!mediaInfo || !userConfirmedAction) return;
            setCurrentVideoProgress(progress);
            if (scrobblingStatus === 'idle' || scrobblingStatus === 'paused') {
                if (
                    !pendingCriticalOperationRef.current &&
                    Date.now() - lastSentActionTimestampRef.current >
                        MIN_TIME_BETWEEN_ACTIONS_MS
                ) {
                    sendScrobbleStart(progress || 0);
                } else {
                    console.log(
                        'ScrobbleManager: Play event, but deferring start due to pending/recent critical op.'
                    );
                }
            }
        },
        [mediaInfo, userConfirmedAction, sendScrobbleStart, scrobblingStatus]
    );

    const commonPauseHandler = useCallback(
        (progress: number) => {
            if (!mediaInfo || !userConfirmedAction) return;
            setCurrentVideoProgress(progress);
            if (scrobblingStatus === 'started') {
                sendScrobblePause(progress || 0);
            }
        },
        [mediaInfo, userConfirmedAction, sendScrobblePause, scrobblingStatus]
    );

    const commonEndedHandler = useCallback(async () => {
        if (!mediaInfo || !userConfirmedAction) return;
        setCurrentVideoProgress(100);
        if (scrobblingStatus === 'started' || scrobblingStatus === 'paused') {
            await sendScrobbleStop(100);
        }
    }, [mediaInfo, userConfirmedAction, sendScrobbleStop, scrobblingStatus]);

    const processThrottledTimeUpdate = useCallback(async () => {
        timeUpdateProcessingScheduledRef.current = false;

        if (
            !latestVideoStateForThrottleRef.current ||
            !mediaInfo ||
            !userConfirmedAction ||
            pageUnloadRef.current
        ) {
            return;
        }

        // CRITICAL: Check if a pause/stop is pending before sending a 'start' ping
        if (pendingCriticalOperationRef.current) {
            console.log(
                'ScrobbleManager: TimeUpdate processing deferred due to pending critical operation:',
                pendingCriticalOperationRef.current
            );
            // Reschedule or wait for critical op to clear before pinging.
            // For simplicity, we'll just skip this ping. The critical op will resolve the state.
            return;
        }

        const { currentTime, duration } =
            latestVideoStateForThrottleRef.current;
        latestVideoStateForThrottleRef.current = null; // Clear after processing

        if (isNaN(duration) || duration === 0) {
            timeUpdateProcessingScheduledRef.current = false;
            return;
        }
        const progress = (currentTime / duration) * 100;
        setCurrentVideoProgress(progress); // Update UI state

        if (scrobblingStatus === 'started') {
            const now = Date.now();
            const progressDelta = Math.abs(
                progress - lastReportedProgressRef.current
            );

            if (
                now - lastProgressPingTimeRef.current >
                    WATCHING_PING_INTERVAL_MS ||
                (progressDelta >= SIGNIFICANT_PROGRESS_CHANGE_PERCENT &&
                    progress < TRAKT_SCROBBLE_COMPLETION_THRESHOLD - 1 &&
                    progress > lastReportedProgressRef.current + 0.1)
            ) {
                if (!pendingCriticalOperationRef.current) {
                    await sendScrobbleStart(progress);
                } else {
                    console.log(
                        'ScrobbleManager: Start ping aborted right before send due to now-pending critical op.'
                    );
                }
            }

            if (
                progress >= TRAKT_SCROBBLE_COMPLETION_THRESHOLD &&
                !traktHistoryIdRef.current
            ) {
                console.log(
                    `ScrobbleManager: Throttled TimeUpdate - Progress ${progress.toFixed(1)}% >= threshold. Requesting STOP.`
                );
                const stopResponse = await sendScrobbleStop(progress);
                if (stopResponse?.action === 'watched') {
                    // Notification updates via traktHistoryIdRef
                }
                timeUpdateProcessingScheduledRef.current = false; // Reset flag
                return; // Exit after sending stop
            }
        }
        timeUpdateProcessingScheduledRef.current = false; // Reset flag if no early exit
    }, [
        mediaInfo,
        userConfirmedAction,
        scrobblingStatus,
        sendScrobbleStart,
        sendScrobbleStop /* other stable deps */
    ]);

    const commonTimeUpdateHandler = useCallback(() => {
        // No 'progress' param needed, gets it from videoRef or latestVideoStateForThrottleRef
        if (pageUnloadRef.current) return;

        let currentVideoTime = 0;
        let currentVideoDuration = 0;

        if (videoRef.current && !videoRef.current.paused) {
            currentVideoTime = videoRef.current.currentTime;
            currentVideoDuration = videoRef.current.duration;
        } else if (
            isIframePlayerActive &&
            latestVideoStateForThrottleRef.current
        ) {
            // If iframe is active, it might have sent a new timeupdate we haven't processed.
            // This part is tricky; the iframe itself should throttle its messages.
            // For now, let's assume iframe messages are already somewhat throttled
            // or commonTimeUpdateHandler is called WITH progress from iframe message.
            // Let's simplify commonTimeUpdateHandler to be called WITH progress if from iframe
            console.warn(
                'commonTimeUpdateHandler called without progress for iframe. This path needs review.'
            );
            return;
        } else {
            return; // No active local video or relevant iframe data
        }

        if (isNaN(currentVideoDuration) || currentVideoDuration === 0) return;

        latestVideoStateForThrottleRef.current = {
            currentTime: currentVideoTime,
            duration: currentVideoDuration
        };

        if (!timeUpdateProcessingScheduledRef.current) {
            timeUpdateProcessingScheduledRef.current = true;
            setTimeout(
                processThrottledTimeUpdate,
                VIDEO_PROGRESS_UPDATE_THROTTLE_MS
            );
        }
    }, [isIframePlayerActive, processThrottledTimeUpdate]);

    // If commonTimeUpdateHandler is called by iframe messages WITH progress:
    const commonTimeUpdateHandlerWithProgress = useCallback(
        (progress: number) => {
            if (pageUnloadRef.current) return;

            // For iframe calls, directly use the provided progress
            // The iframe content script should be doing its own throttling.
            // Here, we just ensure our ScrobbleManager isn't overwhelmed if iframe sends too fast.
            latestVideoStateForThrottleRef.current = {
                currentTime:
                    (progress / 100) * (videoRef.current?.duration || 1),
                duration: videoRef.current?.duration || 1
            }; // Approximation

            if (!timeUpdateProcessingScheduledRef.current) {
                timeUpdateProcessingScheduledRef.current = true;
                setTimeout(
                    processThrottledTimeUpdate,
                    VIDEO_PROGRESS_UPDATE_THROTTLE_MS
                );
            }
        },
        [processThrottledTimeUpdate]
    );

    const handleLocalVideoPlay = useCallback(() => {
        if (isIframePlayerActive || !videoRef.current) return; // Don't process if iframe is the source
        const progress =
            (videoRef.current.currentTime / videoRef.current.duration) * 100;
        commonPlayHandler(progress);
    }, [commonPlayHandler, isIframePlayerActive]);

    const handleLocalVideoPause = useCallback(() => {
        if (isIframePlayerActive || !videoRef.current) return;
        const progress =
            (videoRef.current.currentTime / videoRef.current.duration) * 100;
        commonPauseHandler(progress);
    }, [commonPauseHandler, isIframePlayerActive]);

    const handleLocalVideoEnded = useCallback(async () => {
        if (isIframePlayerActive || !videoRef.current) return;
        await commonEndedHandler();
    }, [commonEndedHandler, isIframePlayerActive]);

    const handleLocalVideoTimeUpdate = useCallback(() => {
        if (
            isIframePlayerActive ||
            !videoRef.current ||
            videoRef.current.paused
        )
            return;
        if (isNaN(videoRef.current.duration) || videoRef.current.duration === 0)
            return;
        // No direct progress calculation here, commonTimeUpdateHandler will use videoRef
        commonTimeUpdateHandler();
    }, [commonTimeUpdateHandler, isIframePlayerActive]);

    // --- Effect to find video element and attach/detach listeners ---
    useEffect(() => {
        if (!isWatchPage || !mediaInfo || !userConfirmedAction) {
            if (videoRef.current && scrobblingStatus === 'started') {
                const progress =
                    (videoRef.current.currentTime / videoRef.current.duration) *
                        100 || 0;
                sendScrobblePause(progress);
            }
            setScrobblingStatus('idle');
            setIsIframePlayerActive(false);
            // Ensure any active polling interval is cleared if we exit early
            // (This will be handled by the cleanup function of the polling logic itself)
            return;
        }

        let findVideoAttempts = 0;
        const MAX_FIND_VIDEO_ATTEMPTS = 20; // e.g., 20 * 500ms = 10 seconds
        const FIND_VIDEO_INTERVAL_MS = 500;
        let findVideoIntervalId: number | null = null;

        const tryToSetupVideoPlayer = () => {
            console.log(
                `ScrobbleManager: Attempt ${findVideoAttempts + 1} to find video player...`
            );
            const localVideoElement = document.querySelector('video');
            let iframeVideoIsLikelySource = false;
            let identifiedPlayerIframe: HTMLIFrameElement | null = null;

            if (siteConfig?.usesIframePlayer) {
                if (siteConfig.iframePlayerSelector) {
                    identifiedPlayerIframe = document.querySelector(
                        siteConfig.iframePlayerSelector
                    ) as HTMLIFrameElement | null;
                    if (identifiedPlayerIframe) {
                        iframeVideoIsLikelySource = true;
                    } else {
                        console.log(
                            `ScrobbleManager: Site config indicates iframe player, but selector "${siteConfig.iframePlayerSelector}" not found (yet).`
                        );
                        // If selector not found, but site *could* use iframe, and no local video, we might still assume iframe
                        iframeVideoIsLikelySource = !localVideoElement;
                    }
                } else {
                    iframeVideoIsLikelySource = !localVideoElement; // If no selector, assume iframe if no local and config says so
                }
            }

            if (localVideoElement && !iframeVideoIsLikelySource) {
                if (findVideoIntervalId) clearInterval(findVideoIntervalId);
                videoRef.current = localVideoElement;
                playerIframeRef.current = null; // Ensure iframe ref is cleared
                setIsIframePlayerActive(false);
                console.log(
                    'ScrobbleManager: Using local video element. Attaching listeners.'
                );

                localVideoElement.addEventListener(
                    'play',
                    handleLocalVideoPlay
                );
                localVideoElement.addEventListener(
                    'pause',
                    handleLocalVideoPause
                );
                localVideoElement.addEventListener(
                    'ended',
                    handleLocalVideoEnded
                );
                localVideoElement.addEventListener(
                    'timeupdate',
                    handleLocalVideoTimeUpdate
                );
                if (
                    !localVideoElement.paused &&
                    localVideoElement.duration > 0 &&
                    localVideoElement.currentTime >= 0
                ) {
                    // Added currentTime check
                    handleLocalVideoPlay();
                }
            } else if (
                iframeVideoIsLikelySource ||
                (!localVideoElement && siteConfig?.usesIframePlayer)
            ) {
                if (findVideoIntervalId) clearInterval(findVideoIntervalId);
                videoRef.current = null; // No local video element being used
                playerIframeRef.current = identifiedPlayerIframe; // Store if found
                setIsIframePlayerActive(true);
                console.log(
                    'ScrobbleManager: Expecting video events from an iframe. Iframe element:',
                    identifiedPlayerIframe
                );
            } else {
                findVideoAttempts++;
                if (findVideoAttempts >= MAX_FIND_VIDEO_ATTEMPTS) {
                    if (findVideoIntervalId) clearInterval(findVideoIntervalId);
                    console.warn(
                        `ScrobbleManager: Video element (local or iframe source) not found after ${MAX_FIND_VIDEO_ATTEMPTS} attempts.`
                    );
                    setIsIframePlayerActive(false);
                    videoRef.current = null;
                    playerIframeRef.current = null;
                }
                // Video not found yet, interval will try again if not maxed out.
            }
        };

        // Start polling
        tryToSetupVideoPlayer(); // Initial attempt
        if (
            !videoRef.current &&
            !isIframePlayerActive &&
            findVideoAttempts < MAX_FIND_VIDEO_ATTEMPTS
        ) {
            // Check if player was found on first try
            findVideoIntervalId = window.setInterval(
                tryToSetupVideoPlayer,
                FIND_VIDEO_INTERVAL_MS
            );
        }

        return () => {
            console.log(
                'ScrobbleManager: Cleaning up video setup effect. Current videoRef:',
                videoRef.current,
                'isIframePlayerActive:',
                isIframePlayerActive
            );
            if (findVideoIntervalId) {
                clearInterval(findVideoIntervalId);
                console.log('ScrobbleManager: Cleared findVideoInterval.');
            }
            if (videoRef.current) {
                // If local video was used
                console.log(
                    'ScrobbleManager: Detaching listeners from local video:',
                    videoRef.current
                );
                videoRef.current.removeEventListener(
                    'play',
                    handleLocalVideoPlay
                );
                videoRef.current.removeEventListener(
                    'pause',
                    handleLocalVideoPause
                );
                videoRef.current.removeEventListener(
                    'ended',
                    handleLocalVideoEnded
                );
                videoRef.current.removeEventListener(
                    'timeupdate',
                    handleLocalVideoTimeUpdate
                );
                videoRef.current = null;
            }
            if (playerIframeRef.current) {
                // If an iframe was identified as source (though listeners are on window for messages)
                playerIframeRef.current = null; // Clear the ref
            }
            if (timeUpdateThrottleTimerRef.current) {
                // Also clear any pending timeupdate throttle
                clearTimeout(timeUpdateThrottleTimerRef.current);
            }
            // No need to explicitly call sendScrobblePause/Stop here if cleaning up due to props change (like mediaInfo).
            // The background listeners are the primary for tab close/nav.
            // If it's a prop change that means scrobbling should stop, the logic that *caused* the prop change
            // (e.g., new URL loaded) should ideally reset scrobblingStatus, triggering appropriate pauses if needed.
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        isWatchPage,
        mediaInfo,
        userConfirmedAction,
        siteConfig,
        handleLocalVideoPlay,
        handleLocalVideoPause,
        handleLocalVideoEnded,
        handleLocalVideoTimeUpdate,
        sendScrobblePause
    ]);

    // --- Manage `pageUnloadRef` for `beforeunload` ---
    useEffect(() => {
        const handleBeforeUnload = () => {
            pageUnloadRef.current = true;
            // Attempt a final stop via background if conditions met and not using beacon effectively
            // This is less reliable than background tab listeners.
            if (
                videoRef.current &&
                mediaInfo &&
                userConfirmedAction &&
                (scrobblingStatus === 'started' ||
                    scrobblingStatus === 'paused') &&
                currentVideoProgress >= 80
            ) {
                // Your threshold for stop on unload
                console.log(
                    'ScrobbleManager: beforeunload - attempting to ensure stop is sent via background.'
                );
                // We don't call sendScrobbleStop directly here as it might not complete.
                // Background's onRemoved/onUpdated should be the primary mechanism.
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            pageUnloadRef.current = false; // Reset if component unmounts cleanly
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        mediaInfo,
        userConfirmedAction,
        scrobblingStatus,
        currentVideoProgress
    ]); // Dependencies ensure it has latest state

    // --- Clear Wait Title Timers ---
    const clearWaitTitleTimers = useCallback(() => {
        if (waitTitleIntervalRef.current !== null)
            clearInterval(waitTitleIntervalRef.current);
        if (waitTitleTimeoutRef.current !== null)
            clearTimeout(waitTitleTimeoutRef.current);
        waitTitleIntervalRef.current = null;
        waitTitleTimeoutRef.current = null;
    }, []);

    // --- URL Change Detection and Initial Media Fetching ---
    useEffect(() => {
        let lastHref = window.location.href;
        previousUrlRef.current = lastHref; // Initialize previousUrlRef
        setCurrentUrl(lastHref);

        const interval = setInterval(() => {
            const currentHref = window.location.href;
            if (currentHref !== lastHref) {
                console.log(
                    'ScrobbleManager: URL changed from',
                    lastHref,
                    'to',
                    currentHref
                );
                lastHref = currentHref;
                previousUrlRef.current = currentUrl; // Store old currentUrl as previous
                setCurrentUrl(currentHref); // Trigger re-fetch by updating currentUrl state
            }
        }, 500);
        return () => clearInterval(interval);
    }, [currentUrl]); // currentUrl dependency might cause re-runs if not careful, but needed for prev/curr logic here

    useEffect(() => {
        console.log(
            `ScrobbleManager: Main effect for URL: ${currentUrl}. Previous: ${previousUrlRef.current}`
        );
        clearWaitTitleTimers();

        // Reset all relevant state for a new page/media
        setMediaInfo(null);
        setOriginalMediaQuery(null);
        setShowEpisodeInfo(null);
        setWatchStatus(null);
        setProgressInfo(null);
        setRatingInfo(null);
        setIsLoadingMediaInfo(true); // Start loading
        setNeedsManualConfirmation(false);
        setShowStartPrompt(false);
        setShowRewatchPrompt(false);
        setUserConfirmedAction(false);
        setIsRewatchSession(false);
        setLocalRewatchInfo(null);
        setHighlightTarget(null);
        setWatchedHistoryEpisodes(undefined);
        // Reset scrobbling specific state
        setScrobblingStatus('idle');
        setCurrentVideoProgress(0);
        traktHistoryIdRef.current = null;
        lastProgressPingTimeRef.current = 0;
        lastReportedProgressRef.current = 0;
        pageUnloadRef.current = false;

        if (!isWatchPage) {
            setIsLoadingMediaInfo(false);
            // Ensure highlighting is cleared if we leave a watch page for this site
            if (siteConfig?.name) clearHighlighting(siteConfig.name, null);
            return;
        }

        const fetchAndProcess = async () => {
            if (!siteConfig) {
                setIsLoadingMediaInfo(false);
                return;
            }

            const response = await getMediaInfoAndConfidence(
                siteConfig,
                currentUrl,
                tabUrlIdentifier
            );

            if (pageUnloadRef.current || currentUrl !== window.location.href) {
                // Check if URL changed during async op
                console.warn(
                    'ScrobbleManager: URL changed or page unloaded during fetch, discarding result for:',
                    currentUrl
                );
                setIsLoadingMediaInfo(false);
                return;
            }

            if (response.success && response.data) {
                const {
                    mediaInfo: fetchedMediaInfo,
                    confidence,
                    originalQuery: oq,
                    ...statusDetails
                } = response.data;
                setMediaInfo(fetchedMediaInfo); // Set mediaInfo first
                setOriginalMediaQuery(oq);

                if (confidence === 'high' && fetchedMediaInfo) {
                    setNeedsManualConfirmation(false);
                    if (isShowMediaInfo(fetchedMediaInfo)) {
                        setShowEpisodeInfo(
                            siteConfig.getSeasonEpisodeObj(currentUrl) || null
                        );
                    } else {
                        setShowEpisodeInfo(null);
                    }
                    await processMediaStatus(response.data); // Process status after mediaInfo is set
                } else {
                    setNeedsManualConfirmation(true);
                    // Reset dependent states if confidence is low
                    setShowEpisodeInfo(null);
                    setWatchStatus(null);
                    setProgressInfo(null);
                    setRatingInfo(null);
                    setShowStartPrompt(false);
                    setShowRewatchPrompt(false);
                    setUserConfirmedAction(false);
                }
            } else {
                console.error(
                    'ScrobbleManager: Failed to get media info:',
                    response.error
                );
                setNeedsManualConfirmation(false); // Or true, depending on desired fallback
            }
            lastFetchedTitleRef.current = document.title; // For Cineby-like logic
            setIsLoadingMediaInfo(false);
        };

        // Cineby-specific title waiting logic (or similar for other sites if needed)
        if (hostname === 'www.cineby.app') {
            // Example
            const currentTitle = document.title;
            const isNav =
                currentUrl !== previousUrlRef.current &&
                previousUrlRef.current !== null;
            const isStale =
                isNav &&
                currentTitle === lastFetchedTitleRef.current &&
                currentTitle !== 'Cineby';
            const isGeneric = currentTitle === 'Cineby';

            if (isGeneric || isStale) {
                console.log(
                    `ScrobbleManager: ${hostname} - Waiting for title update...`
                );
                waitTitleIntervalRef.current = window.setInterval(() => {
                    const newTitle = document.title;
                    const newIsStale =
                        isNav &&
                        newTitle === lastFetchedTitleRef.current &&
                        newTitle !== 'Cineby';
                    const newIsGeneric = newTitle === 'Cineby';
                    if (!newIsGeneric && !newIsStale) {
                        clearWaitTitleTimers();
                        fetchAndProcess();
                    }
                }, 500);
                waitTitleTimeoutRef.current = window.setTimeout(() => {
                    clearWaitTitleTimers();
                    fetchAndProcess();
                }, 5000);
            } else {
                fetchAndProcess();
            }
        } else {
            fetchAndProcess();
        }

        return () => {
            // Cleanup for this effect
            clearWaitTitleTimers();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        currentUrl,
        isWatchPage,
        tabUrlIdentifier,
        clearWaitTitleTimers,
        hostname /* siteConfig indirectly via hostname */
    ]);
    // Removed processMediaStatus from deps, it should be stable or use refs if it causes loops.

    // --- processMediaStatus (Your existing logic, ensure it resets scrobble states if new media) ---
    const processMediaStatus = useCallback(
        async (data: MediaStatusPayload) => {
            console.log('ScrobbleManager: Processing media status:', data);
            setWatchStatus(
                data.watchStatus || { isInHistory: false, isCompleted: false }
            );
            setProgressInfo(data.progressInfo || null);
            setRatingInfo(data.ratingInfo || null);

            // Reset prompts and confirmation for new media status
            setShowStartPrompt(false);
            setShowRewatchPrompt(false);
            setUserConfirmedAction(false); // This is KEY. User must re-confirm for new media/episode.
            setIsRewatchSession(false);
            setLocalRewatchInfo(null); // Reset local rewatch info as well

            // Highlighting logic based on new status
            let newHighlightTargetUpdate: {
                season: number;
                episode: number;
                type: HighlightType;
            } | null = null;
            let watchedEpisodesForGreyOutUpdate: {
                season: number;
                number: number;
            }[] = [];

            if (isShowMediaInfo(data.mediaInfo)) {
                const traktShowId = data.mediaInfo.show.ids.trakt;
                const traktProgress = data.progressInfo;

                if (traktProgress?.seasons) {
                    traktProgress.seasons.forEach((s) =>
                        s.episodes.forEach((e) => {
                            if (e.completed)
                                watchedEpisodesForGreyOutUpdate.push({
                                    season: s.number,
                                    number: e.number
                                });
                        })
                    );
                }

                if (
                    !data.watchStatus?.isInHistory &&
                    (!traktProgress || traktProgress.completed === 0)
                ) {
                    setShowStartPrompt(true);
                } else if (
                    traktProgress &&
                    traktProgress.completed < traktProgress.aired
                ) {
                    // If partially watched on Trakt
                    const currentEpInfo =
                        siteConfig?.getSeasonEpisodeObj(currentUrl);
                    const isCurrentEpWatchedOnTrakt = traktProgress.seasons
                        ?.find((s) => s.number === currentEpInfo?.season)
                        ?.episodes?.find(
                            (e) => e.number === currentEpInfo?.number
                        )?.completed;

                    if (isCurrentEpWatchedOnTrakt) {
                        setShowRewatchPrompt(true); // Already watched this specific episode on Trakt
                    } else {
                        setUserConfirmedAction(true); // Continue watching (first time for this specific episode)
                    }
                    if (traktProgress.last_episode) {
                        newHighlightTargetUpdate = {
                            season: traktProgress.last_episode.season,
                            episode: traktProgress.last_episode.number,
                            type: 'first_watch_last'
                        };
                    }
                } else {
                    // Show is fully watched on Trakt, or history exists but no specific progress
                    const localInfo = await getLocalRewatchInfo(traktShowId);
                    setLocalRewatchInfo(localInfo);
                    setShowRewatchPrompt(true); // Always prompt for rewatch if Trakt history/progress indicates completion

                    if (localInfo?.lastWatched) {
                        newHighlightTargetUpdate = {
                            season: localInfo.lastWatched.season,
                            episode: localInfo.lastWatched.number,
                            type: 'rewatch_last'
                        };
                    }
                }
            } else if (isMovieMediaInfo(data.mediaInfo)) {
                if (!data.watchStatus?.isInHistory) {
                    setShowStartPrompt(true);
                } else {
                    setShowRewatchPrompt(true);
                }
            }
            setHighlightTarget(newHighlightTargetUpdate);
            setWatchedHistoryEpisodes(watchedEpisodesForGreyOutUpdate);

            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        [currentUrl, siteConfig /* other stable dependencies if any */]
    );

    // --- Manual Confirmation Handler ---
    const handleConfirmMedia = useCallback(
        async (confirmedMedia: MediaInfoResponse) => {
            console.log(
                'ScrobbleManager: Handling confirmed media:',
                confirmedMedia
            );
            setIsLoadingMediaInfo(true);
            setNeedsManualConfirmation(false);
            setOriginalMediaQuery(null);

            // Reset dependent states before re-fetching status for the new confirmed media
            setWatchStatus(null);
            setProgressInfo(null);
            setRatingInfo(null);
            setShowStartPrompt(false);
            setShowRewatchPrompt(false);
            setUserConfirmedAction(false);
            setScrobblingStatus('idle');
            traktHistoryIdRef.current = null;

            try {
                // The tabUrlIdentifier used here should be the one relevant to the page where confirmation happened.
                // If confirmMedia is called, it implies siteConfig might not have worked initially.
                // Background will use this confirmedMedia for subsequent mediaInfo requests for this tabUrlIdentifier.
                await sendMessageToBackground<null>({
                    action: 'confirmMedia',
                    params: confirmedMedia
                });

                setMediaInfo(confirmedMedia); // Set the confirmed media immediately

                if (isShowMediaInfo(confirmedMedia) && siteConfig) {
                    setShowEpisodeInfo(
                        siteConfig.getSeasonEpisodeObj(currentUrl) || null
                    );
                } else {
                    setShowEpisodeInfo(null);
                }

                // Now fetch status for the newly confirmed media
                // Send a "mediaInfo" request with the confirmed media's type (query can be empty as BG will use cache)
                const statusResponse =
                    await sendMessageToBackground<MediaStatusPayload>({
                        action: 'mediaInfo',
                        params: {
                            type: confirmedMedia.type,
                            query: '',
                            years: ''
                        } // Background will use cached confirmedMedia
                    });

                if (statusResponse.success && statusResponse.data) {
                    await processMediaStatus(statusResponse.data);
                } else {
                    console.error(
                        'Failed to fetch status after manual confirmation:',
                        statusResponse.error
                    );
                }
            } catch (error) {
                console.error('Failed during confirmMedia processing:', error);
                setMediaInfo(null); // Revert if error
                setNeedsManualConfirmation(true);
            } finally {
                setIsLoadingMediaInfo(false);
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        },
        [
            currentUrl,
            siteConfig,
            sendMessageToBackground,
            processMediaStatus /* Add other stable deps */
        ]
    );

    // --- Episode Highlighting Effect ---
    useEffect(() => {
        if (
            !isWatchPage ||
            !siteConfig ||
            !isShowMediaInfo(mediaInfo) ||
            !siteConfig.highlighting
        ) {
            if (siteConfig?.name) clearHighlighting(siteConfig.name, null);
            return;
        }
        setupEpisodeHighlighting(
            siteConfig,
            highlightTarget,
            watchedHistoryEpisodes
        );
        return () => {
            if (siteConfig?.name) clearHighlighting(siteConfig.name, null);
        };
    }, [
        isWatchPage,
        siteConfig,
        mediaInfo,
        highlightTarget,
        watchedHistoryEpisodes
    ]);

    // --- Manual Add to History (for the button) ---
    const handleManualAddToHistory = useCallback(async () => {
        if (!mediaInfo) return;
        console.log(
            'ScrobbleManager: Requesting Manual Add to History via button'
        );

        // If a live scrobble is happening for this, pause it first.
        if (scrobblingStatus === 'started' && videoRef.current) {
            await sendScrobblePause(
                (videoRef.current.currentTime / videoRef.current.duration) *
                    100 || 0
            );
        }

        const params: RequestManualAddToHistoryParams = {
            mediaInfo,
            episodeInfo: showEpisodeInfo || undefined
        };
        const response = await sendMessageToBackground<{
            traktHistoryId?: number;
        }>({ action: 'requestManualAddToHistory', params });

        if (response.success) {
            console.log(
                'ScrobbleManager: Manual add to history successful.',
                response.data
            );
            if (response.data?.traktHistoryId) {
                traktHistoryIdRef.current = response.data.traktHistoryId;
                // Trigger UI update for ScrobbleNotification if needed
            }
            // Manually adding to history should also update watchStatus locally
            setWatchStatus((prev) => ({
                ...prev,
                isInHistory: true,
                lastWatchedAt: new Date().toISOString()
            }));
            if (isShowMediaInfo(mediaInfo) && progressInfo) {
                // If it's a show, marking an episode manually might complete the show
                // This is complex; for now, just mark as in history. Full progress update might need a re-fetch.
            }
        } else {
            console.error(
                'ScrobbleManager: Manual add to history failed:',
                response.error
            );
        }
    }, [
        mediaInfo,
        showEpisodeInfo,
        sendMessageToBackground,
        scrobblingStatus,
        sendScrobblePause,
        progressInfo
    ]);

    // --- Handlers for Prompts, Rating, Undo ---
    const handleConfirmStartWatching = useCallback(() => {
        setUserConfirmedAction(true);
        setShowStartPrompt(false);
    }, []);
    const handleConfirmRewatch = useCallback(() => {
        setUserConfirmedAction(true);
        setIsRewatchSession(true);
        setShowRewatchPrompt(false);
    }, []);
    const handleCancelManualSearch = useCallback(() => {
        setNeedsManualConfirmation(false);
        setOriginalMediaQuery(null);
    }, []);

    const handleRateItem = useCallback(
        async (rating: number) => {
            if (!mediaInfo) return;
            const response = await sendMessageToBackground<null>({
                action: 'rateItem',
                params: { mediaInfo, rating }
            });
            if (response.success) {
                setRatingInfo((prev) => ({
                    ...prev,
                    userRating: rating,
                    ratedAt: new Date().toISOString()
                }));
            } else {
                console.error('Rating failed:', response.error);
            }
        },
        [mediaInfo, sendMessageToBackground]
    );

    const handleUndoScrobble = useCallback(async () => {
        if (!traktHistoryIdRef.current) return;
        const response = await sendMessageToBackground<null>({
            action: 'undoScrobble',
            params: { historyId: traktHistoryIdRef.current }
        });
        if (response.success) {
            traktHistoryIdRef.current = null;
            // setIsScrobbled(false); // Update ScrobbleNotification's view
            // Re-fetch watch status as it has changed
            if (mediaInfo) {
                const statusResponse =
                    await sendMessageToBackground<MediaStatusPayload>({
                        action: 'mediaInfo',
                        params: { type: mediaInfo.type, query: '', years: '' }
                    });
                if (statusResponse.success && statusResponse.data)
                    processMediaStatus(statusResponse.data);
            }
        } else {
            console.error('Undo failed:', response.error);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        mediaInfo,
        sendMessageToBackground,
        processMediaStatus /* processMediaStatus dep */
    ]);

    // --- Prepare data for ScrobbleNotification ---
    const isEffectivelyScrobbled = !!traktHistoryIdRef.current;
    let SNotificationMediaInfo: ScrobbleNotificationMediaType | null = null;
    if (mediaInfo) {
        SNotificationMediaInfo = { ...mediaInfo };
        if (isShowMediaInfo(mediaInfo) && showEpisodeInfo) {
            SNotificationMediaInfo = {
                ...SNotificationMediaInfo,
                ...showEpisodeInfo
            };
        }
    }

    // --- NEW: Effect to listen for messages from iframes ---
    useEffect(() => {
        if (!mediaInfo || !userConfirmedAction) return; // Only listen if ready to scrobble

        const handleIframeMessage = (event: MessageEvent) => {
            // Basic security: check origin if possible, and message structure
            // if (event.origin !== "expected_iframe_origin") return; // Best practice if origin is known

            const { data } = event;
            if (
                data &&
                typeof data.type === 'string' &&
                data.type.startsWith('TMSYNC_IFRAME_')
            ) {
                if (!isIframePlayerActive && videoRef.current) {
                    // If we have a local video and iframe messages start coming,
                    // it might mean the iframe took over. Decide on a strategy.
                    // For now, if local video exists, we might ignore iframe.
                    // This needs refinement based on how sites embed players.
                    // console.warn("ScrobbleManager: Received iframe message but local video is active. Ignoring iframe for now.");
                    // return;
                }
                // If we expect iframe messages, or no local video, then process:
                // setIsIframePlayerActive(true); // Confirm iframe is the source

                if (!iframeOrigin && event.origin !== 'null') {
                    // "null" for sandboxed iframes without allow-same-origin
                    setIframeOrigin(event.origin);
                } else if (
                    iframeOrigin &&
                    event.origin !== iframeOrigin &&
                    event.origin !== 'null'
                ) {
                    console.warn(
                        'TMSync Iframe: Message from unexpected origin:',
                        event.origin,
                        'Expected:',
                        iframeOrigin
                    );
                    return;
                }

                console.log('ScrobbleManager: Received iframe message:', data);
                const progress = (data.currentTime / data.duration) * 100;
                if (isNaN(progress)) return; // Ignore if progress is NaN

                switch (data.type) {
                    case 'TMSYNC_IFRAME_PLAY':
                        commonPlayHandler(progress);
                        break;
                    case 'TMSYNC_IFRAME_PAUSE':
                        commonPauseHandler(progress);
                        break;
                    case 'TMSYNC_IFRAME_ENDED':
                        commonEndedHandler();
                        break;
                    case 'TMSYNC_IFRAME_TIMEUPDATE':
                        const progressFromIframe =
                            (data.currentTime / data.duration) * 100;
                        if (isNaN(progressFromIframe)) break;
                        commonTimeUpdateHandlerWithProgress(progressFromIframe); // Call the one that accepts progress
                        break;
                    default:
                        break;
                }
            }
        };

        window.addEventListener('message', handleIframeMessage);
        console.log(
            'ScrobbleManager: Added window message listener for iframe events.'
        );

        return () => {
            window.removeEventListener('message', handleIframeMessage);
            console.log('ScrobbleManager: Removed window message listener.');
            setIframeOrigin(null); // Reset origin on cleanup
        };
    }, [
        mediaInfo,
        userConfirmedAction,
        isIframePlayerActive,
        commonPlayHandler,
        commonPauseHandler,
        commonEndedHandler,
        commonTimeUpdateHandler,
        iframeOrigin
    ]);

    const showScrobbleRelatedUI =
        !isLoadingMediaInfo &&
        mediaInfo &&
        (isMovieMediaInfo(mediaInfo) ||
            (isShowMediaInfo(mediaInfo) && !!showEpisodeInfo));

    if (!isWatchPage && !isLoadingMediaInfo && !needsManualConfirmation) {
        // Don't return null if manual search is up
        return null;
    }

    return (
        <>
            {isLoadingMediaInfo && <LoadingIndicator text="Finding media..." />}

            {!isLoadingMediaInfo &&
                needsManualConfirmation &&
                originalMediaQuery && (
                    <ManualSearchPrompt
                        originalQuery={originalMediaQuery}
                        onConfirmMedia={handleConfirmMedia}
                        onCancel={handleCancelManualSearch}
                    />
                )}

            {showScrobbleRelatedUI &&
                !isLoadingMediaInfo &&
                showStartPrompt &&
                !userConfirmedAction && (
                    <StartWatchPrompt onConfirm={handleConfirmStartWatching} />
                )}
            {showScrobbleRelatedUI &&
                !isLoadingMediaInfo &&
                showRewatchPrompt &&
                !userConfirmedAction && (
                    <RewatchPrompt onConfirm={handleConfirmRewatch} />
                )}

            {showScrobbleRelatedUI &&
                !isLoadingMediaInfo &&
                !needsManualConfirmation &&
                SNotificationMediaInfo &&
                (userConfirmedAction || isEffectivelyScrobbled) && ( // Show if user confirmed OR already scrobbled
                    <ScrobbleNotification
                        mediaInfo={SNotificationMediaInfo!} // Ensure SNotificationMediaInfo is not null here
                        isEffectivelyScrobbled={isEffectivelyScrobbled}
                        traktHistoryId={traktHistoryIdRef.current}
                        liveScrobbleStatus={scrobblingStatus} // Pass the live status
                        onManualScrobble={async () => {
                            setIsProcessingScrobbleAction(true);
                            await handleManualAddToHistory();
                            setIsProcessingScrobbleAction(false);
                        }}
                        onUndoScrobble={async () => {
                            setIsProcessingScrobbleAction(true);
                            await handleUndoScrobble(); // Your existing undo handler
                            setIsProcessingScrobbleAction(false);
                        }}
                        isProcessingAction={isProcessingScrobbleAction} // General processing flag
                        ratingInfo={ratingInfo}
                        onRate={handleRateItem} // Your existing rate handler
                    />
                )}
        </>
    );
};
