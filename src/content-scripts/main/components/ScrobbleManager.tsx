import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useMediaLifecycle } from '../../../hooks/useMediaLifecycle';
import { useScrobbling } from '../../../hooks/useScrobbling';
import { useServiceStatus } from '../../../hooks/useServiceStatus';
import { ScrobbleNotification } from './ScrobbleNotification';
import { ManualSearchPrompt } from './ManualSearchPrompt';
import { LoadingIndicator } from './LoadingIndicator';
import { CommentModal } from './CommentModal';
import { isShowMediaInfo } from '../../../utils/typeGuards';
import {
    clearHighlighting,
    setupEpisodeHighlighting
} from '../../../utils/highlighting';
import { ScrobbleNotificationMediaType } from '../../../types/scrobbling';

export const ScrobbleManager = () => {
    const {
        mediaInfo,
        episodeInfo,
        originalQuery,
        ratings,
        uiState,
        userConfirmedAction,
        isRewatchSession,
        siteConfig,
        highlightTarget,
        watchedHistoryEpisodes,
        confirmManualSelection,
        cancelManualSearch,
        handleRate,
        handleUnrate,
        refetch,
        isCommentModalOpen,
        isLoadingComments,
        commentModalType,
        comments,
        openCommentModal,
        closeCommentModal,
        postComment,
        updateComment,
        deleteComment
    } = useMediaLifecycle();

    const { serviceStatuses } = useServiceStatus();

    // Global scrobbling toggle state (session-only)
    const [globalScrobblingEnabled, setGlobalScrobblingEnabled] =
        useState<boolean>(true);

    // Filter service statuses to only include those that support comments
    const commentServiceStatuses = useMemo(
        () =>
            serviceStatuses.filter(
                (status) =>
                    status.serviceType === 'trakt' ||
                    status.serviceType === 'anilist'
            ),
        [serviceStatuses]
    );

    const {
        status,
        isProcessing,
        historyId,
        serviceHistoryIds,
        isScrobbled,
        hasEverBeenScrobbled,
        manualScrobble,
        undoScrobble,
        pauseScrobbling
    } = useScrobbling(
        mediaInfo,
        episodeInfo,
        userConfirmedAction,
        isRewatchSession,
        globalScrobblingEnabled
    );

    // Handle global scrobbling toggle changes
    const handleGlobalScrobblingToggle = useCallback(
        async (enabled: boolean) => {
            setGlobalScrobblingEnabled(enabled);

            // If disabling and currently scrobbling, pause the active scrobble
            if (!enabled && status === 'started') {
                await pauseScrobbling();
            }
        },
        [status, pauseScrobbling]
    );

    useEffect(() => {
        if (!siteConfig || !siteConfig.highlighting) {
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
    }, [siteConfig, highlightTarget, watchedHistoryEpisodes]);

    const notificationMediaInfo: ScrobbleNotificationMediaType | null =
        useMemo(() => {
            if (!mediaInfo) return null;
            return {
                ...mediaInfo,
                ...(isShowMediaInfo(mediaInfo) && episodeInfo
                    ? episodeInfo
                    : {})
            };
        }, [mediaInfo, episodeInfo]);

    const hasHistoryEntries =
        !!historyId || Object.keys(serviceHistoryIds).length > 0;

    const handleUndo = async () => {
        const success = await undoScrobble();
        if (success) refetch();
    };

    if (uiState === 'loading') {
        return <LoadingIndicator text="Finding media..." />;
    }

    if (uiState === 'needs_manual_confirmation' && originalQuery) {
        return (
            <ManualSearchPrompt
                originalQuery={originalQuery}
                onConfirmMedia={confirmManualSelection}
                onCancel={cancelManualSearch}
            />
        );
    }

    const showScrobbleUI =
        mediaInfo && (userConfirmedAction || hasHistoryEntries);

    return (
        <>
            {showScrobbleUI && notificationMediaInfo && (
                <ScrobbleNotification
                    mediaInfo={notificationMediaInfo}
                    hasHistoryEntries={hasHistoryEntries}
                    isScrobbled={isScrobbled}
                    hasEverBeenScrobbled={hasEverBeenScrobbled}
                    traktHistoryId={historyId}
                    serviceHistoryIds={serviceHistoryIds}
                    liveScrobbleStatus={status}
                    onManualScrobble={manualScrobble}
                    onUndoScrobble={handleUndo}
                    isProcessingAction={isProcessing}
                    ratings={ratings}
                    onRate={handleRate}
                    onUnrate={handleUnrate}
                    onOpenCommentModal={openCommentModal}
                    globalScrobblingEnabled={globalScrobblingEnabled}
                    onGlobalScrobblingToggle={handleGlobalScrobblingToggle}
                />
            )}

            <CommentModal
                isOpen={isCommentModalOpen}
                onClose={closeCommentModal}
                isLoading={isLoadingComments}
                comments={comments}
                mediaInfo={mediaInfo}
                ratings={ratings}
                commentType={commentModalType}
                serviceStatuses={commentServiceStatuses}
                onPostComment={postComment}
                onUpdateComment={updateComment}
                onDeleteComment={deleteComment}
                onRate={handleRate}
            />
        </>
    );
};
