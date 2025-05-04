import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentSiteConfig } from '../utils/siteConfigs';
import { SiteConfigBase } from '../utils/siteConfigs/baseConfig';
import {
    MediaInfoRequest,
    MediaInfoResponse,
    MediaStatusPayload,
    MessageRequest,
    MessageResponse,
    RatingInfo,
    ScrobbleNotificationMediaType,
    ScrobbleRequest,
    ScrobbleResponse,
    SeasonEpisodeObj,
    UndoScrobbleRequest,
    WatchStatusInfo
} from '../utils/types';
import { ScrobbleNotification } from './ScrobbleNotification';
import { ManualSearchPrompt } from './ManualSearchPrompt';
import { LoadingIndicator } from './LoadingIndicator';
import { isShowMediaInfo } from '../utils/typeGuards';
import { TraktShowWatchedProgress } from '../utils/types/traktApi';
import { StartWatchPrompt } from './StartWatchPrompt';
import { RewatchPrompt } from './RewatchPrompt';

// Helper function to manage local rewatch storage (can be moved to utils)
const REWATCH_STORAGE_KEY = 'tmsync_rewatch_progress';
type LocalRewatchProgress = {
    [traktShowId: number]: {
        season: number;
        number: number;
        timestamp: number;
    };
};

async function getLocalRewatchProgress(
    showId: number
): Promise<{ season: number; number: number } | null> {
    try {
        const data = await chrome.storage.local.get(REWATCH_STORAGE_KEY);
        const allProgress: LocalRewatchProgress =
            data[REWATCH_STORAGE_KEY] || {};
        const showProgress = allProgress[showId];
        return showProgress
            ? { season: showProgress.season, number: showProgress.number }
            : null;
    } catch (error) {
        console.error('Error getting local rewatch progress:', error);
        return null;
    }
}

async function saveLocalRewatchProgress(
    showId: number,
    season: number,
    episode: number
): Promise<void> {
    try {
        const data = await chrome.storage.local.get(REWATCH_STORAGE_KEY);
        const allProgress: LocalRewatchProgress =
            data[REWATCH_STORAGE_KEY] || {};
        allProgress[showId] = {
            season: season,
            number: episode,
            timestamp: Date.now()
        };
        await chrome.storage.local.set({ [REWATCH_STORAGE_KEY]: allProgress });
        console.log(
            `Saved local rewatch progress for ${showId}: S${season}E${episode}`
        );
    } catch (error) {
        console.error('Error saving local rewatch progress:', error);
    }
}

async function getMediaInfoAndConfidence(
    siteConfig: SiteConfigBase,
    url: string,
    tabUrlIdentifier: string
): Promise<MessageResponse<MediaStatusPayload>> {
    try {
        const mediaInfoGet = await chrome.storage.local.get(tabUrlIdentifier);
        if (
            tabUrlIdentifier &&
            mediaInfoGet[tabUrlIdentifier] &&
            mediaInfoGet[tabUrlIdentifier].confidence === 'high'
        ) {
            console.log(
                'Using high-confidence cached mediaInfo from storage:',
                mediaInfoGet[tabUrlIdentifier].mediaInfo
            );
            return {
                success: true,
                data: {
                    mediaInfo: mediaInfoGet[tabUrlIdentifier]
                        .mediaInfo as MediaInfoResponse,
                    confidence: 'high' as const,
                    originalQuery: mediaInfoGet[tabUrlIdentifier]
                        .originalQuery || {
                        type: mediaInfoGet[tabUrlIdentifier].mediaInfo.type,
                        query: '',
                        years: ''
                    }
                }
            };
        }
    } catch (e) {
        console.error('Error reading cache in ScrobbleManager:', e);
    }

    try {
        const mediaType = siteConfig.getMediaType(url);
        if (!mediaType) {
            console.error('Media type not found by siteConfig');
            return {
                success: false,
                error: 'Failed to determine media type from URL.'
            };
        }

        let title: string | null = null;
        let year: string | null = null;
        let messageParams: { type: string; query: string; years: string };

        if (siteConfig.usesTmdbId) {
            console.log(
                'TMDB ID site detected, attempting optional title/year scrape for fallback context...'
            );
            title = await siteConfig.getTitle(url);
            year = await siteConfig.getYear(url);

            messageParams = {
                type: mediaType,
                query: title || '',
                years: year || ''
            };
        } else {
            console.log('Non-TMDB ID site, scraping required title/year...');
            title = await siteConfig.getTitle(url);
            year = await siteConfig.getYear(url);

            if (!title || !year) {
                console.error(
                    'Required Title or Year not found by siteConfig for non-TMDB site.'
                );
                return {
                    success: false,
                    error: 'Failed to extract required media details (title/year) from page.'
                };
            }
            messageParams = {
                type: mediaType,
                query: title,
                years: year
            };
        }

        console.log('Sending mediaInfo message with params:', messageParams);
        const resp = await chrome.runtime.sendMessage<
            MediaInfoRequest,
            MessageResponse<MediaStatusPayload>
        >({
            action: 'mediaInfo',
            params: messageParams
        });

        console.log('Background mediaInfo response:', resp);
        return resp;
    } catch (error) {
        console.error('Error requesting media info:', error);
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'Unknown error getting media info'
        };
    }
}

function scrobbleMedia(
    progress?: number
): Promise<MessageResponse<ScrobbleResponse>> {
    return chrome.runtime
        .sendMessage<ScrobbleRequest, MessageResponse<ScrobbleResponse>>({
            action: 'scrobble',
            params: {
                progress: progress || 100
            }
        })
        .then((resp) => {
            if (!resp.success) {
                console.error('Error sending scrobble:', resp.error);
                return resp;
            }

            console.log('Scrobble response:', resp.data);
            if (!resp.data) return resp;

            return resp;
        })
        .catch((err: Error) => {
            console.error('Error sending scrobble:', err);
            return { success: false, error: err.message };
        });
}

function undoScrobbleMedia(
    historyId: number
): Promise<MessageResponse<unknown>> {
    return chrome.runtime
        .sendMessage<UndoScrobbleRequest, MessageResponse<unknown>>({
            action: 'undoScrobble',
            params: {
                historyId: historyId
            }
        })
        .then((resp: MessageResponse<unknown>) => {
            if (resp.success) {
                console.log('Undo scrobble response:', resp);
            } else {
                console.error('Error undoing scrobble:', resp.error);
            }
            return resp;
        })
        .catch((err: Error) => {
            console.error('Error undoing scrobble:', err);
            return { success: false, error: err.message };
        });
}

export const ScrobbleManager = () => {
    // --- State Variables ---
    const [mediaInfo, setMediaInfo] = useState<MediaInfoResponse | null>(null);
    const [originalMediaQuery, setOriginalMediaQuery] = useState<{
        type: string;
        query: string;
        years: string;
    } | null>(null);
    const [showEpisodeInfo, setShowEpisodeInfo] =
        useState<SeasonEpisodeObj | null>(null); // S/E of *current* page
    const [currentUrl, setCurrentUrl] = useState(window.location.href);

    // Status State
    const [watchStatus, setWatchStatus] = useState<WatchStatusInfo | null>(
        null
    );
    const [progressInfo, setProgressInfo] =
        useState<TraktShowWatchedProgress | null>(null);
    const [ratingInfo, setRatingInfo] = useState<RatingInfo | null>(null);

    // UI / Flow Control State
    const [isLoadingMediaInfo, setIsLoadingMediaInfo] = useState(false);
    const [isScrobbled, setIsScrobbled] = useState(false);
    const [isScrobbling, setIsScrobbling] = useState(false);
    const [needsManualConfirmation, setNeedsManualConfirmation] =
        useState(false);
    const [showStartPrompt, setShowStartPrompt] = useState(false); // New
    const [showRewatchPrompt, setShowRewatchPrompt] = useState(false); // New
    const [userConfirmedAction, setUserConfirmedAction] = useState(false); // New - Gate for actions requiring prompt
    const [isRewatchSession, setIsRewatchSession] = useState(false); // New - Tracks if current session is confirmed rewatch

    // Local Rewatch State
    const [localRewatchLastEpisode, setLocalRewatchLastEpisode] = useState<{
        season: number;
        number: number;
    } | null>(null); // New

    const traktHistoryIdRef = useRef<number | null>(null);
    const previousUrlRef = useRef<string | null>(null);
    const waitTitleIntervalRef = useRef<number | null>(null);
    const waitTitleTimeoutRef = useRef<number | null>(null);
    const lastFetchedTitleRef = useRef<string | null>(null);
    const undoPressed = useRef(false);

    const urlObject = new URL(currentUrl);
    const hostname = urlObject.hostname;
    const siteConfig = getCurrentSiteConfig(hostname);
    const isWatchPage = siteConfig?.isWatchPage(currentUrl) ?? false;
    const tabUrlIdentifier = siteConfig?.getUrlIdentifier(currentUrl) ?? '';

    const handleScrobble = useCallback(async () => {
        // Gate checks: Ensure media is confirmed, not already scrobbling/scrobbled,
        // and user has confirmed action if it was required (first watch/rewatch)
        const isFirstWatch = !watchStatus?.isInHistory; // Determine based on fetched status
        if (
            !mediaInfo ||
            !tabUrlIdentifier ||
            isScrobbling ||
            isScrobbled ||
            ((showStartPrompt || showRewatchPrompt) && !userConfirmedAction)
        ) {
            console.warn('Scrobble prevented:', {
                mediaInfo: !!mediaInfo,
                tabUrlIdentifier: !!tabUrlIdentifier,
                isScrobbling,
                isScrobbled,
                needsPrompt: showStartPrompt || showRewatchPrompt,
                confirmed: userConfirmedAction
            });
            return;
        }

        setIsScrobbling(true);
        console.log('Initiating scrobble...');

        try {
            const scrobbleResponse = await scrobbleMedia();
            const traktHistoryId = scrobbleResponse.data?.traktHistoryId;
            if (traktHistoryId) {
                traktHistoryIdRef.current = traktHistoryId;
                setIsScrobbled(true);
                setNeedsManualConfirmation(false); // Scrobbling implies confirmation
                console.log('Scrobble successful, History ID:', traktHistoryId);

                // --- Handle Local Rewatch Update ---
                if (
                    isRewatchSession &&
                    isShowMediaInfo(mediaInfo) &&
                    showEpisodeInfo
                ) {
                    await saveLocalRewatchProgress(
                        mediaInfo.show.ids.trakt,
                        showEpisodeInfo.season,
                        showEpisodeInfo.number
                    );
                    // Update local state to reflect the newly watched episode for highlighting
                    setLocalRewatchLastEpisode(showEpisodeInfo);
                }

                // --- Potentially Fetch Updated Rating ---
                // Decide if fetching the rating again immediately after scrobble is needed.
                // Usually not, unless the rating UI needs instant feedback after adding history.
                // We'll handle rating separately via its own action.
            } else {
                console.error(
                    'Scrobble action did not return history ID.',
                    scrobbleResponse.error
                );
            }
        } catch (error) {
            console.error('Error during scrobble execution:', error);
        } finally {
            setIsScrobbling(false);
        }
    }, [
        mediaInfo,
        tabUrlIdentifier,
        isScrobbling,
        isScrobbled,
        watchStatus,
        showStartPrompt,
        showRewatchPrompt,
        userConfirmedAction,
        isRewatchSession,
        showEpisodeInfo
    ]);

    const handleUndoScrobble = useCallback(async () => {
        if (!traktHistoryIdRef.current || isScrobbling) return;

        console.log('Initiating undo scrobble...');
        try {
            const response = await undoScrobbleMedia(traktHistoryIdRef.current);
            if (response.success) {
                setIsScrobbled(false);
                traktHistoryIdRef.current = null;
                undoPressed.current = true;
                console.log('Undo successful.');
            } else {
                console.error('Undo failed:', response.error);
            }
        } catch (error) {
            console.error('Error during undo execution:', error);
        }
    }, [isScrobbling]);

    const handleConfirmMedia = useCallback(
        async (confirmedMedia: MediaInfoResponse) => {
            console.log('Handling confirmed media in manager:', confirmedMedia);
            setIsLoadingMediaInfo(true); // Show loading while confirming/caching and fetching status
            setMediaInfo(confirmedMedia);
            setNeedsManualConfirmation(false);
            setOriginalMediaQuery(null);

            // Clear previous status before fetching new one
            setWatchStatus(null);
            setProgressInfo(null);
            setRatingInfo(null);
            setLocalRewatchLastEpisode(null);
            setIsRewatchSession(false);
            setShowStartPrompt(false);
            setShowRewatchPrompt(false);
            setUserConfirmedAction(false); // Reset confirmation

            try {
                // Send confirmation to background to cache it as 'high' confidence
                await chrome.runtime.sendMessage<
                    MessageRequest,
                    MessageResponse<null>
                >({
                    action: 'confirmMedia',
                    params: confirmedMedia
                });
                console.log('Confirmed media saved to background cache.');

                // --- Now Fetch Status Details for the Confirmed Media ---
                const currentUrl = window.location.href; // Get fresh URL
                const urlObject = new URL(currentUrl);
                const siteConfig = getCurrentSiteConfig(urlObject.hostname);
                const tabUrlIdentifier =
                    siteConfig?.getUrlIdentifier(currentUrl) ?? '';

                if (siteConfig && tabUrlIdentifier) {
                    console.log(
                        'Fetching status details after manual confirmation...'
                    );
                    // Re-use the background 'mediaInfo' action logic, but we know it's high confidence now
                    // We primarily need the status details part of the payload
                    const statusResponse = await chrome.runtime.sendMessage<
                        MediaInfoRequest, // Sending like a mediaInfo request again
                        MessageResponse<MediaStatusPayload>
                    >({
                        action: 'mediaInfo',
                        // Send minimal params, background will use cached mediaInfo if available
                        params: {
                            type: confirmedMedia.type,
                            query: '',
                            years: ''
                        }
                    });

                    if (
                        statusResponse.success &&
                        statusResponse.data?.confidence === 'high'
                    ) {
                        console.log(
                            'Received status details after confirmation:',
                            statusResponse.data
                        );
                        await processMediaStatus(statusResponse.data); // Use helper to set state
                    } else {
                        console.error(
                            'Failed to fetch status details after confirmation:',
                            statusResponse.error
                        );
                        // Handle error - maybe show defaults?
                    }
                }
            } catch (error) {
                console.error('Failed during confirmMedia processing:', error);
                // Reset state?
                setMediaInfo(null);
                setNeedsManualConfirmation(true); // Go back to prompt?
            } finally {
                setIsLoadingMediaInfo(false);
            }
        },
        [siteConfig] // Dependency might need adjustment
    );

    const handleCancelManualSearch = useCallback(() => {
        setNeedsManualConfirmation(false);
        setOriginalMediaQuery(null);
        console.log('Manual identification cancelled.');
    }, []);

    // --- New Prompt Handlers ---
    const handleConfirmStartWatching = useCallback(() => {
        console.log('User confirmed Start Watching.');
        setUserConfirmedAction(true);
        setShowStartPrompt(false);
        // Auto-scrobble check will now proceed if video is playing past threshold
    }, []);

    const handleConfirmRewatch = useCallback(() => {
        console.log('User confirmed Rewatch.');
        setUserConfirmedAction(true);
        setIsRewatchSession(true); // Mark this as a rewatch session
        setShowRewatchPrompt(false);
        // Fetch local progress again maybe? Or rely on initial fetch.
        // Auto-scrobble check will now proceed.
    }, []);

    // --- Rating Handler ---
    const handleRateItem = useCallback(
        async (rating: number) => {
            if (!mediaInfo || rating < 1 || rating > 10) {
                console.warn(
                    'Cannot rate: Missing media info or invalid rating.'
                );
                return;
            }
            console.log(`Submitting rating: ${rating}`);
            // Optionally show a 'Saving rating...' state
            try {
                const response = await chrome.runtime.sendMessage<
                    MessageRequest,
                    MessageResponse<null>
                >({
                    action: 'rateItem',
                    params: { mediaInfo, rating }
                });
                if (response.success) {
                    console.log('Rating submitted successfully.');
                    // Update local rating state immediately for better UX
                    setRatingInfo((prev) => ({
                        ...prev,
                        userRating: rating,
                        ratedAt: new Date().toISOString()
                    }));
                } else {
                    console.error('Failed to submit rating:', response.error);
                    // Show error to user?
                }
            } catch (error) {
                console.error('Error sending rating message:', error);
                // Show error to user?
            }
        },
        [mediaInfo]
    );

    // --- Helper to process fetched media status ---
    const processMediaStatus = useCallback(async (data: MediaStatusPayload) => {
        setWatchStatus(data.watchStatus || null);
        setProgressInfo(data.progressInfo || null);
        setRatingInfo(data.ratingInfo || null);

        // Determine flow state based on status
        const isFirst = !data.watchStatus?.isInHistory;
        // Define rewatch: progress exists and is completed, or simply isInHistory and not first watch?
        // Let's use: Has history AND (Trakt progress is complete OR Trakt progress missing/stuck but history exists)
        const traktProgressComplete =
            !!data.progressInfo &&
            data.progressInfo.aired > 0 &&
            data.progressInfo.aired === data.progressInfo.completed;
        const isLikelyRewatch = !!data.watchStatus?.isInHistory && !isFirst; // Simpler: if it's in history, it's potentially a rewatch

        console.log('Processing Status:', {
            isFirst,
            isLikelyRewatch,
            traktProgressComplete
        });

        setShowStartPrompt(isFirst);
        setShowRewatchPrompt(isLikelyRewatch);
        setUserConfirmedAction(false); // Require confirmation for new session
        setIsRewatchSession(false); // Reset rewatch session flag initially

        // If it's potentially a rewatch, fetch local progress
        if (isLikelyRewatch && isShowMediaInfo(data.mediaInfo)) {
            const localProgress = await getLocalRewatchProgress(
                data.mediaInfo.show.ids.trakt
            );
            console.log('Fetched local rewatch progress:', localProgress);
            setLocalRewatchLastEpisode(localProgress);
        } else {
            setLocalRewatchLastEpisode(null);
        }
    }, []);

    const clearWaitTitleTimers = useCallback(() => {
        if (waitTitleIntervalRef.current !== null) {
            clearInterval(waitTitleIntervalRef.current);
            waitTitleIntervalRef.current = null;
        }
        if (waitTitleTimeoutRef.current !== null) {
            clearTimeout(waitTitleTimeoutRef.current);
            waitTitleTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        let lastHref = window.location.href;

        previousUrlRef.current = lastHref;
        setCurrentUrl(lastHref);

        const interval = setInterval(() => {
            const currentHref = window.location.href;
            if (currentHref !== lastHref) {
                lastHref = currentHref;

                previousUrlRef.current = currentUrl;
                setCurrentUrl(currentHref);
            }
        }, 500);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        console.log(`Main effect running for URL: ${currentUrl}`);
        clearWaitTitleTimers();
        const previousUrl = previousUrlRef.current;
        previousUrlRef.current = currentUrl; // Update previous URL ref *after* using it

        if (!isWatchPage) {
            // Reset all state if not on watch page
            setIsLoadingMediaInfo(false);
            setMediaInfo(null);
            setIsScrobbled(false);
            setNeedsManualConfirmation(false);
            setOriginalMediaQuery(null);
            setShowEpisodeInfo(null);
            setWatchStatus(null);
            setProgressInfo(null);
            setRatingInfo(null);
            setShowStartPrompt(false);
            setShowRewatchPrompt(false);
            setUserConfirmedAction(false);
            setIsRewatchSession(false);
            setLocalRewatchLastEpisode(null);
            traktHistoryIdRef.current = null;
            undoPressed.current = false;
            lastFetchedTitleRef.current = null;
            return;
        }

        // --- On Watch Page ---
        setIsLoadingMediaInfo(true);
        // Reset transient state *before* fetch
        setMediaInfo(null);
        setIsScrobbled(false);
        setNeedsManualConfirmation(false);
        setOriginalMediaQuery(null);
        setShowEpisodeInfo(null);
        setWatchStatus(null);
        setProgressInfo(null);
        setRatingInfo(null);
        setShowStartPrompt(false);
        setShowRewatchPrompt(false);
        setUserConfirmedAction(false);
        setIsRewatchSession(false);
        setLocalRewatchLastEpisode(null);
        traktHistoryIdRef.current = null;
        undoPressed.current = false;

        const fetchAndProcess = async () => {
            if (!siteConfig || !tabUrlIdentifier) {
                setIsLoadingMediaInfo(false);
                return;
            }

            const response = await getMediaInfoAndConfidence(
                siteConfig,
                currentUrl,
                tabUrlIdentifier
            );

            // Check if URL changed during async fetch
            if (currentUrl !== window.location.href) {
                console.warn(
                    'URL changed during fetch, discarding result for:',
                    currentUrl
                );
                setIsLoadingMediaInfo(false);
                return;
            }

            if (response.success && response.data) {
                const {
                    mediaInfo: fetchedMediaInfo,
                    confidence,
                    originalQuery,
                    ...statusDetails
                } = response.data;

                if (confidence === 'high' && fetchedMediaInfo) {
                    setMediaInfo(fetchedMediaInfo);
                    setNeedsManualConfirmation(false);
                    setOriginalMediaQuery(null);
                    // Determine current S/E for shows
                    if (isShowMediaInfo(fetchedMediaInfo)) {
                        setShowEpisodeInfo(
                            siteConfig.getSeasonEpisodeObj(currentUrl) || null
                        );
                    } else {
                        setShowEpisodeInfo(null);
                    }
                    // Process the status details received from background
                    await processMediaStatus(response.data); // Pass the whole payload
                } else {
                    // Low confidence
                    setMediaInfo(null);
                    setNeedsManualConfirmation(true);
                    setOriginalMediaQuery(originalQuery);
                    // Reset status details on low confidence
                    setWatchStatus(null);
                    setProgressInfo(null);
                    setRatingInfo(null);
                    setShowStartPrompt(false);
                    setShowRewatchPrompt(false);
                    setUserConfirmedAction(false);
                    setIsRewatchSession(false);
                    setLocalRewatchLastEpisode(null);
                }
            } else {
                console.error('Failed to get media info:', response.error);
                // Reset all state on failure
                setMediaInfo(null);
                setNeedsManualConfirmation(false);
                setOriginalMediaQuery(null);
                setShowEpisodeInfo(null);
                setWatchStatus(null);
                setProgressInfo(null);
                setRatingInfo(null);
                setShowStartPrompt(false);
                setShowRewatchPrompt(false);
                setUserConfirmedAction(false);
                setIsRewatchSession(false);
                setLocalRewatchLastEpisode(null);
            }
            lastFetchedTitleRef.current = document.title;
            setIsLoadingMediaInfo(false);
        };

        // --- Site-specific logic (Cineby) ---
        if (hostname === 'www.cineby.app') {
            // ... Keep Cineby timer logic, calling fetchAndProcess() when ready ...
            // Ensure setIsLoadingMediaInfo(false) is called within fetchAndProcess
            // Start loading indicator immediately if waiting
            const currentTitle = document.title;
            const previousFetchedTitle = lastFetchedTitleRef.current;
            const isNavigation =
                currentUrl !== previousUrl && previousUrl !== null;
            const isTitleStale =
                isNavigation &&
                currentTitle === previousFetchedTitle &&
                currentTitle !== 'Cineby';
            const isTitleGeneric = currentTitle === 'Cineby';
            const needsToWait = isTitleGeneric || isTitleStale;

            if (needsToWait) {
                console.log(`Cineby: Waiting for title update...`);
                setIsLoadingMediaInfo(true);

                waitTitleIntervalRef.current = window.setInterval(() => {
                    const newTitle = document.title;
                    const newIsTitleStale =
                        isNavigation &&
                        newTitle === previousFetchedTitle &&
                        newTitle !== 'Cineby';
                    const newIsTitleGeneric = newTitle === 'Cineby';

                    if (!newIsTitleGeneric && !newIsTitleStale) {
                        console.log(
                            `Cineby: Title updated to '${newTitle}'. Fetching.`
                        );
                        clearWaitTitleTimers();
                        fetchAndProcess();
                    }
                }, 500);

                waitTitleTimeoutRef.current = window.setTimeout(() => {
                    console.warn(`Cineby: Timeout waiting for title update.`);
                    clearWaitTitleTimers();
                    console.log('Cineby: Fetching after timeout.');
                    fetchAndProcess();
                }, 5000);
            } else {
                fetchAndProcess();
            }
        } else {
            fetchAndProcess(); // Fetch immediately for other sites
        }

        return () => {
            clearWaitTitleTimers();
        };
    }, [
        currentUrl,
        isWatchPage,
        siteConfig,
        tabUrlIdentifier,
        clearWaitTitleTimers
    ]);

    useEffect(() => {
        if (
            !mediaInfo ||
            isLoadingMediaInfo ||
            isScrobbled ||
            isScrobbling ||
            undoPressed.current ||
            needsManualConfirmation
        ) {
            return;
        }

        console.log('Setting up video monitor for auto-scrobble check.');
        const monitorVideoInterval = window.setInterval(() => {
            try {
                const video = document.querySelector('video');

                if (
                    !video ||
                    video.readyState < 3 ||
                    video.duration === 0 ||
                    isNaN(video.duration)
                )
                    return;

                const watchPercentage =
                    (video.currentTime / video.duration) * 100;

                if (
                    mediaInfo &&
                    !isScrobbled &&
                    !isScrobbling &&
                    watchPercentage >= 80
                ) {
                    console.log(
                        `Watch percentage ${watchPercentage.toFixed(1)}% >= 80%. Triggering auto-scrobble.`
                    );
                    handleScrobble();
                    window.clearInterval(monitorVideoInterval);
                }
            } catch (error) {
                console.error('Error in video monitoring:', error);
            }
        }, 3000);

        return () => {
            window.clearInterval(monitorVideoInterval);
        };
    }, [
        mediaInfo,
        isScrobbled,
        needsManualConfirmation,
        handleScrobble,
        isScrobbling,
        isLoadingMediaInfo
    ]);

    useEffect(() => {
        function handleIframeScrobble(event: MessageEvent) {
            const data = event.data;
            if (data && data.type === 'TMSYNC_SCROBBLE_EVENT') {
                console.log('Received scrobble event from iframe:', data);

                if (
                    mediaInfo &&
                    !isScrobbled &&
                    !needsManualConfirmation &&
                    !isScrobbling
                ) {
                    console.log('Triggering scrobble from iframe event.');
                    handleScrobble();
                } else {
                    console.log('Ignoring iframe event (conditions not met).');
                }
            }
        }
        window.addEventListener('message', handleIframeScrobble);
        return () =>
            window.removeEventListener('message', handleIframeScrobble);
    }, [
        mediaInfo,
        isScrobbled,
        needsManualConfirmation,
        handleScrobble,
        isScrobbling
    ]);

    let notificationMediaInfo: ScrobbleNotificationMediaType | null = null;
    if (mediaInfo) {
        notificationMediaInfo = { ...mediaInfo };
        if (isShowMediaInfo(mediaInfo) && showEpisodeInfo) {
            notificationMediaInfo = {
                ...notificationMediaInfo,
                ...showEpisodeInfo
            };
        }
    }

    if (!isWatchPage && !isLoadingMediaInfo) {
        // Don't render anything if not on watch page (unless loading initial state)
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

            {/* --- New Prompts --- */}
            {!isLoadingMediaInfo && showStartPrompt && !userConfirmedAction && (
                <StartWatchPrompt onConfirm={handleConfirmStartWatching} />
            )}
            {!isLoadingMediaInfo &&
                showRewatchPrompt &&
                !userConfirmedAction && (
                    <RewatchPrompt onConfirm={handleConfirmRewatch} />
                )}

            {/* Show Scrobble Notification if media is confirmed AND user action confirmed (if needed) */}
            {!isLoadingMediaInfo &&
                !needsManualConfirmation &&
                notificationMediaInfo &&
                ((!showStartPrompt && !showRewatchPrompt) ||
                    userConfirmedAction) && ( // Only show if prompts not needed or action confirmed
                    <ScrobbleNotification
                        mediaInfo={notificationMediaInfo}
                        isScrobbled={isScrobbled}
                        traktHistoryId={traktHistoryIdRef.current}
                        onScrobble={handleScrobble}
                        onUndoScrobble={handleUndoScrobble}
                        isScrobbling={isScrobbling}
                        // Pass rating info down
                        ratingInfo={ratingInfo}
                        onRate={handleRateItem}
                    />
                )}
        </>
    );
};
