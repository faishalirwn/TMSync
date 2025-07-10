import React, { useState, useEffect, useRef } from 'react';
import { isShowMediaInfo, isMovieMediaInfo } from '../../../utils/typeGuards';
import { ServiceComment } from '../../../types/serviceTypes';
import { CommentableType, MediaInfoResponse } from '../../../types/media';
import { ServiceMediaRatings } from '../../../types/serviceTypes';
import { ServiceStatus } from '../../../types/serviceStatus';
import { ModalStarRating } from './rating/ModalStarRating';
import { CommentServiceBadge } from './badge/CommentServiceBadge';

interface CommentModalProps {
    isOpen: boolean;
    onClose: () => void;
    isLoading: boolean;
    comments: ServiceComment[];
    mediaInfo: MediaInfoResponse | null;
    ratings: ServiceMediaRatings | null;
    commentType: CommentableType | null;
    serviceStatuses?: ServiceStatus[]; // Services that support comments
    onPostComment: (comment: string, spoiler: boolean) => Promise<any>;
    onUpdateComment: (
        commentId: number | string,
        comment: string,
        spoiler: boolean
    ) => Promise<any>;
    onDeleteComment: (commentId: number | string) => Promise<any>;
    onRate: (type: CommentableType, rating: number) => void;
}

export const CommentModal: React.FC<CommentModalProps> = ({
    isOpen,
    onClose,
    isLoading,
    comments,
    mediaInfo,
    ratings,
    commentType,
    serviceStatuses,
    onPostComment,
    onUpdateComment,
    onDeleteComment,
    onRate
}) => {
    const [selectedCommentId, setSelectedCommentId] = useState<
        number | string | 'new'
    >('new');
    const [editorText, setEditorText] = useState('');
    const [isSpoiler, setIsSpoiler] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    // Helper functions
    const hasAniListService =
        serviceStatuses?.some(
            (s) =>
                s.serviceType === 'anilist' && s.isAuthenticated && s.isEnabled
        ) ?? false;
    const hasTraktService =
        serviceStatuses?.some(
            (s) => s.serviceType === 'trakt' && s.isAuthenticated && s.isEnabled
        ) ?? false;
    const anilistNote = comments.find((c) => c.serviceType === 'anilist');
    const hasAniListNote = !!anilistNote;

    useEffect(() => {
        if (editorText) {
            setValidationError(null);
        }
    }, [editorText]);

    useEffect(() => {
        if (isOpen) {
            if (comments.length > 0) {
                // If AniList note exists, prioritize it (since there's only one)
                const commentToSelect =
                    anilistNote ||
                    comments.sort(
                        (a, b) =>
                            new Date(b.createdAt).getTime() -
                            new Date(a.createdAt).getTime()
                    )[0];
                setSelectedCommentId(commentToSelect.id);
                setEditorText(commentToSelect.comment);
                setIsSpoiler(commentToSelect.spoiler);
            } else {
                setSelectedCommentId('new');
                setEditorText('');
                setIsSpoiler(false);
            }
        }
    }, [isOpen, comments, anilistNote]);

    const handleSelectComment = (comment: ServiceComment) => {
        setSelectedCommentId(comment.id);
        setEditorText(comment.comment);
        setIsSpoiler(comment.spoiler);
        textareaRef.current?.focus();
    };

    const handleNewComment = () => {
        setSelectedCommentId('new');
        setEditorText('');
        setIsSpoiler(false);
        textareaRef.current?.focus();
    };

    const handleSave = async () => {
        setValidationError(null);

        // Check if text is empty
        if (!editorText.trim()) {
            setValidationError('Please enter some text.');
            return;
        }

        // Only require 5 words if Trakt is included (Trakt requirement)
        const wordCount = editorText.trim().split(/\s+/).length;

        if (hasTraktService && wordCount < 5) {
            setValidationError('Trakt requires at least 5 words for comments.');
            return;
        }

        if (isSubmitting) return;
        setIsSubmitting(true);

        let response;
        if (selectedCommentId === 'new') {
            response = await onPostComment(editorText, isSpoiler);
        } else {
            response = await onUpdateComment(
                selectedCommentId,
                editorText,
                isSpoiler
            );
        }

        if (!response.success && response.error) {
            if (response.error.includes('422')) {
                setValidationError(
                    'Comment must be at least 5 words (server validation).'
                );
            } else {
                setValidationError(`Error: ${response.error}`);
            }
        }

        setIsSubmitting(false);
    };

    const handleDelete = async (commentId: number | string) => {
        if (window.confirm('Are you sure you want to delete this comment?')) {
            setIsSubmitting(true);
            await onDeleteComment(commentId);
            setIsSubmitting(false);

            if (selectedCommentId === commentId) {
                handleNewComment();
            }
        }
    };

    const getTitle = () => {
        if (!mediaInfo) return 'Comments';
        if (isMovieMediaInfo(mediaInfo)) return mediaInfo.movie.title;
        if (isShowMediaInfo(mediaInfo)) return mediaInfo.show.title;
        return 'Comments';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[1000000000] flex items-center justify-center p-4">
            <div className="bg-(--color-surface-1) text-(--color-text-primary) rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-(--color-border)">
                    <div>
                        <h2 className="text-xl font-bold">{getTitle()}</h2>
                        <p className="text-sm text-(--color-text-secondary)">
                            Review for:{' '}
                            <span className="capitalize font-semibold">
                                {commentType}
                            </span>
                            {comments.some(
                                (c) => c.serviceType === 'anilist'
                            ) && (
                                <span className="text-xs text-(--color-text-tertiary) ml-2">
                                    (AniList: show-level only)
                                </span>
                            )}
                        </p>
                        {serviceStatuses && serviceStatuses.length > 0 && (
                            <div className="mt-2">
                                <p className="text-xs text-(--color-text-secondary) mb-1">
                                    Posting to:
                                </p>
                                <div className="flex gap-3">
                                    {serviceStatuses.map((status) => (
                                        <CommentServiceBadge
                                            key={status.serviceType}
                                            serviceType={status.serviceType}
                                            isAuthenticated={
                                                status.isAuthenticated
                                            }
                                            isEnabled={status.isEnabled}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-2xl hover:text-(--color-danger) cursor-pointer"
                    >
                        ×
                    </button>
                </div>

                <div className="flex flex-grow overflow-hidden">
                    <div className="w-1/3 border-r border-(--color-border) flex flex-col">
                        <div className="p-2 border-b border-(--color-border)">
                            <button
                                onClick={handleNewComment}
                                className="w-full bg-(--color-accent-primary) hover:bg-(--color-accent-primary-hover) text-(--color-text-primary) font-bold py-2 px-4 rounded text-sm cursor-pointer"
                            >
                                +{' '}
                                {
                                    serviceStatuses &&
                                    serviceStatuses.length > 0
                                        ? hasAniListService
                                            ? hasTraktService
                                                ? hasAniListNote
                                                    ? 'Edit Note & Comment'
                                                    : 'Write Review/Note' // Both services
                                                : hasAniListNote
                                                  ? 'Edit Note'
                                                  : 'Write Note' // AniList only
                                            : 'New Comment' // Trakt only
                                        : 'New Comment' // Fallback
                                }
                            </button>
                        </div>
                        <div className="flex-grow overflow-y-auto">
                            {isLoading ? (
                                <p className="p-4 text-center">
                                    Loading comments...
                                </p>
                            ) : comments.length === 0 ? (
                                <p className="p-4 text-center text-(--color-text-secondary)">
                                    No comments found.
                                </p>
                            ) : (
                                comments.map((comment) => (
                                    <div
                                        key={comment.id}
                                        className={`p-3 border-b border-(--color-border) cursor-pointer ${selectedCommentId === comment.id ? 'bg-(--color-surface-2)' : 'hover:bg-(--color-surface-2)/50'}`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div
                                                onClick={() =>
                                                    handleSelectComment(comment)
                                                }
                                            >
                                                <div className="flex items-start gap-2">
                                                    <span className="text-xs font-medium text-(--color-text-tertiary) mt-0.5">
                                                        {comment.serviceType ===
                                                        'trakt'
                                                            ? '🔗'
                                                            : comment.serviceType ===
                                                                'anilist'
                                                              ? '📝'
                                                              : '💬'}
                                                    </span>
                                                    <p className="text-sm line-clamp-2 flex-1">
                                                        {comment.comment}
                                                    </p>
                                                </div>
                                                <p className="text-xs text-(--color-text-secondary) mt-1 ml-6">
                                                    {new Date(
                                                        comment.createdAt
                                                    ).toLocaleString()}
                                                    <span className="ml-2 capitalize">
                                                        {comment.serviceType ===
                                                        'trakt'
                                                            ? 'Trakt'
                                                            : comment.serviceType ===
                                                                'anilist'
                                                              ? 'AniList'
                                                              : comment.serviceType}
                                                    </span>
                                                </p>
                                            </div>
                                            {comment.serviceType !==
                                                'anilist' && (
                                                <button
                                                    onClick={() =>
                                                        handleDelete(comment.id)
                                                    }
                                                    disabled={isSubmitting}
                                                    className="text-(--color-text-secondary) hover:text-(--color-danger) disabled:opacity-50 text-xl ml-2"
                                                >
                                                    ×
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="w-2/3 p-4 flex flex-col">
                        <textarea
                            ref={textareaRef}
                            value={editorText}
                            onChange={(e) => setEditorText(e.target.value)}
                            placeholder={
                                hasTraktService
                                    ? hasAniListService
                                        ? 'Write your review or note here... (Trakt: min 5 words, AniList: any length)'
                                        : 'Write your review or shout here... (at least 5 words)'
                                    : 'Write your note here...'
                            }
                            className={`w-full flex-grow bg-(--color-background) border rounded-md p-3 text-base resize-none focus:outline-none focus:ring-2 ${validationError ? 'border-(--color-danger) focus:ring-(--color-danger)' : 'border-(--color-border) focus:ring-(--color-accent-primary)'}`}
                        />
                        {validationError && (
                            <p className="text-(--color-danger) text-sm mt-1">
                                {validationError}
                            </p>
                        )}
                        <div className="mt-4">
                            {/* Explanation text for multi-service posting */}
                            {serviceStatuses && serviceStatuses.length > 1 && (
                                <div className="mb-3 p-2 bg-(--color-surface-2) rounded text-xs text-(--color-text-secondary)">
                                    <p>
                                        💡 <strong>Unified posting:</strong>{' '}
                                        This will create{' '}
                                        {serviceStatuses.some(
                                            (s) => s.serviceType === 'trakt'
                                        ) && 'a Trakt comment'}
                                        {serviceStatuses.some(
                                            (s) => s.serviceType === 'trakt'
                                        ) &&
                                            serviceStatuses.some(
                                                (s) =>
                                                    s.serviceType === 'anilist'
                                            ) &&
                                            ' and '}
                                        {serviceStatuses.some(
                                            (s) => s.serviceType === 'anilist'
                                        ) && 'update your AniList note'}{' '}
                                        with the same content.
                                    </p>
                                </div>
                            )}

                            {/* Show spoiler option only when Trakt is available */}
                            {hasTraktService && (
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isSpoiler}
                                        onChange={(e) =>
                                            setIsSpoiler(e.target.checked)
                                        }
                                        className="form-checkbox h-5 w-5 bg-(--color-surface-2) border-(--color-border) text-(--color-accent-primary) focus:ring-(--color-accent-primary)"
                                    />
                                    <span className="text-sm">
                                        This comment contains spoilers{' '}
                                        {hasAniListService && (
                                            <span className="text-xs text-(--color-text-tertiary)">
                                                (Trakt only)
                                            </span>
                                        )}
                                    </span>
                                </label>
                            )}

                            {commentType && ratings && (
                                <ModalStarRating
                                    label={`${commentType.charAt(0).toUpperCase() + commentType.slice(1)} Rating`}
                                    currentRating={
                                        commentType === 'movie'
                                            ? (ratings['show']?.userRating ??
                                              null)
                                            : (ratings[
                                                  commentType as Exclude<
                                                      CommentableType,
                                                      'movie'
                                                  >
                                              ]?.userRating ?? null)
                                    }
                                    onRate={(r) => onRate(commentType, r)}
                                    isSubmitting={isSubmitting}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-(--color-border) flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-(--color-surface-3) hover:bg-(--color-surface-2) rounded font-semibold cursor-pointer"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSubmitting || !editorText.trim()}
                        className="px-4 py-2 bg-(--color-success) hover:bg-(--color-success-hover) rounded font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {isSubmitting ? 'Saving...' : 'Save Comment'}
                    </button>
                </div>
            </div>
        </div>
    );
};
