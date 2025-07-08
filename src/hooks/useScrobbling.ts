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
const TRAKT_SCROBBLE_COMPLETION_THRESHOLD = 80;
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
    const autoScrobblingDisabledRef = useRef(false);
    const completedRef = useRef(false);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const lastPingTimeRef = useRef(0);
    const lastReportedProgressRef = useRef(0);
    const lastSentActionTimestampRef = useRef(0);
    const timeUpdateProcessingScheduledRef = useRef(false);
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
                if (
                    response.data.action === 'watched' &&
                    response.data.traktHistoryId
                ) {
                    console.log(
                        '✅ Setting historyId to prevent future starts:',
                        response.data.traktHistoryId
                    );
                    historyIdRef.current = response.data.traktHistoryId;
                    autoScrobblingDisabledRef.current = false;
                    completedRef.current = true;

                    // Store service-specific history IDs for proper undo functionality
                    if (response.data.serviceHistoryIds) {
                        serviceHistoryIdsRef.current =
                            response.data.serviceHistoryIds;
                        console.log(
                            '💾 Stored service-specific history IDs:',
                            response.data.serviceHistoryIds
                        );
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

            // Stop all operations if episode/movie is completed
            if (completedRef.current) {
                console.log('🚫 Skipping time update - episode completed');
                timeUpdateProcessingScheduledRef.current = false;
                return;
            }

            setProgress(latestProgress);

            if (status === 'started') {
                const now = Date.now();
                const progressDelta = Math.abs(
                    latestProgress - lastReportedProgressRef.current
                );

                // Priority: Stop takes precedence over start to avoid conflicting operations
                if (
                    latestProgress >= TRAKT_SCROBBLE_COMPLETION_THRESHOLD &&
                    !historyIdRef.current &&
                    globalScrobblingEnabled &&
                    !autoScrobblingDisabledRef.current
                ) {
                    console.log(
                        '🛑 Triggering stop - progress:',
                        latestProgress,
                        'historyId:',
                        historyIdRef.current
                    );
                    await sendScrobbleStop();
                } else if (
                    now - lastPingTimeRef.current > WATCHING_PING_INTERVAL_MS ||
                    progressDelta >= 5
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
            setTimeout(
                () => processThrottledTimeUpdate(currentProgress),
                VIDEO_PROGRESS_UPDATE_THROTTLE_MS
            );
        }
    }, [processThrottledTimeUpdate]);

    const handlePlay = useCallback(() => {
        if (!mediaInfo || !userConfirmedAction || !globalScrobblingEnabled)
            return;
        if (completedRef.current) {
            console.log('🚫 Skipping start on play - episode completed');
            return;
        }
        if (historyIdRef.current) {
            console.log(
                '🚫 Skipping start on play - already completed (historyId:',
                historyIdRef.current,
                ')'
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
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, []);

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
            // Store both legacy and service-specific IDs
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
            autoScrobblingDisabledRef.current = false;
            console.log('✅ Re-enabled auto-scrobbling after manual scrobble');
        }
        setIsProcessing(false);
    }, [mediaInfo, episodeInfo, status, sendMessage, sendScrobblePause]);

    const undoScrobble = useCallback(async () => {
        if (
            !historyIdRef.current &&
            Object.keys(serviceHistoryIdsRef.current).length === 0
        ) {
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
            historyIdRef.current = null;
            serviceHistoryIdsRef.current = {};
            autoScrobblingDisabledRef.current = true;
            completedRef.current = false;
            console.log('✅ Cleared all history IDs after successful undo');
            console.log('🚫 Disabled auto-scrobbling after undo');
            console.log('🔄 Reset completion state for re-scrobbling');
        }
        setIsProcessing(false);
        return response.success;
    }, [sendMessage]);

    return {
        status,
        isProcessing,
        historyId: historyIdRef.current,
        manualScrobble,
        undoScrobble,
        pauseScrobbling: sendScrobblePause,
        stopScrobbling: sendScrobbleStop
    };
}
