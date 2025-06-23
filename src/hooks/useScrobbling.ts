import { useState, useEffect, useCallback, useRef } from 'react';
import {
    MediaInfoResponse,
    SeasonEpisodeObj,
    ActiveScrobbleStatus,
    RequestScrobbleStartParams,
    RequestScrobblePauseParams,
    RequestScrobbleStopParams,
    ScrobbleStopResponseData,
    RequestManualAddToHistoryParams,
    MessageRequest,
    MessageResponse
} from '../utils/types';
import { saveLocalRewatchInfo } from '../utils/helpers/localRewatch';
import { isShowMediaInfo } from '../utils/typeGuards';

const VIDEO_PROGRESS_UPDATE_THROTTLE_MS = 2000;
const WATCHING_PING_INTERVAL_MS = 5 * 60 * 1000;
const TRAKT_SCROBBLE_COMPLETION_THRESHOLD = 80;
const MIN_TIME_BETWEEN_ACTIONS_MS = 500;

export function useScrobbling(
    mediaInfo: MediaInfoResponse | null,
    episodeInfo: SeasonEpisodeObj | null,
    userConfirmedAction: boolean,
    isRewatchSession: boolean
) {
    const [status, setStatus] = useState<ActiveScrobbleStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);
    const historyIdRef = useRef<number | null>(null);

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
        if (!mediaInfo) return;
        const now = Date.now();
        if (
            now - lastSentActionTimestampRef.current <
            MIN_TIME_BETWEEN_ACTIONS_MS * 2
        )
            return;
        lastSentActionTimestampRef.current = now;

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
    }, [mediaInfo, episodeInfo, progress, sendMessage]);

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
        if (!mediaInfo || status === 'idle') return null;
        const now = Date.now();
        if (
            now - lastSentActionTimestampRef.current <
            MIN_TIME_BETWEEN_ACTIONS_MS
        )
            return null;
        lastSentActionTimestampRef.current = now;

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
            setStatus('idle');
            if (
                response.data.action === 'watched' &&
                response.data.traktHistoryId
            ) {
                historyIdRef.current = response.data.traktHistoryId;
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
            return response.data;
        }
        return null;
    }, [
        mediaInfo,
        episodeInfo,
        progress,
        status,
        isRewatchSession,
        sendMessage
    ]);

    const processThrottledTimeUpdate = useCallback(
        async (latestProgress: number) => {
            timeUpdateProcessingScheduledRef.current = false;
            if (!mediaInfo || !userConfirmedAction || pageUnloadRef.current)
                return;

            setProgress(latestProgress);

            if (status === 'started') {
                const now = Date.now();
                const progressDelta = Math.abs(
                    latestProgress - lastReportedProgressRef.current
                );

                if (
                    now - lastPingTimeRef.current > WATCHING_PING_INTERVAL_MS ||
                    progressDelta >= 5
                ) {
                    await sendScrobbleStart();
                }

                if (
                    latestProgress >= TRAKT_SCROBBLE_COMPLETION_THRESHOLD &&
                    !historyIdRef.current
                ) {
                    await sendScrobbleStop();
                }
            }
        },
        [
            mediaInfo,
            userConfirmedAction,
            status,
            sendScrobbleStart,
            sendScrobbleStop
        ]
    );

    const handleTimeUpdate = useCallback(() => {
        if (!videoRef.current || pageUnloadRef.current) return;
        const { currentTime, duration } = videoRef.current;
        if (isNaN(duration) || duration === 0) return;

        const currentProgress = (currentTime / duration) * 100;
        if (!timeUpdateProcessingScheduledRef.current) {
            timeUpdateProcessingScheduledRef.current = true;
            setTimeout(
                () => processThrottledTimeUpdate(currentProgress),
                VIDEO_PROGRESS_UPDATE_THROTTLE_MS
            );
        }
    }, [processThrottledTimeUpdate]);

    const handlePlay = useCallback(() => {
        if (!mediaInfo || !userConfirmedAction) return;
        if (status === 'idle' || status === 'paused') sendScrobbleStart();
    }, [mediaInfo, userConfirmedAction, status, sendScrobbleStart]);

    const handlePause = useCallback(() => {
        if (!mediaInfo || !userConfirmedAction) return;
        if (status === 'started') sendScrobblePause();
    }, [mediaInfo, userConfirmedAction, status, sendScrobblePause]);

    const handleEnded = useCallback(async () => {
        if (!mediaInfo || !userConfirmedAction) return;
        if (status === 'started' || status === 'paused') {
            setProgress(100);
            await sendScrobbleStop();
        }
    }, [mediaInfo, userConfirmedAction, status, sendScrobbleStop]);

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
        const response = await sendMessage<{ traktHistoryId?: number }>({
            action: 'requestManualAddToHistory',
            params
        });
        if (response.success && response.data?.traktHistoryId) {
            historyIdRef.current = response.data.traktHistoryId;
        }
        setIsProcessing(false);
    }, [mediaInfo, episodeInfo, status, sendMessage, sendScrobblePause]);

    const undoScrobble = useCallback(async () => {
        if (!historyIdRef.current) return false;
        setIsProcessing(true);
        const response = await sendMessage({
            action: 'undoScrobble',
            params: { historyId: historyIdRef.current }
        });
        if (response.success) {
            historyIdRef.current = null;
        }
        setIsProcessing(false);
        return response.success;
    }, [sendMessage]);

    return {
        status,
        isProcessing,
        historyId: historyIdRef.current,
        manualScrobble,
        undoScrobble
    };
}
