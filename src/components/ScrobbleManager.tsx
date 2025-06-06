import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentSiteConfig } from '../utils/siteConfigs';
import {
    MediaInfoResponse,
    MessageRequest,
    MessageResponse,
    MediaRatings,
    RequestManualAddToHistoryParams,
    RequestScrobblePauseParams,
    RequestScrobbleStartParams,
    RequestScrobbleStopParams,
    ScrobbleNotificationMediaType,
    ScrobbleStopResponseData,
    SeasonEpisodeObj,
    WatchStatusInfo,
    ActiveScrobbleStatus,
    MediaStatusPayload,
    MediaInfoRequest,
    ShowMediaInfo,
    MovieMediaInfo,
    TraktComment,
    CommentableType
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
import { CommentModal } from './CommentModal';

const WATCHING_PING_INTERVAL_MS = 5 * 60 * 1000;
const SIGNIFICANT_PROGRESS_CHANGE_PERCENT = 5;
const VIDEO_PROGRESS_UPDATE_THROTTLE_MS = 2000;
const TRAKT_SCROBBLE_COMPLETION_THRESHOLD = 80;
async function getMediaInfoAndConfidence(
    siteConfig: any,
    url: string,
    tabUrlIdentifier: string
): Promise<MessageResponse<MediaStatusPayload>> {
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
    return await chrome.runtime.sendMessage<
        MediaInfoRequest,
        MessageResponse<MediaStatusPayload>
    >({
        action: 'mediaInfo',
        params: messageParams
    });
}

export const ScrobbleManager = () => {
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
    const [ratings, setRatings] = useState<MediaRatings | null>(null);
    const [scrobblingStatus, setScrobblingStatus] =
        useState<ActiveScrobbleStatus>('idle');

    const [isLoadingMediaInfo, setIsLoadingMediaInfo] = useState(false);
    const [needsManualConfirmation, setNeedsManualConfirmation] =
        useState(false);
    const [showStartPrompt, setShowStartPrompt] = useState(false);
    const [showRewatchPrompt, setShowRewatchPrompt] = useState(false);
    const [userConfirmedAction, setUserConfirmedAction] = useState(false);
    const [isProcessingScrobbleAction, setIsProcessingScrobbleAction] =
        useState(false);

    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
    const [commentModalType, setCommentModalType] =
        useState<CommentableType | null>(null);
    const [comments, setComments] = useState<TraktComment[]>([]);
    const [isLoadingComments, setIsLoadingComments] = useState(false);

    const [isRewatchSession, setIsRewatchSession] = useState(false);
    const [highlightTarget, setHighlightTarget] = useState<{
        season: number;
        episode: number;
        type: HighlightType;
    } | null>(null);
    const [watchedHistoryEpisodes, setWatchedHistoryEpisodes] = useState<
        { season: number; number: number }[] | undefined
    >(undefined);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const traktHistoryIdRef = useRef<number | null>(null);
    const previousUrlRef = useRef<string | null>(null);

    const [currentVideoProgress, setCurrentVideoProgress] = useState(0);
    const [localRewatchInfo, setLocalRewatchInfo] =
        useState<LocalRewatchInfo | null>(null);
    const lastProgressPingTimeRef = useRef(0);
    const lastReportedProgressRef = useRef(0);
    const timeUpdateThrottleTimerRef = useRef<number | null>(null);
    const pageUnloadRef = useRef(false);
    const waitTitleIntervalRef = useRef<number | null>(null);
    const waitTitleTimeoutRef = useRef<number | null>(null);
    const lastFetchedTitleRef = useRef<string | null>(null);
    const [isIframePlayerActive, setIsIframePlayerActive] = useState(false);
    const [iframeOrigin, setIframeOrigin] = useState<string | null>(null);
    const playerIframeRef = useRef<HTMLIFrameElement | null>(null);
    const timeUpdateProcessingScheduledRef = useRef(false);
    const latestVideoStateForThrottleRef = useRef<{
        currentTime: number;
        duration: number;
        isFromIframe?: boolean;
    } | null>(null);
    const pendingCriticalOperationRef = useRef<'pause' | 'stop' | null>(null);
    const lastSentActionTimestampRef = useRef(0);
    const MIN_TIME_BETWEEN_ACTIONS_MS = 500;

    const urlObject = new URL(currentUrl);
    const hostname = urlObject.hostname;
    const siteConfig = getCurrentSiteConfig(hostname);
    const isWatchPage = siteConfig?.isWatchPage(currentUrl) ?? false;
    const tabUrlIdentifier =
        siteConfig?.getUrlIdentifier(currentUrl) ??
        `generic-tab-media-${Date.now()}`;

    const sendMessageToBackground = useCallback(
        async <TResponseData = any,>(
            message: MessageRequest
        ): Promise<MessageResponse<TResponseData>> => {
            try {
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

    const sendScrobbleStart = useCallback(
        async (progress: number) => {
            if (!mediaInfo) return;

            const now = Date.now();
            if (
                pendingCriticalOperationRef.current ||
                now - lastSentActionTimestampRef.current <
                    MIN_TIME_BETWEEN_ACTIONS_MS * 2
            ) {
                console.log(
                    `ScrobbleManager: Deferring Scrobble Start (ping) due to pending critical op (${pendingCriticalOperationRef.current}) or recent action.`
                );
                return;
            }

            console.log(
                `ScrobbleManager: Requesting Scrobble Start at ${progress.toFixed(1)}%`
            );
            lastSentActionTimestampRef.current = now;

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
                setScrobblingStatus('started');
                lastProgressPingTimeRef.current = Date.now();
                lastReportedProgressRef.current = progress;
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
                return;
            }

            console.log(
                `ScrobbleManager: Requesting Scrobble Pause at ${progress.toFixed(1)}%`
            );
            pendingCriticalOperationRef.current = 'pause';
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
            pendingCriticalOperationRef.current = null;

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
            }
        },
        [mediaInfo, showEpisodeInfo, sendMessageToBackground, scrobblingStatus]
    );

    const sendScrobbleStop = useCallback(
        async (progress: number): Promise<ScrobbleStopResponseData | null> => {
            if (!mediaInfo || scrobblingStatus === 'idle') return null;

            const now = Date.now();
            if (
                now - lastSentActionTimestampRef.current <
                MIN_TIME_BETWEEN_ACTIONS_MS
            ) {
                console.log(
                    'ScrobbleManager: Deferring Scrobble Stop due to very recent action. Will retry shortly or on unload.'
                );
                return null;
            }
            console.log(
                `ScrobbleManager: Requesting Scrobble Stop at ${progress.toFixed(1)}%`
            );

            pendingCriticalOperationRef.current = 'stop';
            lastSentActionTimestampRef.current = now;

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

            pendingCriticalOperationRef.current = null;

            if (response.success && response.data) {
                console.log(
                    'ScrobbleManager: Stop request acknowledged by background.',
                    response.data
                );
                setScrobblingStatus('idle');
                if (
                    response.data.action === 'watched' &&
                    response.data.traktHistoryId
                ) {
                    traktHistoryIdRef.current = response.data.traktHistoryId;
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

        if (pendingCriticalOperationRef.current) {
            console.log(
                'ScrobbleManager: TimeUpdate processing deferred due to pending critical operation:',
                pendingCriticalOperationRef.current
            );
            return;
        }

        const { currentTime, duration } =
            latestVideoStateForThrottleRef.current;
        latestVideoStateForThrottleRef.current = null;

        if (isNaN(duration) || duration === 0) {
            timeUpdateProcessingScheduledRef.current = false;
            return;
        }
        const progress = (currentTime / duration) * 100;
        setCurrentVideoProgress(progress);

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
                await sendScrobbleStop(progress);
                timeUpdateProcessingScheduledRef.current = false;
                return;
            }
        }
        timeUpdateProcessingScheduledRef.current = false;
    }, [
        mediaInfo,
        userConfirmedAction,
        scrobblingStatus,
        sendScrobbleStart,
        sendScrobbleStop
    ]);

    const commonTimeUpdateHandler = useCallback(() => {
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
            console.warn(
                'commonTimeUpdateHandler called without progress for iframe. This path needs review.'
            );
            return;
        } else {
            return;
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

    const commonTimeUpdateHandlerWithProgress = useCallback(
        (progress: number) => {
            if (pageUnloadRef.current) return;

            latestVideoStateForThrottleRef.current = {
                currentTime:
                    (progress / 100) * (videoRef.current?.duration || 1),
                duration: videoRef.current?.duration || 1
            };

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
        if (isIframePlayerActive || !videoRef.current) return;
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
        commonTimeUpdateHandler();
    }, [commonTimeUpdateHandler, isIframePlayerActive]);

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
            return;
        }

        let findVideoAttempts = 0;
        const MAX_FIND_VIDEO_ATTEMPTS = 20;
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
                        iframeVideoIsLikelySource = !localVideoElement;
                    }
                } else {
                    iframeVideoIsLikelySource = !localVideoElement;
                }
            }

            if (localVideoElement && !iframeVideoIsLikelySource) {
                if (findVideoIntervalId) clearInterval(findVideoIntervalId);
                videoRef.current = localVideoElement;
                playerIframeRef.current = null;
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
                    handleLocalVideoPlay();
                }
            } else if (
                iframeVideoIsLikelySource ||
                (!localVideoElement && siteConfig?.usesIframePlayer)
            ) {
                if (findVideoIntervalId) clearInterval(findVideoIntervalId);
                videoRef.current = null;
                playerIframeRef.current = identifiedPlayerIframe;
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
            }
        };

        tryToSetupVideoPlayer();
        if (
            !videoRef.current &&
            !isIframePlayerActive &&
            findVideoAttempts < MAX_FIND_VIDEO_ATTEMPTS
        ) {
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
                playerIframeRef.current = null;
            }
            if (timeUpdateThrottleTimerRef.current) {
                clearTimeout(timeUpdateThrottleTimerRef.current);
            }
        };
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

    useEffect(() => {
        if (!mediaInfo || !userConfirmedAction) return;

        const handleIframeMessage = (event: MessageEvent) => {
            const { data } = event;
            if (
                data &&
                typeof data.type === 'string' &&
                data.type.startsWith('TMSYNC_IFRAME_')
            ) {
                if (!iframeOrigin && event.origin !== 'null') {
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
                if (isNaN(progress)) return;

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
                        commonTimeUpdateHandlerWithProgress(progressFromIframe);
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
            setIframeOrigin(null);
        };
    }, [
        mediaInfo,
        userConfirmedAction,
        isIframePlayerActive,
        commonPlayHandler,
        commonPauseHandler,
        commonEndedHandler,
        commonTimeUpdateHandlerWithProgress,
        iframeOrigin
    ]);

    useEffect(() => {
        const handleBeforeUnload = () => {
            pageUnloadRef.current = true;
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            pageUnloadRef.current = false;
        };
    }, []);

    const clearWaitTitleTimers = useCallback(() => {
        if (waitTitleIntervalRef.current !== null)
            clearInterval(waitTitleIntervalRef.current);
        if (waitTitleTimeoutRef.current !== null)
            clearTimeout(waitTitleTimeoutRef.current);
        waitTitleIntervalRef.current = null;
        waitTitleTimeoutRef.current = null;
    }, []);

    useEffect(() => {
        let lastHref = window.location.href;
        previousUrlRef.current = lastHref;
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
                previousUrlRef.current = currentUrl;
                setCurrentUrl(currentHref);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [currentUrl]);

    const processMediaStatus = useCallback(
        async (data: MediaStatusPayload) => {
            setWatchStatus(
                data.watchStatus || { isInHistory: false, isCompleted: false }
            );
            setProgressInfo(data.progressInfo || null);
            setRatings(data.ratingInfo || null);

            setShowStartPrompt(false);
            setShowRewatchPrompt(false);
            setUserConfirmedAction(false);
            setIsRewatchSession(false);

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
                    const currentEpInfo =
                        siteConfig?.getSeasonEpisodeObj(currentUrl);
                    const isCurrentEpWatchedOnTrakt = traktProgress.seasons
                        ?.find((s) => s.number === currentEpInfo?.season)
                        ?.episodes?.find(
                            (e) => e.number === currentEpInfo?.number
                        )?.completed;
                    if (isCurrentEpWatchedOnTrakt) {
                        setShowRewatchPrompt(true);
                    } else {
                        setUserConfirmedAction(true);
                    }
                    if (traktProgress.last_episode) {
                        newHighlightTargetUpdate = {
                            season: traktProgress.last_episode.season,
                            episode: traktProgress.last_episode.number,
                            type: 'first_watch_last'
                        };
                    }
                } else {
                    const localInfo = await getLocalRewatchInfo(traktShowId);

                    setShowRewatchPrompt(true);
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
        },
        [currentUrl, siteConfig]
    );

    useEffect(() => {
        console.log(
            `ScrobbleManager: Main effect for URL: ${currentUrl}. Previous: ${previousUrlRef.current}`
        );
        clearWaitTitleTimers();

        setMediaInfo(null);
        setOriginalMediaQuery(null);
        setShowEpisodeInfo(null);
        setWatchStatus(null);
        setProgressInfo(null);

        setRatings(null);
        setIsLoadingMediaInfo(true);
        setNeedsManualConfirmation(false);
        setShowStartPrompt(false);
        setShowRewatchPrompt(false);
        setUserConfirmedAction(false);
        setIsRewatchSession(false);
        setLocalRewatchInfo(null);
        setHighlightTarget(null);
        setWatchedHistoryEpisodes(undefined);
        setScrobblingStatus('idle');
        setCurrentVideoProgress(0);
        traktHistoryIdRef.current = null;
        lastProgressPingTimeRef.current = 0;
        lastReportedProgressRef.current = 0;
        pageUnloadRef.current = false;

        if (!isWatchPage) {
            setIsLoadingMediaInfo(false);
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
                setMediaInfo(fetchedMediaInfo);
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
                    await processMediaStatus(response.data);
                } else {
                    setNeedsManualConfirmation(true);
                    setShowEpisodeInfo(null);
                    setWatchStatus(null);
                    setProgressInfo(null);
                    setRatings(null);
                    setShowStartPrompt(false);
                    setShowRewatchPrompt(false);
                    setUserConfirmedAction(false);
                }
            } else {
                console.error(
                    'ScrobbleManager: Failed to get media info:',
                    response.error
                );
                setNeedsManualConfirmation(false);
            }
            lastFetchedTitleRef.current = document.title;
            setIsLoadingMediaInfo(false);
        };

        if (hostname === 'www.cineby.app') {
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
            clearWaitTitleTimers();
        };
    }, [
        currentUrl,
        isWatchPage,
        tabUrlIdentifier,
        clearWaitTitleTimers,
        hostname,
        siteConfig,
        processMediaStatus
    ]);

    const handleConfirmMedia = useCallback(
        async (confirmedMedia: MediaInfoResponse) => {
            console.log(
                'ScrobbleManager: Handling confirmed media:',
                confirmedMedia
            );
            setIsLoadingMediaInfo(true);
            setNeedsManualConfirmation(false);
            setOriginalMediaQuery(null);

            setWatchStatus(null);
            setProgressInfo(null);
            setRatings(null);
            setShowStartPrompt(false);
            setShowRewatchPrompt(false);
            setUserConfirmedAction(false);
            setScrobblingStatus('idle');
            traktHistoryIdRef.current = null;

            try {
                await sendMessageToBackground<null>({
                    action: 'confirmMedia',
                    params: confirmedMedia
                });

                setMediaInfo(confirmedMedia);

                if (isShowMediaInfo(confirmedMedia) && siteConfig) {
                    setShowEpisodeInfo(
                        siteConfig.getSeasonEpisodeObj(currentUrl) || null
                    );
                } else {
                    setShowEpisodeInfo(null);
                }

                const statusResponse =
                    await sendMessageToBackground<MediaStatusPayload>({
                        action: 'mediaInfo',
                        params: {
                            type: confirmedMedia.type,
                            query: '',
                            years: ''
                        }
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
                setMediaInfo(null);
                setNeedsManualConfirmation(true);
            } finally {
                setIsLoadingMediaInfo(false);
            }
        },
        [currentUrl, siteConfig, sendMessageToBackground, processMediaStatus]
    );

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

    const handleManualAddToHistory = useCallback(async () => {
        if (!mediaInfo) return;
        console.log(
            'ScrobbleManager: Requesting Manual Add to History via button'
        );

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
            }
            setWatchStatus((prev) => ({
                ...prev,
                isInHistory: true,
                lastWatchedAt: new Date().toISOString()
            }));
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
        sendScrobblePause
    ]);

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

    const handleRate = useCallback(
        async (
            type: 'movie' | 'show' | 'season' | 'episode',
            rating: number
        ) => {
            if (!mediaInfo) return;
            let action: any;
            let params: any = { mediaInfo, rating };
            if (type === 'movie' && isMovieMediaInfo(mediaInfo)) {
                action = 'rateMovie';
            } else if (type === 'show' && isShowMediaInfo(mediaInfo)) {
                action = 'rateShow';
            } else if (
                type === 'season' &&
                isShowMediaInfo(mediaInfo) &&
                showEpisodeInfo
            ) {
                action = 'rateSeason';
                params.episodeInfo = showEpisodeInfo;
            } else if (
                type === 'episode' &&
                isShowMediaInfo(mediaInfo) &&
                showEpisodeInfo
            ) {
                action = 'rateEpisode';
                params.episodeInfo = showEpisodeInfo;
            } else {
                return;
            }
            console.log(action, params, '👄');
            const response = await sendMessageToBackground<null>({
                action,
                params
            });
            if (response.success) {
                setRatings((prev) => ({
                    ...prev,
                    [type === 'movie' ? 'show' : type]: {
                        userRating: rating,
                        ratedAt: new Date().toISOString()
                    }
                }));
            } else {
                console.error(`Rating ${type} failed:`, response.error);
            }
        },
        [mediaInfo, showEpisodeInfo, sendMessageToBackground]
    );

    const handleUndoScrobble = useCallback(async () => {
        if (!traktHistoryIdRef.current) return;
        const response = await sendMessageToBackground<null>({
            action: 'undoScrobble',
            params: { historyId: traktHistoryIdRef.current }
        });
        if (response.success) {
            traktHistoryIdRef.current = null;
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
    }, [mediaInfo, sendMessageToBackground, processMediaStatus]);

    const handleOpenCommentModal = useCallback(
        async (type: CommentableType) => {
            if (!mediaInfo) return;

            setIsCommentModalOpen(true);
            setCommentModalType(type);
            setIsLoadingComments(true);
            setComments([]);

            const response = await sendMessageToBackground<TraktComment[]>({
                action: 'getComments',

                params: {
                    type,
                    mediaInfo,
                    episodeInfo: showEpisodeInfo || undefined
                }
            });

            if (response.success && response.data) {
                setComments(response.data);
            } else {
                console.error('Failed to fetch comments:', response.error);
            }
            setIsLoadingComments(false);
        },
        [mediaInfo, showEpisodeInfo, sendMessageToBackground]
    );

    const handleCloseCommentModal = useCallback(() => {
        setIsCommentModalOpen(false);
        setCommentModalType(null);
        setComments([]);
    }, []);

    const handlePostComment = useCallback(
        async (comment: string, spoiler: boolean) => {
            if (!mediaInfo || !commentModalType) return;
            const response = await sendMessageToBackground<TraktComment>({
                action: 'postComment',

                params: {
                    type: commentModalType,
                    mediaInfo,
                    episodeInfo: showEpisodeInfo || undefined,
                    comment,
                    spoiler
                }
            });
            if (response.success && response.data) {
                setComments((prev) => [response.data!, ...prev]);
            }
            return response;
        },
        [mediaInfo, showEpisodeInfo, commentModalType, sendMessageToBackground]
    );

    const handleUpdateComment = useCallback(
        async (commentId: number, comment: string, spoiler: boolean) => {
            const response = await sendMessageToBackground<TraktComment>({
                action: 'updateComment',
                params: { commentId, comment, spoiler }
            });
            if (response.success && response.data) {
                setComments((prev) =>
                    prev.map((c) => (c.id === commentId ? response.data! : c))
                );
            }
            return response;
        },
        [sendMessageToBackground]
    );

    const handleDeleteComment = useCallback(
        async (commentId: number) => {
            const response = await sendMessageToBackground<null>({
                action: 'deleteComment',
                params: { commentId }
            });
            if (response.success) {
                setComments((prev) => prev.filter((c) => c.id !== commentId));
            }
            return response;
        },
        [sendMessageToBackground]
    );

    const isEffectivelyScrobbled = !!traktHistoryIdRef.current;
    let SNotificationMediaInfo: ScrobbleNotificationMediaType | null = null;
    if (mediaInfo) {
        SNotificationMediaInfo = {
            ...mediaInfo,
            ...(isShowMediaInfo(mediaInfo) && showEpisodeInfo
                ? showEpisodeInfo
                : {})
        };
    }

    const showScrobbleRelatedUI =
        !isLoadingMediaInfo &&
        mediaInfo &&
        (isMovieMediaInfo(mediaInfo) ||
            (isShowMediaInfo(mediaInfo) && !!showEpisodeInfo));

    if (!isWatchPage && !isLoadingMediaInfo && !needsManualConfirmation) {
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
                        onConfirmMedia={() => {}}
                        onCancel={() => {}}
                    />
                )}
            {showScrobbleRelatedUI &&
                !isLoadingMediaInfo &&
                showStartPrompt &&
                !userConfirmedAction && (
                    <StartWatchPrompt
                        onConfirm={() => setUserConfirmedAction(true)}
                    />
                )}
            {showScrobbleRelatedUI &&
                !isLoadingMediaInfo &&
                showRewatchPrompt &&
                !userConfirmedAction && (
                    <RewatchPrompt
                        onConfirm={() => {
                            setUserConfirmedAction(true);
                            setIsRewatchSession(true);
                        }}
                    />
                )}

            {showScrobbleRelatedUI &&
                !isLoadingMediaInfo &&
                !needsManualConfirmation &&
                SNotificationMediaInfo &&
                (userConfirmedAction || isEffectivelyScrobbled) && (
                    <ScrobbleNotification
                        mediaInfo={SNotificationMediaInfo!}
                        isEffectivelyScrobbled={isEffectivelyScrobbled}
                        traktHistoryId={traktHistoryIdRef.current}
                        liveScrobbleStatus={scrobblingStatus}
                        onManualScrobble={async () => {
                            setIsProcessingScrobbleAction(true);
                            await handleManualAddToHistory();
                            setIsProcessingScrobbleAction(false);
                        }}
                        onUndoScrobble={async () => {
                            setIsProcessingScrobbleAction(true);
                            await handleUndoScrobble();
                            setIsProcessingScrobbleAction(false);
                        }}
                        isProcessingAction={isProcessingScrobbleAction}
                        ratings={ratings}
                        onRate={handleRate}
                        onOpenCommentModal={handleOpenCommentModal}
                    />
                )}

            <CommentModal
                isOpen={isCommentModalOpen}
                onClose={handleCloseCommentModal}
                isLoading={isLoadingComments}
                comments={comments}
                mediaInfo={mediaInfo}
                ratings={ratings}
                commentType={commentModalType}
                onPostComment={handlePostComment}
                onUpdateComment={handleUpdateComment}
                onDeleteComment={handleDeleteComment}
                onRate={handleRate}
            />
        </>
    );
};
