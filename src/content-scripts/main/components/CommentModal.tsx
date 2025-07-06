import React, { useState, useEffect, useRef } from 'react';
import { isShowMediaInfo, isMovieMediaInfo } from '../../../utils/typeGuards';
import { ServiceComment } from '../../../types/serviceTypes';
import {
    CommentableType,
    MediaInfoResponse,
    MediaRatings
} from '../../../types/media';
import { ServiceMediaRatings } from '../../../types/serviceTypes';

const ModalHalfStar: React.FC<{
    rating: number;
    currentValue: number;
    onLeftClick: () => void;
    onRightClick: () => void;
    onLeftHover: () => void;
    onRightHover: () => void;
    onMouseLeave: () => void;
    readOnly?: boolean;
}> = ({
    rating,
    currentValue,
    onLeftClick,
    onRightClick,
    onLeftHover,
    onRightHover,
    onMouseLeave,
    readOnly
}) => {
    const leftHalf = currentValue >= rating - 0.5;
    const rightHalf = currentValue >= rating;

    return (
        <div
            className="relative w-5 h-5 cursor-pointer"
            onMouseLeave={readOnly ? undefined : onMouseLeave}
        >
            <svg
                className="absolute inset-0 w-5 h-5 text-(--color-star-empty)"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>

            {/* Left half overlay */}
            {leftHalf && (
                <svg
                    className="absolute inset-0 w-5 h-5 text-(--color-star-filled)"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    style={{ clipPath: 'inset(0 50% 0 0)' }}
                >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            )}

            {/* Right half overlay */}
            {rightHalf && (
                <svg
                    className="absolute inset-0 w-5 h-5 text-(--color-star-filled)"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    style={{ clipPath: 'inset(0 0 0 50%)' }}
                >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            )}

            {/* Invisible click areas */}
            {!readOnly && (
                <>
                    <div
                        className="absolute inset-0 w-1/2 h-full cursor-pointer"
                        onClick={onLeftClick}
                        onMouseEnter={onLeftHover}
                    />
                    <div
                        className="absolute inset-y-0 right-0 w-1/2 h-full cursor-pointer"
                        onClick={onRightClick}
                        onMouseEnter={onRightHover}
                    />
                </>
            )}
        </div>
    );
};

const ModalStarRating: React.FC<{
    label: string;
    currentRating: number | null;
    onRate: (r: number) => void;
    isSubmitting: boolean;
}> = ({ label, currentRating, onRate, isSubmitting }) => {
    const [hover, setHover] = useState(0);

    const displayRating = hover || currentRating || 0;
    const currentHasDecimal =
        currentRating !== null && currentRating !== Math.round(currentRating);

    return (
        <div className="mt-2">
            <p className="text-xs text-(--color-text-secondary)">{label}</p>
            <div
                className="flex items-center space-x-1"
                onMouseLeave={() => setHover(0)}
            >
                {[...Array(10)].map((_, i) => {
                    const starNumber = i + 1;
                    return (
                        <ModalHalfStar
                            key={starNumber}
                            rating={starNumber}
                            currentValue={displayRating}
                            onLeftClick={() => onRate(starNumber - 0.5)}
                            onRightClick={() => onRate(starNumber)}
                            onLeftHover={() => setHover(starNumber - 0.5)}
                            onRightHover={() => setHover(starNumber)}
                            onMouseLeave={() => {}}
                            readOnly={isSubmitting}
                        />
                    );
                })}
            </div>

            {/* Rating display and service info */}
            <div className="flex items-center justify-center mt-2 space-x-2">
                {currentRating && (
                    <span className="text-xs text-(--color-text-secondary)">
                        Current: {currentRating}
                    </span>
                )}
            </div>

            {currentHasDecimal && (
                <div className="mt-1 text-center text-xs text-(--color-text-secondary)">
                    AniList: {currentRating} • Trakt:{' '}
                    {Math.round(currentRating)}
                </div>
            )}
        </div>
    );
};

interface CommentModalProps {
    isOpen: boolean;
    onClose: () => void;
    isLoading: boolean;
    comments: ServiceComment[];
    mediaInfo: MediaInfoResponse | null;
    ratings: ServiceMediaRatings | null;
    commentType: CommentableType | null;
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

    useEffect(() => {
        if (editorText) {
            setValidationError(null);
        }
    }, [editorText]);

    useEffect(() => {
        if (isOpen) {
            if (comments.length > 0) {
                const mostRecent = comments.sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime()
                )[0];
                setSelectedCommentId(mostRecent.id);
                setEditorText(mostRecent.comment);
                setIsSpoiler(mostRecent.spoiler);
            } else {
                setSelectedCommentId('new');
                setEditorText('');
                setIsSpoiler(false);
            }
        }
    }, [isOpen, comments]);

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

        const wordCount = editorText.trim().split(/\s+/).length;
        if (wordCount < 5) {
            setValidationError('Comment must be at least 5 words.');
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
                        </p>
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
                                + New Comment
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
                                                <p className="text-sm line-clamp-2">
                                                    {comment.comment}
                                                </p>
                                                <p className="text-xs text-(--color-text-secondary) mt-1">
                                                    {new Date(
                                                        comment.createdAt
                                                    ).toLocaleString()}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() =>
                                                    handleDelete(comment.id)
                                                }
                                                disabled={isSubmitting}
                                                className="text-(--color-text-secondary) hover:text-(--color-danger) disabled:opacity-50 text-xl ml-2"
                                            >
                                                ×
                                            </button>
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
                            placeholder="Write your review or shout here... (at least 5 words)"
                            className={`w-full flex-grow bg-(--color-background) border rounded-md p-3 text-base resize-none focus:outline-none focus:ring-2 ${validationError ? 'border-(--color-danger) focus:ring-(--color-danger)' : 'border-(--color-border) focus:ring-(--color-accent-primary)'}`}
                        />
                        {validationError && (
                            <p className="text-(--color-danger) text-sm mt-1">
                                {validationError}
                            </p>
                        )}
                        <div className="mt-4">
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
                                    This comment contains spoilers
                                </span>
                            </label>

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
