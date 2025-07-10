import { useState, useEffect, useCallback, useRef } from 'react';
import { saveLocalRewatchInfo } from '../utils/helpers/localRewatch';
import { isShowMediaInfo } from '../utils/typeGuards';
import { MediaInfoResponse, SeasonEpisodeObj } from '../types/media';
import {
    ActiveScrobbleStatus,
    ScrobbleStopResponseData
} from '../types/scrobbling';
import {
    MessageRequest,
    MessageResponse,
    RequestManualAddToHistoryParams,
    RequestScrobblePauseParams,
    RequestScrobbleStartParams,
    RequestScrobbleStopParams
} from '../types/messaging';

const VIDEO_PROGRESS_UPDATE_THROTTLE_MS = 2000;
const WATCHING_PING_INTERVAL_MS = 5 * 60 * 1000;
const SCROBBLE_COMPLETION_THRESHOLD = 80;
const MIN_TIME_BETWEEN_ACTIONS_MS = 500;

export function useScrobbling(
    mediaInfo: MediaInfoResponse | null,
    episodeInfo: SeasonEpisodeObj | null,
    userConfirmedAction: boolean,
    isRewatchSession: boolean,
    globalScrobblingEnabled: boolean = true
) {
    const [status, setStatus] = useState<ActiveScrobbleStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const historyIdRef = useRef<number | null>(null);
    const serviceHistoryIdsRef = useRef<{
        [serviceType: string]: number | string;
    }>({});
    const isScrobbledRef = useRef(false); // Single source of truth for scrobbled state
    const autoScrobblingDisabledRef = useRef(false);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const lastPingTimeRef = useRef(0);
    const lastReportedProgressRef = useRef(0);
    const lastSentActionTimestampRef = useRef(0);
    const timeUpdateProcessingScheduledRef = useRef(false);
    const timeUpdateTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );
    const pageUnloadRef = useRef(false);

    const sendMessage = useCallback(
        async <TResponseData = any>(
            message: MessageRequest
        ): Promise<MessageResponse<TResponseData>> => {
            return await chrome.runtime.sendMessage(message);
        },
        []
    );

    const sendScrobbleStart = useCallback(async () => {
        if (!mediaInfo || isProcessing) return;
        const now = Date.now();
        if (
            now - lastSentActionTimestampRef.current <
            MIN_TIME_BETWEEN_ACTIONS_MS * 2
        )
            return;

        setIsProcessing(true);
        lastSentActionTimestampRef.current = now;

        try {
            const params: RequestScrobbleStartParams = {
                mediaInfo,
                episodeInfo: episodeInfo || undefined,
                progress
            };
            const response = await sendMessage({
                action: 'requestScrobbleStart',
                params
            });
            if (response.success) {
                setStatus('started');
                lastPingTimeRef.current = now;
                lastReportedProgressRef.current = progress;
            }
        } finally {
            setIsProcessing(false);
        }
    }, [mediaInfo, episodeInfo, progress, sendMessage, isProcessing]);

    const sendScrobblePause = useCallback(async () => {
        if (!mediaInfo || status !== 'started') return;
        const now = Date.now();
        if (
            now - lastSentActionTimestampRef.current <
            MIN_TIME_BETWEEN_ACTIONS_MS
        )
            return;
        lastSentActionTimestampRef.current = now;

        const params: RequestScrobblePauseParams = {
            mediaInfo,
            episodeInfo: episodeInfo || undefined,
            progress
        };
        const response = await sendMessage({
            action: 'requestScrobblePause',
            params
        });
        if (response.success) setStatus('paused');
    }, [mediaInfo, episodeInfo, progress, status, sendMessage]);

    const sendScrobbleStop = useCallback(async () => {
        if (!mediaInfo || status === 'idle' || isProcessing) return null;
        const now = Date.now();
        if (
            now - lastSentActionTimestampRef.current <
            MIN_TIME_BETWEEN_ACTIONS_MS
        )
            return null;

        setIsProcessing(true);
        lastSentActionTimestampRef.current = now;

        try {
            const params: RequestScrobbleStopParams = {
                mediaInfo: mediaInfo!,
                episodeInfo: episodeInfo || undefined,
                progress
            };
            const response = await sendMessage<ScrobbleStopResponseData>({
                action: 'requestScrobbleStop',
                params
            });

            if (response.success && response.data) {
                // Set historyId BEFORE changing status to prevent race condition
                if (response.data.action === 'watched') {
                    // Check if ANY service succeeded (not just Trakt)
                    const hasAnyServiceSuccess =
                        response.data.traktHistoryId ||
                        (response.data.serviceHistoryIds &&
                            Object.keys(response.data.serviceHistoryIds)
                                .length > 0);

                    if (hasAnyServiceSuccess) {
                        console.log('✅ Marking as scrobbled');
                        isScrobbledRef.current = true;
                        autoScrobblingDisabledRef.current = false;

                        // Set Trakt history ID if available (for legacy compatibility)
                        if (
                            response.data.traktHistoryId &&
                            response.data.traktHistoryId !== -1
                        ) {
                            historyIdRef.current = response.data.traktHistoryId;
                            console.log(
                                '💾 Stored Trakt history ID:',
                                response.data.traktHistoryId
                            );
                        }

                        // Store service-specific history IDs for proper undo functionality
                        if (response.data.serviceHistoryIds) {
                            // Filter out conflict IDs (-1) from service history IDs
                            const realServiceHistoryIds = Object.fromEntries(
                                Object.entries(
                                    response.data.serviceHistoryIds
                                ).filter(([, id]) => id !== -1)
                            );

                            if (Object.keys(realServiceHistoryIds).length > 0) {
                                serviceHistoryIdsRef.current =
                                    realServiceHistoryIds;
                                console.log(
                                    '💾 Stored service-specific history IDs:',
                                    realServiceHistoryIds
                                );
                            }
                        }

                        if (
                            isRewatchSession &&
                            isShowMediaInfo(mediaInfo) &&
                            episodeInfo
                        ) {
                            await saveLocalRewatchInfo(
                                mediaInfo.show.ids.trakt,
                                episodeInfo.season,
                                episodeInfo.number
                            );
                        }
                    }
                }

                // Set status to idle AFTER historyId is set to prevent race condition
                setStatus('idle');
                return response.data;
            }
            return null;
        } finally {
            setIsProcessing(false);
        }
    }, [
        mediaInfo,
        episodeInfo,
        progress,
        status,
        isRewatchSession,
        sendMessage,
        isProcessing
    ]);

    const processThrottledTimeUpdate = useCallback(
        async (latestProgress: number) => {
            if (!mediaInfo || !userConfirmedAction || pageUnloadRef.current) {
                timeUpdateProcessingScheduledRef.current = false;
                return;
            }

            // Stop all operations if episode/movie is scrobbled
            if (isScrobbledRef.current) {
                console.log('🚫 Skipping time update - episode scrobbled');
                timeUpdateProcessingScheduledRef.current = false;
                return;
            }

            setProgress(latestProgress);

            if (status === 'started') {
                const now = Date.now();
                const progressDelta = Math.abs(
                    latestProgress - lastReportedProgressRef.current
                );

                // Check for 80% threshold for ending scrobble
                if (
                    !isScrobbledRef.current &&
                    globalScrobblingEnabled &&
                    !autoScrobblingDisabledRef.current &&
                    latestProgress >= SCROBBLE_COMPLETION_THRESHOLD
                ) {
                    console.log(
                        '🎯 Reached 80% threshold - stopping scrobble, progress:',
                        latestProgress,
                        'isScrobbled:',
                        isScrobbledRef.current
                    );
                    await sendScrobbleStop();
                } else if (
                    !isScrobbledRef.current &&
                    !isProcessing &&
                    (now - lastPingTimeRef.current >
                        WATCHING_PING_INTERVAL_MS ||
                        progressDelta >= 5)
                ) {
                    await sendScrobbleStart();
                }
            }

            // Reset flag at the end to prevent race conditions
            timeUpdateProcessingScheduledRef.current = false;
        },
        [
            mediaInfo,
            userConfirmedAction,
            globalScrobblingEnabled,
            status,
            sendScrobbleStart,
            sendScrobbleStop
        ]
    );

    const lastProgressRef = useRef<number>(0);
    const seekDetectedRef = useRef<boolean>(false);

    const handleTimeUpdate = useCallback(() => {
        if (!videoRef.current || pageUnloadRef.current) return;
        const { currentTime, duration } = videoRef.current;
        if (isNaN(duration) || duration === 0) return;

        const currentProgress = (currentTime / duration) * 100;

        // Detect seeking: large jump in progress (>5% change)
        const progressDelta = Math.abs(
            currentProgress - lastProgressRef.current
        );
        if (progressDelta > 5) {
            console.log('🔄 Seek detected:', {
                from: lastProgressRef.current,
                to: currentProgress,
                delta: progressDelta
            });
            seekDetectedRef.current = true;
            // Delay processing after seek to let video element settle
            setTimeout(() => {
                seekDetectedRef.current = false;
            }, 1000);
        }

        lastProgressRef.current = currentProgress;

        // Skip processing if we just detected a seek
        if (seekDetectedRef.current) {
            console.log('⏭️ Skipping progress update due to recent seek');
            return;
        }

        if (!timeUpdateProcessingScheduledRef.current) {
            timeUpdateProcessingScheduledRef.current = true;

            // Cancel any existing timeout
            if (timeUpdateTimeoutIdRef.current) {
                clearTimeout(timeUpdateTimeoutIdRef.current);
            }

            // Store the timeout ID for potential cancellation
            timeUpdateTimeoutIdRef.current = setTimeout(() => {
                timeUpdateTimeoutIdRef.current = null;
                processThrottledTimeUpdate(currentProgress);
            }, VIDEO_PROGRESS_UPDATE_THROTTLE_MS);
        }
    }, [processThrottledTimeUpdate]);

    const handlePlay = useCallback(() => {
        if (!mediaInfo || !userConfirmedAction || !globalScrobblingEnabled)
            return;
        if (isScrobbledRef.current) {
            console.log(
                '🚫 Skipping start on play - episode already scrobbled'
            );
            return;
        }
        if (autoScrobblingDisabledRef.current) {
            console.log(
                '🚫 Skipping start on play - auto-scrobbling disabled after undo'
            );
            return;
        }
        if (status === 'idle' || status === 'paused') {
            console.log('🚀 Starting on play event - status:', status);
            sendScrobbleStart();
        }
    }, [
        mediaInfo,
        userConfirmedAction,
        globalScrobblingEnabled,
        status,
        sendScrobbleStart
    ]);

    const handlePause = useCallback(() => {
        if (!mediaInfo || !userConfirmedAction || !globalScrobblingEnabled)
            return;
        if (autoScrobblingDisabledRef.current) {
            console.log(
                '🚫 Skipping pause - auto-scrobbling disabled after undo'
            );
            return;
        }
        if (status === 'started') sendScrobblePause();
    }, [
        mediaInfo,
        userConfirmedAction,
        globalScrobblingEnabled,
        status,
        sendScrobblePause
    ]);

    const handleEnded = useCallback(async () => {
        if (!mediaInfo || !userConfirmedAction || !globalScrobblingEnabled)
            return;
        if (autoScrobblingDisabledRef.current) {
            console.log(
                '🚫 Skipping ended - auto-scrobbling disabled after undo'
            );
            return;
        }
        if (status === 'started' || status === 'paused') {
            setProgress(100);
            await sendScrobbleStop();
        }
    }, [
        mediaInfo,
        userConfirmedAction,
        globalScrobblingEnabled,
        status,
        sendScrobbleStop
    ]);

    useEffect(() => {
        if (!userConfirmedAction) return;
        let findVideoIntervalId: number | null = null;
        let attempts = 0;

        const tryToSetupVideoPlayer = () => {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                if (findVideoIntervalId) clearInterval(findVideoIntervalId);
                videoRef.current = videoElement;
                videoElement.addEventListener('play', handlePlay);
                videoElement.addEventListener('pause', handlePause);
                videoElement.addEventListener('ended', handleEnded);
                videoElement.addEventListener('timeupdate', handleTimeUpdate);
                if (!videoElement.paused) handlePlay();
            } else {
                attempts++;
                if (attempts > 20) {
                    // Stop after 10 seconds
                    if (findVideoIntervalId) clearInterval(findVideoIntervalId);
                }
            }
        };

        tryToSetupVideoPlayer();
        findVideoIntervalId = window.setInterval(tryToSetupVideoPlayer, 500);

        return () => {
            if (findVideoIntervalId) clearInterval(findVideoIntervalId);
            if (videoRef.current) {
                videoRef.current.removeEventListener('play', handlePlay);
                videoRef.current.removeEventListener('pause', handlePause);
                videoRef.current.removeEventListener('ended', handleEnded);
                videoRef.current.removeEventListener(
                    'timeupdate',
                    handleTimeUpdate
                );
            }
        };
    }, [
        userConfirmedAction,
        handlePlay,
        handlePause,
        handleEnded,
        handleTimeUpdate
    ]);

    useEffect(() => {
        const handler = () => {
            pageUnloadRef.current = true;
            // Cancel any pending timeout on page unload
            if (timeUpdateTimeoutIdRef.current) {
                clearTimeout(timeUpdateTimeoutIdRef.current);
                timeUpdateTimeoutIdRef.current = null;
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => {
            window.removeEventListener('beforeunload', handler);
            // Cancel timeout on component unmount
            if (timeUpdateTimeoutIdRef.current) {
                clearTimeout(timeUpdateTimeoutIdRef.current);
                timeUpdateTimeoutIdRef.current = null;
            }
        };
    }, []);

    // Reset state when media changes
    useEffect(() => {
        historyIdRef.current = null;
        serviceHistoryIdsRef.current = {};
        autoScrobblingDisabledRef.current = false;
        isScrobbledRef.current = false;
        setStatus('idle');
        setProgress(0);
    }, [mediaInfo, episodeInfo]);

    const manualScrobble = useCallback(async () => {
        if (!mediaInfo) return;
        setIsProcessing(true);
        if (status === 'started') await sendScrobblePause();
        const params: RequestManualAddToHistoryParams = {
            mediaInfo,
            episodeInfo: episodeInfo || undefined
        };
        const response = await sendMessage<{
            traktHistoryId?: number;
            serviceHistoryIds?: { [serviceType: string]: number | string };
        }>({
            action: 'requestManualAddToHistory',
            params
        });
        if (response.success && response.data) {
            // Store both legacy and service-specific IDs (even if they are -1 for conflicts)
            if (response.data.traktHistoryId) {
                historyIdRef.current = response.data.traktHistoryId;
            }
            if (response.data.serviceHistoryIds) {
                serviceHistoryIdsRef.current = response.data.serviceHistoryIds;
                console.log(
                    '💾 Stored service-specific history IDs from manual add:',
                    response.data.serviceHistoryIds
                );
            }
            isScrobbledRef.current = true;
            autoScrobblingDisabledRef.current = false;
            console.log(
                '✅ Marked as scrobbled and re-enabled auto-scrobbling after manual add'
            );
        }
        setIsProcessing(false);
    }, [mediaInfo, episodeInfo, status, sendMessage, sendScrobblePause]);

    const undoScrobble = useCallback(async () => {
        // Only allow undo if we have real history IDs (not just conflict completion)
        if (
            !historyIdRef.current &&
            Object.keys(serviceHistoryIdsRef.current).length === 0
        ) {
            console.log(
                '⚠️ No real history IDs available - cannot undo conflict completions'
            );
            return false;
        }
        setIsProcessing(true);

        // Prefer service-specific IDs if available, fallback to legacy single ID
        const undoParams =
            Object.keys(serviceHistoryIdsRef.current).length > 0
                ? { serviceHistoryIds: serviceHistoryIdsRef.current }
                : { historyId: historyIdRef.current! };

        console.log('🔄 Sending undo request with params:', undoParams);

        const response = await sendMessage({
            action: 'undoScrobble',
            params: undoParams
        });

        if (response.success) {
            // Cancel any pending timeout to prevent race conditions
            if (timeUpdateTimeoutIdRef.current) {
                clearTimeout(timeUpdateTimeoutIdRef.current);
                timeUpdateTimeoutIdRef.current = null;
                console.log('⏹️ Cancelled pending timeout during undo');
            }

            historyIdRef.current = null;
            serviceHistoryIdsRef.current = {};
            autoScrobblingDisabledRef.current = true;
            isScrobbledRef.current = true;

            // Reset status to idle to show manual scrobble button
            setStatus('idle');

            console.log('✅ Cleared all history IDs after successful undo');
            console.log('🚫 Disabled auto-scrobbling after undo');
            console.log('🔄 Reset scrobbled state for re-scrobbling');
            console.log('🏠 Reset status to idle - manual scrobble available');
        }
        setIsProcessing(false);
        return response.success;
    }, [sendMessage]);

    return {
        status,
        isProcessing,
        historyId: historyIdRef.current,
        serviceHistoryIds: serviceHistoryIdsRef.current,
        manualScrobble,
        undoScrobble,
        pauseScrobbling: sendScrobblePause,
        stopScrobbling: sendScrobbleStop
    };
}
