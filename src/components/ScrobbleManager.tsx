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
import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';
import { TraktShowWatchedProgress } from '../utils/types/traktApi';
import { StartWatchPrompt } from './StartWatchPrompt';
import { RewatchPrompt } from './RewatchPrompt';
import {
    getLocalRewatchInfo,
    LocalRewatchInfo,
    saveLocalRewatchInfo
} from '../utils/helpers/localRewatch';

async function getMediaInfoAndConfidence(
    siteConfig: SiteConfigBase,
    url: string,
    tabUrlIdentifier: string
): Promise<MessageResponse<MediaStatusPayload>> {
    console.log('getMediaInfoAndConfidence called for:', url);
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
            title = await siteConfig.getTitle(url).catch((e) => {
                console.warn('Optional getTitle failed:', e);
                return null;
            });
            year = await siteConfig.getYear(url).catch((e) => {
                console.warn('Optional getYear failed:', e);
                return null;
            });
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
                    'Required Title or Year not found by siteConfig for non-TMDB site.'
                );
            }
            messageParams = { type: mediaType, query: title, years: year };
        }

        console.log('Sending mediaInfo message with params:', messageParams);

        const resp = await chrome.runtime.sendMessage<
            MediaInfoRequest,
            MessageResponse<MediaStatusPayload>
        >({
            action: 'mediaInfo',
            params: messageParams
        });

        console.log('Received Background mediaInfo response:', resp);
        return resp;
    } catch (error) {
        console.error('Error in getMediaInfoAndConfidence:', error);
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
    const [isScrobbled, setIsScrobbled] = useState(false);
    const [isScrobbling, setIsScrobbling] = useState(false);
    const [needsManualConfirmation, setNeedsManualConfirmation] =
        useState(false);
    const [showStartPrompt, setShowStartPrompt] = useState(false);
    const [showRewatchPrompt, setShowRewatchPrompt] = useState(false);
    const [userConfirmedAction, setUserConfirmedAction] = useState(false);
    const [isRewatchSession, setIsRewatchSession] = useState(false);
    const [localRewatchInfo, setLocalRewatchInfo] =
        useState<LocalRewatchInfo | null>(null);

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
                setNeedsManualConfirmation(false);
                console.log('Scrobble successful, History ID:', traktHistoryId);

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

                    const updatedInfo = await getLocalRewatchInfo(
                        mediaInfo.show.ids.trakt
                    );
                    setLocalRewatchInfo(updatedInfo);
                }
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
            setIsLoadingMediaInfo(true);
            setMediaInfo(confirmedMedia);
            setNeedsManualConfirmation(false);
            setOriginalMediaQuery(null);

            setWatchStatus(null);
            setProgressInfo(null);
            setRatingInfo(null);
            setLocalRewatchInfo(null);
            setIsRewatchSession(false);
            setShowStartPrompt(false);
            setShowRewatchPrompt(false);
            setUserConfirmedAction(false);

            try {
                await chrome.runtime.sendMessage<
                    MessageRequest,
                    MessageResponse<null>
                >({
                    action: 'confirmMedia',
                    params: confirmedMedia
                });
                console.log('Confirmed media saved to background cache.');

                const currentUrl = window.location.href;
                const urlObject = new URL(currentUrl);
                const siteConfig = getCurrentSiteConfig(urlObject.hostname);
                const tabUrlIdentifier =
                    siteConfig?.getUrlIdentifier(currentUrl) ?? '';

                if (siteConfig && tabUrlIdentifier) {
                    console.log(
                        'Fetching status details after manual confirmation...'
                    );

                    const statusResponse = await chrome.runtime.sendMessage<
                        MediaInfoRequest,
                        MessageResponse<MediaStatusPayload>
                    >({
                        action: 'mediaInfo',

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
                        await processMediaStatus(statusResponse.data);
                    } else {
                        console.error(
                            'Failed to fetch status details after confirmation:',
                            statusResponse.error
                        );
                    }
                }
            } catch (error) {
                console.error('Failed during confirmMedia processing:', error);

                setMediaInfo(null);
                setNeedsManualConfirmation(true);
            } finally {
                setIsLoadingMediaInfo(false);
            }
        },
        [siteConfig]
    );

    const handleCancelManualSearch = useCallback(() => {
        setNeedsManualConfirmation(false);
        setOriginalMediaQuery(null);
        console.log('Manual identification cancelled.');
    }, []);

    const handleConfirmStartWatching = useCallback(() => {
        console.log('User confirmed Start Watching.');
        setUserConfirmedAction(true);
        setShowStartPrompt(false);
    }, []);

    const handleConfirmRewatch = useCallback(() => {
        console.log('User confirmed Rewatch.');
        setUserConfirmedAction(true);
        setIsRewatchSession(true);
        setShowRewatchPrompt(false);
    }, []);

    const handleRateItem = useCallback(
        async (rating: number) => {
            if (!mediaInfo || rating < 1 || rating > 10) {
                console.warn(
                    'Cannot rate: Missing media info or invalid rating.'
                );
                return;
            }
            console.log(`Submitting rating: ${rating}`);

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

                    setRatingInfo((prev) => ({
                        ...prev,
                        userRating: rating,
                        ratedAt: new Date().toISOString()
                    }));
                } else {
                    console.error('Failed to submit rating:', response.error);
                }
            } catch (error) {
                console.error('Error sending rating message:', error);
            }
        },
        [mediaInfo]
    );

    const processMediaStatus = useCallback(
        async (data: MediaStatusPayload) => {
            setWatchStatus(
                data.watchStatus || { isInHistory: false, isCompleted: false }
            );
            setProgressInfo(data.progressInfo || null);
            setRatingInfo(data.ratingInfo || null);

            setShowStartPrompt(false);
            setShowRewatchPrompt(false);
            setUserConfirmedAction(false);
            setIsRewatchSession(false);
            setLocalRewatchInfo(null);

            const currentEpisode =
                siteConfig?.getSeasonEpisodeObj(currentUrl) || null;

            if (isShowMediaInfo(data.mediaInfo)) {
                const traktShowId = data.mediaInfo.show.ids.trakt;
                const traktProgress = data.progressInfo;
                const watchHistory = data.watchStatus;

                if (!watchHistory?.isInHistory) {
                    console.log('State: First ever watch detected.');
                    setShowStartPrompt(true);
                } else {
                    const isTraktProgressComplete =
                        !!traktProgress &&
                        traktProgress.aired > 0 &&
                        traktProgress.aired === traktProgress.completed;

                    if (!isTraktProgressComplete) {
                        console.log('State: First watch in progress.');

                        const episodeProgress = traktProgress?.seasons
                            ?.find((s) => s.number === currentEpisode?.season)
                            ?.episodes?.find(
                                (e) => e.number === currentEpisode?.number
                            );

                        if (episodeProgress?.completed && currentEpisode) {
                            console.log(
                                `State: First watch, but EPISODE S${currentEpisode.season}E${currentEpisode.number} already watched. Prompting rewatch (of episode).`
                            );

                            setShowRewatchPrompt(true);

                            const localInfo =
                                await getLocalRewatchInfo(traktShowId);
                            setLocalRewatchInfo(localInfo);
                        } else {
                            console.log(
                                'State: First watch, new episode. No prompt needed immediately.'
                            );
                            setUserConfirmedAction(true);
                            setIsRewatchSession(false);
                        }
                    } else {
                        console.log(
                            'State: Trakt progress complete. Entering Rewatch logic.'
                        );
                        const localInfo =
                            await getLocalRewatchInfo(traktShowId);
                        setLocalRewatchInfo(localInfo);

                        const nextExpected = localInfo?.nextExpected;
                        const isWatchingNextLocally =
                            !!currentEpisode &&
                            !!nextExpected &&
                            currentEpisode.season === nextExpected.season &&
                            currentEpisode.number === nextExpected.number;

                        if (isWatchingNextLocally) {
                            console.log(
                                'State: Rewatch - watching the expected next episode locally. Skipping prompt.'
                            );
                            setUserConfirmedAction(true);
                            setIsRewatchSession(true);
                            setShowRewatchPrompt(false);
                        } else {
                            console.log(
                                'State: Rewatch - not the next expected episode locally. Prompting.'
                            );
                            setShowRewatchPrompt(true);
                        }
                    }
                }
            } else if (isMovieMediaInfo(data.mediaInfo)) {
                if (!data.watchStatus?.isInHistory) {
                    console.log('State: Movie - First watch.');
                    setShowStartPrompt(true);
                } else {
                    console.log(
                        'State: Movie - Already watched. Prompting rewatch.'
                    );
                    setShowRewatchPrompt(true);

                    setLocalRewatchInfo(null);
                }
            }
        },
        [currentUrl, siteConfig]
    );

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
        previousUrlRef.current = currentUrl;

        if (!isWatchPage) {
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
            setLocalRewatchInfo(null);
            traktHistoryIdRef.current = null;
            undoPressed.current = false;
            lastFetchedTitleRef.current = null;
            return;
        }

        setIsLoadingMediaInfo(true);

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
        setLocalRewatchInfo(null);
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

                    if (isShowMediaInfo(fetchedMediaInfo)) {
                        setShowEpisodeInfo(
                            siteConfig.getSeasonEpisodeObj(currentUrl) || null
                        );
                    } else {
                        setShowEpisodeInfo(null);
                    }

                    await processMediaStatus(response.data);
                } else {
                    setMediaInfo(null);
                    setNeedsManualConfirmation(true);
                    setOriginalMediaQuery(originalQuery);

                    setWatchStatus(null);
                    setProgressInfo(null);
                    setRatingInfo(null);
                    setShowStartPrompt(false);
                    setShowRewatchPrompt(false);
                    setUserConfirmedAction(false);
                    setIsRewatchSession(false);
                    setLocalRewatchInfo(null);
                }
            } else {
                console.error('Failed to get media info:', response.error);

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
                setLocalRewatchInfo(null);
            }
            lastFetchedTitleRef.current = document.title;
            setIsLoadingMediaInfo(false);
        };

        if (hostname === 'www.cineby.app') {
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
            fetchAndProcess();
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

            {!isLoadingMediaInfo && showStartPrompt && !userConfirmedAction && (
                <StartWatchPrompt onConfirm={handleConfirmStartWatching} />
            )}
            {!isLoadingMediaInfo &&
                showRewatchPrompt &&
                !userConfirmedAction && (
                    <RewatchPrompt onConfirm={handleConfirmRewatch} />
                )}

            {!isLoadingMediaInfo &&
                !needsManualConfirmation &&
                notificationMediaInfo &&
                ((!showStartPrompt && !showRewatchPrompt) ||
                    userConfirmedAction) && (
                    <ScrobbleNotification
                        mediaInfo={notificationMediaInfo}
                        isScrobbled={isScrobbled}
                        traktHistoryId={traktHistoryIdRef.current}
                        onScrobble={handleScrobble}
                        onUndoScrobble={handleUndoScrobble}
                        isScrobbling={isScrobbling}
                        ratingInfo={ratingInfo}
                        onRate={handleRateItem}
                    />
                )}
        </>
    );
};
