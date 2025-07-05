import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getLocalRewatchInfo } from '../utils/helpers/localRewatch';
import { SiteConfigBase } from '../utils/siteConfigs/baseConfig';
import { getCurrentSiteConfig } from '../utils/siteConfigs';
import { HighlightType } from '../utils/highlighting';
import {
    MediaInfoResponse,
    MediaRatings,
    SeasonEpisodeObj,
    CommentableType
} from '../types/media';
import { TraktComment, TraktShowWatchedProgress } from '../types/trakt';
import {
    ServiceComment,
    ServiceProgressInfo,
    ServiceMediaRatings
} from '../types/serviceTypes';
import {
    MessageRequest,
    MessageResponse,
    MediaStatusPayload
} from '../types/messaging';
import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';

export type UIState =
    | 'loading'
    | 'idle'
    | 'needs_manual_confirmation'
    | 'prompt_start'
    | 'prompt_rewatch'
    | 'scrobbling_ready';

async function getMediaInfoAndConfidence(
    siteConfig: SiteConfigBase,
    url: string
): Promise<MessageResponse<MediaStatusPayload>> {
    const mediaType = siteConfig.getMediaType(url);
    if (!mediaType) {
        return {
            success: false,
            error: 'Failed to determine media type from URL.'
        };
    }
    const title = await siteConfig.getTitle(url).catch(() => null);
    const year = await siteConfig.getYear(url).catch(() => null);

    const messageParams: { type: string; query: string; years: string } = {
        type: mediaType,
        query: title || '',
        years: year || ''
    };

    return await chrome.runtime.sendMessage({
        action: 'mediaInfo',
        params: messageParams
    });
}

export function useMediaLifecycle() {
    // Core Media State
    const [mediaInfo, setMediaInfo] = useState<MediaInfoResponse | null>(null);
    const [episodeInfo, setEpisodeInfo] = useState<SeasonEpisodeObj | null>(
        null
    );
    const [originalQuery, setOriginalQuery] = useState<{
        type: string;
        query: string;
        years: string;
    } | null>(null);

    // Associated Trakt Data State
    const [ratings, setRatings] = useState<ServiceMediaRatings | null>(null);
    const [progressInfo, setProgressInfo] =
        useState<ServiceProgressInfo | null>(null);
    const [highlightTarget, setHighlightTarget] = useState<{
        season: number;
        episode: number;
        type: HighlightType;
    } | null>(null);
    const [watchedHistoryEpisodes, setWatchedHistoryEpisodes] = useState<
        { season: number; number: number }[]
    >([]);

    // UI and Interaction State
    const [uiState, setUiState] = useState<UIState>('loading');
    const [isRewatchSession, setIsRewatchSession] = useState(false);
    const [userConfirmedAction, setUserConfirmedAction] = useState(false);

    // URL and Config State
    const [currentUrl, setCurrentUrl] = useState(window.location.href);
    const previousUrlRef = useRef<string | null>(null);
    const siteConfig = useMemo(
        () => getCurrentSiteConfig(new URL(currentUrl).hostname),
        [currentUrl]
    );

    // Comments State
    const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
    const [commentModalType, setCommentModalType] =
        useState<CommentableType | null>(null);
    const [comments, setComments] = useState<ServiceComment[]>([]);
    const [isLoadingComments, setIsLoadingComments] = useState(false);

    const sendMessage = useCallback(
        async <TResponseData = any>(
            message: MessageRequest
        ): Promise<MessageResponse<TResponseData>> => {
            return await chrome.runtime.sendMessage(message);
        },
        []
    );

    const resetState = useCallback(() => {
        setMediaInfo(null);
        setEpisodeInfo(null);
        setOriginalQuery(null);
        setRatings(null);
        setProgressInfo(null);
        setHighlightTarget(null);
        setWatchedHistoryEpisodes([]);
        setUiState('loading');
        setIsRewatchSession(false);
        setUserConfirmedAction(false);
    }, []);

    const processMediaStatus = useCallback(
        async (
            data: MediaStatusPayload,
            currentEpisodeInfo: SeasonEpisodeObj | null
        ) => {
            setRatings(data.ratingInfo || null);
            setProgressInfo(data.progressInfo || null);

            let newHighlight: {
                season: number;
                episode: number;
                type: HighlightType;
            } | null = null;
            let watchedEps: { season: number; number: number }[] = [];

            if (isShowMediaInfo(data.mediaInfo)) {
                const traktProgress = data.progressInfo;
                if (traktProgress?.seasons) {
                    watchedEps = traktProgress.seasons.flatMap((s) =>
                        s.episodes
                            .filter((e) => e.completed)
                            .map((e) => ({
                                season: s.number,
                                number: e.number
                            }))
                    );
                }

                const isShowCompleted = traktProgress
                    ? traktProgress.completed >= traktProgress.aired
                    : false;

                // Scenario 1: Show is fully watched, so this is definitely a rewatch.
                if (isShowCompleted) {
                    setUiState('prompt_rewatch');
                    const localInfo = await getLocalRewatchInfo(
                        data.mediaInfo.show.ids.trakt
                    );
                    if (localInfo?.lastWatched) {
                        newHighlight = {
                            season: localInfo.lastWatched.season,
                            episode: localInfo.lastWatched.number,
                            type: 'rewatch_last'
                        };
                    }
                }
                // Scenario 2: Show is in progress.
                else if (data.watchStatus?.isInHistory && traktProgress) {
                    const isCurrentEpisodeWatched = watchedEps.some(
                        (ep) =>
                            ep.season === currentEpisodeInfo?.season &&
                            ep.number === currentEpisodeInfo?.number
                    );

                    if (isCurrentEpisodeWatched) {
                        // Viewing an already-watched episode within an unfinished show.
                        setUiState('prompt_rewatch');
                    } else {
                        // Viewing the next unwatched episode. No prompt needed.
                        setUiState('scrobbling_ready');
                        setUserConfirmedAction(true);
                    }

                    if (traktProgress.lastEpisode) {
                        newHighlight = {
                            season: traktProgress.lastEpisode.season,
                            episode: traktProgress.lastEpisode.number,
                            type: 'first_watch_last'
                        };
                    }
                }
                // Scenario 3: Brand new show (no history, 0 completed).
                else {
                    setUiState('prompt_start');
                }
            } else if (isMovieMediaInfo(data.mediaInfo)) {
                if (data.watchStatus?.isInHistory) {
                    setUiState('prompt_rewatch');
                } else {
                    setUiState('prompt_start');
                }
            }

            setHighlightTarget(newHighlight);
            setWatchedHistoryEpisodes(watchedEps);
        },
        []
    );

    const fetchAndProcessMedia = useCallback(async () => {
        resetState();
        if (!siteConfig || !siteConfig.isWatchPage(currentUrl)) {
            setUiState('idle');
            return;
        }

        const response = await getMediaInfoAndConfidence(
            siteConfig,
            currentUrl
        );

        if (response.success && response.data) {
            const {
                mediaInfo: mi,
                confidence,
                originalQuery: oq
            } = response.data;
            setMediaInfo(mi);
            setOriginalQuery(oq);

            if (confidence === 'high' && mi) {
                const currentEpisodeInfo =
                    siteConfig.getSeasonEpisodeObj(currentUrl) || null;
                setEpisodeInfo(currentEpisodeInfo);
                await processMediaStatus(response.data, currentEpisodeInfo);
            } else {
                setUiState('needs_manual_confirmation');
            }
        } else {
            setUiState('idle');
        }
    }, [currentUrl, siteConfig, resetState, processMediaStatus]);

    useEffect(() => {
        const interval = setInterval(() => {
            const href = window.location.href;
            if (href !== currentUrl) {
                previousUrlRef.current = currentUrl;
                setCurrentUrl(href);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [currentUrl]);

    useEffect(() => {
        fetchAndProcessMedia();
    }, [fetchAndProcessMedia]);

    const confirmManualSelection = useCallback(
        async (confirmedMedia: MediaInfoResponse) => {
            setUiState('loading');
            await sendMessage({
                action: 'confirmMedia',
                params: confirmedMedia
            });
            await fetchAndProcessMedia();
        },
        [sendMessage, fetchAndProcessMedia]
    );

    const confirmStart = useCallback(() => {
        setUserConfirmedAction(true);
        setUiState('scrobbling_ready');
    }, []);

    const confirmRewatch = useCallback(() => {
        setUserConfirmedAction(true);
        setIsRewatchSession(true);
        setUiState('scrobbling_ready');
    }, []);

    const cancelManualSearch = useCallback(() => {
        setUiState('idle');
        setOriginalQuery(null);
    }, []);

    const handleRate = useCallback(
        async (type: CommentableType, rating: number) => {
            if (!mediaInfo) return;
            const action =
                type === 'movie'
                    ? 'rateMovie'
                    : type === 'show'
                      ? 'rateShow'
                      : type === 'season'
                        ? 'rateSeason'
                        : 'rateEpisode';
            const params: any = { mediaInfo, rating };
            if (['season', 'episode'].includes(type) && episodeInfo) {
                params.episodeInfo = episodeInfo;
            }
            const response = await sendMessage({ action, params });
            if (response.success) {
                setRatings((prev) => ({
                    ...prev,
                    [type === 'movie' ? 'show' : type]: {
                        userRating: rating,
                        ratedAt: new Date().toISOString()
                    }
                }));
            }
        },
        [mediaInfo, episodeInfo, sendMessage]
    );

    const openCommentModal = useCallback(
        async (type: CommentableType) => {
            if (!mediaInfo) return;
            setIsCommentModalOpen(true);
            setCommentModalType(type);
            setIsLoadingComments(true);
            setComments([]);
            const response = await sendMessage<ServiceComment[]>({
                action: 'getComments',
                params: {
                    type,
                    mediaInfo,
                    episodeInfo: episodeInfo || undefined
                }
            });
            if (response.success && response.data) setComments(response.data);
            setIsLoadingComments(false);
        },
        [mediaInfo, episodeInfo, sendMessage]
    );

    const closeCommentModal = useCallback(
        () => setIsCommentModalOpen(false),
        []
    );

    const postComment = useCallback(
        async (comment: string, spoiler: boolean) => {
            if (!mediaInfo || !commentModalType) return { success: false };
            const response = await sendMessage<ServiceComment>({
                action: 'postComment',
                params: {
                    type: commentModalType,
                    mediaInfo,
                    episodeInfo: episodeInfo || undefined,
                    comment,
                    spoiler
                }
            });
            if (response.success && response.data)
                setComments((p) => [response.data!, ...p]);
            return response;
        },
        [mediaInfo, episodeInfo, commentModalType, sendMessage]
    );

    const updateComment = useCallback(
        async (
            commentId: number | string,
            comment: string,
            spoiler: boolean
        ) => {
            const response = await sendMessage<ServiceComment>({
                action: 'updateComment',
                params: { commentId, comment, spoiler }
            });
            if (response.success && response.data)
                setComments((p) =>
                    p.map((c) => (c.id === commentId ? response.data! : c))
                );
            return response;
        },
        [sendMessage]
    );

    const deleteComment = useCallback(
        async (commentId: number | string) => {
            const response = await sendMessage({
                action: 'deleteComment',
                params: { commentId }
            });
            if (response.success)
                setComments((p) => p.filter((c) => c.id !== commentId));
            return response;
        },
        [sendMessage]
    );

    return {
        mediaInfo,
        episodeInfo,
        originalQuery,
        ratings,
        progressInfo,
        highlightTarget,
        watchedHistoryEpisodes,
        uiState,
        userConfirmedAction,
        isRewatchSession,
        siteConfig,
        confirmManualSelection,
        confirmStart,
        confirmRewatch,
        cancelManualSearch,
        handleRate,
        refetch: fetchAndProcessMedia,
        isCommentModalOpen,
        isLoadingComments,
        commentModalType,
        comments,
        openCommentModal,
        closeCommentModal,
        postComment,
        updateComment,
        deleteComment
    };
}
