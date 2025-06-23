import React, { useEffect, useMemo } from 'react';
import { useMediaLifecycle } from '../../../hooks/useMediaLifecycle';
import { useScrobbling } from '../../../hooks/useScrobbling';

import { ScrobbleNotification } from './ScrobbleNotification';
import { ManualSearchPrompt } from './ManualSearchPrompt';
import { LoadingIndicator } from './LoadingIndicator';
import { StartWatchPrompt } from './StartWatchPrompt';
import { RewatchPrompt } from './RewatchPrompt';
import { CommentModal } from './CommentModal';
import { ScrobbleNotificationMediaType } from '../../../utils/types';
import { isShowMediaInfo } from '../../../utils/typeGuards';
import {
    clearHighlighting,
    setupEpisodeHighlighting
} from '../../../utils/highlighting';

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
        confirmStart,
        confirmRewatch,
        cancelManualSearch,
        handleRate,
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

    const { status, isProcessing, historyId, manualScrobble, undoScrobble } =
        useScrobbling(
            mediaInfo,
            episodeInfo,
            userConfirmedAction,
            isRewatchSession
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

    const isEffectivelyScrobbled = !!historyId;

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
        mediaInfo && (userConfirmedAction || isEffectivelyScrobbled);

    return (
        <>
            {uiState === 'prompt_start' && (
                <StartWatchPrompt onConfirm={confirmStart} />
            )}
            {uiState === 'prompt_rewatch' && (
                <RewatchPrompt onConfirm={confirmRewatch} />
            )}

            {showScrobbleUI && notificationMediaInfo && (
                <ScrobbleNotification
                    mediaInfo={notificationMediaInfo}
                    isEffectivelyScrobbled={isEffectivelyScrobbled}
                    traktHistoryId={historyId}
                    liveScrobbleStatus={status}
                    onManualScrobble={manualScrobble}
                    onUndoScrobble={handleUndo}
                    isProcessingAction={isProcessing}
                    ratings={ratings}
                    onRate={handleRate}
                    onOpenCommentModal={openCommentModal}
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
                onPostComment={postComment}
                onUpdateComment={updateComment}
                onDeleteComment={deleteComment}
                onRate={handleRate}
            />
        </>
    );
};
