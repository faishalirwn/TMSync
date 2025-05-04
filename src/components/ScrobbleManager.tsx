import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentSiteConfig } from '../utils/siteConfigs';
import { SiteConfigBase } from '../utils/siteConfigs/baseConfig';
import {
    MediaInfoActionResult,
    MediaInfoRequest,
    MediaInfoResponse,
    MessageRequest,
    MessageResponse,
    ScrobbleNotificationMediaType,
    ScrobbleRequest,
    ScrobbleResponse,
    SeasonEpisodeObj,
    UndoScrobbleRequest
} from '../utils/types';
import { ScrobbleNotification } from './ScrobbleNotification';
import { ManualSearchPrompt } from './ManualSearchPrompt';
import { LoadingIndicator } from './LoadingIndicator';
import { isShowMediaInfo } from '../utils/typeGuards';

async function getMediaInfoAndConfidence(
    siteConfig: SiteConfigBase,
    url: string,
    tabUrlIdentifier: string
): Promise<MessageResponse<MediaInfoActionResult>> {
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
            MessageResponse<MediaInfoActionResult>
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
    const [mediaInfo, setMediaInfo] = useState<MediaInfoResponse | null>(null);
    const [isScrobbled, setIsScrobbled] = useState(false);
    const [needsManualConfirmation, setNeedsManualConfirmation] =
        useState(false);
    const [originalMediaQuery, setOriginalMediaQuery] = useState<{
        type: string;
        query: string;
        years: string;
    } | null>(null);
    const [showEpisodeInfo, setShowEpisodeInfo] =
        useState<SeasonEpisodeObj | null>(null);
    const [currentUrl, setCurrentUrl] = useState(window.location.href);

    const [isLoadingMediaInfo, setIsLoadingMediaInfo] = useState(false);
    const [isScrobbling, setIsScrobbling] = useState(false);

    const traktHistoryIdRef = useRef<number | null>(null);
    const previousUrlRef = useRef<string | null>(null);
    const waitTitleIntervalRef = useRef<number | null>(null);
    const waitTitleTimeoutRef = useRef<number | null>(null);
    const lastFetchedTitleRef = useRef<string | null>(null);
    const undoPressed = useRef(false);

    const url = window.location.href;
    const urlObject = new URL(currentUrl);
    const hostname = urlObject.hostname;
    const siteConfig = getCurrentSiteConfig(hostname);
    const isWatchPage = siteConfig?.isWatchPage(currentUrl) ?? false;
    const tabUrlIdentifier = siteConfig?.getUrlIdentifier(currentUrl) ?? '';

    const handleScrobble = useCallback(async () => {
        if (!mediaInfo || !tabUrlIdentifier || isScrobbling) {
            console.warn(
                'Scrobble prevented: Missing info or already scrobbling.'
            );
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
    }, [mediaInfo, tabUrlIdentifier, isScrobbling]);

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

            if (isShowMediaInfo(confirmedMedia)) {
                const epInfo = siteConfig?.getSeasonEpisodeObj(currentUrl);
                setShowEpisodeInfo(epInfo || null);
            } else {
                setShowEpisodeInfo(null);
            }

            try {
                await chrome.runtime.sendMessage<
                    MessageRequest,
                    MessageResponse<null>
                >({
                    action: 'confirmMedia',
                    params: confirmedMedia
                });
                console.log('Confirmed media saved to background cache.');
            } catch (error) {
                console.error(
                    'Failed to send media confirmation to background:',
                    error
                );

                setMediaInfo(null);
                setNeedsManualConfirmation(true);
            } finally {
                setIsLoadingMediaInfo(false);
            }
        },
        [siteConfig, currentUrl]
    );

    const handleCancelManualSearch = useCallback(() => {
        setNeedsManualConfirmation(false);
        setOriginalMediaQuery(null);
        console.log('Manual identification cancelled.');
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
        const isNavigation = currentUrl !== previousUrl && previousUrl !== null;

        if (!isWatchPage) {
            console.log('Not on a watch page, resetting state.');

            setMediaInfo(null);
            setIsScrobbled(false);
            setNeedsManualConfirmation(false);
            setOriginalMediaQuery(null);
            setShowEpisodeInfo(null);
            setIsLoadingMediaInfo(false);
            setIsScrobbling(false);
            traktHistoryIdRef.current = null;
            undoPressed.current = false;
            lastFetchedTitleRef.current = null;
            return;
        }

        console.log('On watch page, initiating fetch process.');
        setIsLoadingMediaInfo(true);
        setMediaInfo(null);
        setIsScrobbled(false);
        setNeedsManualConfirmation(false);
        setOriginalMediaQuery(null);
        setShowEpisodeInfo(null);
        traktHistoryIdRef.current = null;
        undoPressed.current = false;

        const fetchAndSetMediaInfo = async () => {
            if (!siteConfig || !tabUrlIdentifier) {
                console.error(
                    'Fetch aborted: siteConfig or tabUrlIdentifier missing.'
                );
                setIsLoadingMediaInfo(false);
                return;
            }
            console.log('Executing getMediaInfoAndConfidence...');

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
                    originalQuery
                } = response.data;
                if (isShowMediaInfo(fetchedMediaInfo)) {
                    setShowEpisodeInfo(
                        siteConfig.getSeasonEpisodeObj(currentUrl) || null
                    );
                } else {
                    setShowEpisodeInfo(null);
                }
                if (confidence === 'high' && fetchedMediaInfo) {
                    setMediaInfo(fetchedMediaInfo);
                    setNeedsManualConfirmation(false);
                    setOriginalMediaQuery(null);
                } else {
                    setMediaInfo(null);
                    setNeedsManualConfirmation(true);
                    setOriginalMediaQuery(originalQuery);
                }
            } else {
                console.error('Failed to get media info:', response);
                setMediaInfo(null);
                setNeedsManualConfirmation(false);
                setOriginalMediaQuery(null);
            }

            lastFetchedTitleRef.current = document.title;
            setIsLoadingMediaInfo(false);
        };

        if (hostname === 'www.cineby.app') {
            const currentTitle = document.title;
            const previousFetchedTitle = lastFetchedTitleRef.current;
            const isTitleStale =
                isNavigation &&
                currentTitle === previousFetchedTitle &&
                currentTitle !== 'Cineby';
            const isTitleGeneric = currentTitle === 'Cineby';
            const needsToWait = isTitleGeneric || isTitleStale;

            console.log(
                `Cineby Check: current='${currentTitle}', lastFetched='${previousFetchedTitle}', isNavigation=${isNavigation}, isStale=${isTitleStale}, isGeneric=${isTitleGeneric}, needsWait=${needsToWait}`
            );

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
                        fetchAndSetMediaInfo();
                    }
                }, 500);

                waitTitleTimeoutRef.current = window.setTimeout(() => {
                    console.warn(`Cineby: Timeout waiting for title update.`);
                    clearWaitTitleTimers();
                    console.log('Cineby: Fetching after timeout.');
                    fetchAndSetMediaInfo();
                }, 5000);
            } else {
                console.log(
                    `Cineby: Title '${currentTitle}' looks ready. Fetching immediately.`
                );

                fetchAndSetMediaInfo();
            }
        } else {
            console.log(`Hostname ${hostname}: Fetching immediately.`);
            fetchAndSetMediaInfo();
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

    if (!isWatchPage) {
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

            {!isLoadingMediaInfo &&
                !needsManualConfirmation &&
                notificationMediaInfo && (
                    <ScrobbleNotification
                        mediaInfo={notificationMediaInfo}
                        isScrobbled={isScrobbled}
                        traktHistoryId={traktHistoryIdRef.current}
                        onScrobble={handleScrobble}
                        onUndoScrobble={handleUndoScrobble}
                        isScrobbling={isScrobbling}
                    />
                )}
        </>
    );
};
