import React, { useState, useEffect, useRef } from 'react';
import { isMovieMediaInfo, isShowMediaInfo } from '../../../utils/typeGuards';
import {
    MediaRatings,
    ScrobbleNotificationMediaType,
    ActiveScrobbleStatus,
    CommentableType
} from '../../../utils/types';

const Star: React.FC<{
    filled: boolean;
    onClick: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    readOnly?: boolean;
}> = ({ filled, onClick, onMouseEnter, onMouseLeave, readOnly }) => (
    <svg
        onClick={readOnly ? undefined : onClick}
        onMouseEnter={readOnly ? undefined : onMouseEnter}
        onMouseLeave={readOnly ? undefined : onMouseLeave}
        className={`w-4 h-4 cursor-${readOnly ? 'default' : 'pointer'} ${filled ? 'text-(--color-star-filled)' : 'text-(--color-star-empty)'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);

const StarRatingInput: React.FC<{
    label: string;
    currentRating: number | null;
    onRate: (rating: number) => void;
    isSubmitting: boolean;
    onCommentClick?: () => void;
}> = ({ label, currentRating, onRate, isSubmitting, onCommentClick }) => {
    const [hoverRating, setHoverRating] = useState(0);

    return (
        <div className="mt-2 pt-2 border-t border-(--color-border) first-of-type:border-t-0 first-of-type:pt-1 first-of-type:mt-1">
            <div className="flex justify-between items-center">
                <p className="text-xs text-(--color-text-secondary) mb-0.5 text-left">
                    {label}:
                </p>
                {onCommentClick && (
                    <button
                        onClick={onCommentClick}
                        className="text-xs text-(--color-accent-primary) hover:underline disabled:opacity-50"
                        disabled={isSubmitting}
                    >
                        Comment
                    </button>
                )}
            </div>
            <div
                className="flex justify-center items-center space-x-0.5"
                onMouseLeave={() => setHoverRating(0)}
            >
                {[...Array(10)].map((_, i) => {
                    const ratingValue = i + 1;
                    const isFilled =
                        hoverRating >= ratingValue ||
                        (!hoverRating && (currentRating ?? 0) >= ratingValue);
                    return (
                        <Star
                            key={ratingValue}
                            filled={isFilled}
                            onClick={() => onRate(ratingValue)}
                            onMouseEnter={() => setHoverRating(ratingValue)}
                            onMouseLeave={() => {}}
                            readOnly={isSubmitting}
                        />
                    );
                })}
            </div>
        </div>
    );
};

interface ScrobbleNotificationProps {
    mediaInfo: ScrobbleNotificationMediaType;
    isEffectivelyScrobbled: boolean;
    traktHistoryId: number | null;
    liveScrobbleStatus: ActiveScrobbleStatus;
    onManualScrobble: () => Promise<void>;
    onUndoScrobble: () => Promise<void>;
    isProcessingAction: boolean;
    ratings: MediaRatings | null;
    onRate: (type: CommentableType, rating: number) => void;
    onOpenCommentModal: (type: CommentableType) => void;
}

export const ScrobbleNotification: React.FC<ScrobbleNotificationProps> = ({
    mediaInfo,
    isEffectivelyScrobbled,
    traktHistoryId,
    liveScrobbleStatus,
    onManualScrobble,
    onUndoScrobble,
    isProcessingAction,
    ratings,
    onRate,
    onOpenCommentModal
}) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const initialExpandDoneRef = useRef(false);

    useEffect(() => {
        if (isEffectivelyScrobbled && !initialExpandDoneRef.current) {
            setIsExpanded(true);
            const timer = setTimeout(() => setIsExpanded(false), 7000);
            initialExpandDoneRef.current = true;
            return () => clearTimeout(timer);
        }
        if (!isEffectivelyScrobbled) {
            initialExpandDoneRef.current = false;
        }
    }, [isEffectivelyScrobbled]);

    const handleRatingClick = async (
        type: CommentableType,
        ratingValue: number
    ) => {
        if (isProcessingAction) return;
        await onRate(type, ratingValue);
    };

    const getMediaTitle = (): string => {
        if (isMovieMediaInfo(mediaInfo)) return mediaInfo.movie.title;
        if (isShowMediaInfo(mediaInfo)) return mediaInfo.show.title;
        return 'Unknown Title';
    };

    const getMediaYear = (): number | undefined => {
        if (isMovieMediaInfo(mediaInfo)) return mediaInfo.movie.year;
        if (isShowMediaInfo(mediaInfo)) return mediaInfo.show.year;
        return undefined;
    };

    const title = getMediaTitle();
    const year = getMediaYear();
    const isShow = isShowMediaInfo(mediaInfo);
    const season =
        isShow && 'season' in mediaInfo ? mediaInfo.season : undefined;
    const episode =
        isShow && 'number' in mediaInfo ? mediaInfo.number : undefined;

    const containerClasses = `fixed bottom-0 left-1/2 -translate-x-1/2 z-[999999999] transition-all duration-250 ease-in-out pointer-events-none`;
    const contentWrapperClasses = `bg-(--color-surface-1) w-72 text-base text-center overflow-hidden shadow-lg rounded-t-md transition-[max-height] duration-250 ease-in-out ${isExpanded ? 'max-h-[500px]' : 'max-h-2 hover:max-h-[500px]'} pointer-events-auto`;

    let statusText = '';
    let statusColor = 'text-(--color-text-primary)';

    if (isEffectivelyScrobbled) {
        statusText = 'Added to Trakt History';
        statusColor = 'text-(--color-success-text)';
    } else if (liveScrobbleStatus === 'started') {
        statusText = 'Scrobbling to Trakt...';
        statusColor = 'text-(--color-accent-primary)';
    } else if (liveScrobbleStatus === 'paused') {
        statusText = 'Scrobbling Paused';
        statusColor = 'text-(--color-warning-text)';
    }

    return (
        <div className={containerClasses}>
            <div
                className={contentWrapperClasses}
                onMouseEnter={() => setIsExpanded(true)}
                onMouseLeave={() => setIsExpanded(false)}
            >
                <div className="py-2 px-3">
                    {statusText && (
                        <p
                            className={`font-semibold m-0 p-0 text-sm ${statusColor}`}
                        >
                            {statusText}
                        </p>
                    )}
                    <p className="text-(--color-text-primary) text-sm m-0 p-0 truncate">
                        {title} {year && `(${year})`}
                    </p>
                    {isShow &&
                        season !== undefined &&
                        episode !== undefined && (
                            <p className="text-(--color-text-secondary) text-xs m-0 p-0">
                                S{String(season).padStart(2, '0')} E
                                {String(episode).padStart(2, '0')}
                            </p>
                        )}

                    {(isExpanded || isEffectivelyScrobbled) && (
                        <>
                            {isMovieMediaInfo(mediaInfo) && (
                                <StarRatingInput
                                    label="Movie Rating"
                                    currentRating={
                                        ratings?.show?.userRating ?? null
                                    }
                                    onRate={(r) =>
                                        handleRatingClick('movie', r)
                                    }
                                    isSubmitting={isProcessingAction}
                                    onCommentClick={() =>
                                        onOpenCommentModal('movie')
                                    }
                                />
                            )}

                            {isShowMediaInfo(mediaInfo) &&
                                episode !== undefined && (
                                    <StarRatingInput
                                        label="Episode Rating"
                                        currentRating={
                                            ratings?.episode?.userRating ?? null
                                        }
                                        onRate={(r) =>
                                            handleRatingClick('episode', r)
                                        }
                                        isSubmitting={isProcessingAction}
                                        onCommentClick={() =>
                                            onOpenCommentModal('episode')
                                        }
                                    />
                                )}

                            {isShowMediaInfo(mediaInfo) &&
                                season !== undefined && (
                                    <StarRatingInput
                                        label="Season Rating"
                                        currentRating={
                                            ratings?.season?.userRating ?? null
                                        }
                                        onRate={(r) =>
                                            handleRatingClick('season', r)
                                        }
                                        isSubmitting={isProcessingAction}
                                        onCommentClick={() =>
                                            onOpenCommentModal('season')
                                        }
                                    />
                                )}

                            {isShowMediaInfo(mediaInfo) && (
                                <StarRatingInput
                                    label="Show Rating"
                                    currentRating={
                                        ratings?.show?.userRating ?? null
                                    }
                                    onRate={(r) => handleRatingClick('show', r)}
                                    isSubmitting={isProcessingAction}
                                    onCommentClick={() =>
                                        onOpenCommentModal('show')
                                    }
                                />
                            )}

                            <div className="mt-2 border-t border-(--color-border) pt-2">
                                {isEffectivelyScrobbled ? (
                                    <button
                                        className="text-(--color-danger) px-2 py-1 rounded border-none cursor-pointer text-xs hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={onUndoScrobble}
                                        disabled={
                                            isProcessingAction ||
                                            !traktHistoryId
                                        }
                                    >
                                        Undo History Add?
                                    </button>
                                ) : (
                                    liveScrobbleStatus === 'idle' && (
                                        <button
                                            className="text-(--color-accent-primary) w-full px-2 py-1 rounded border-none cursor-pointer my-1 text-sm hover:bg-(--color-surface-2) disabled:opacity-70 disabled:cursor-wait flex items-center justify-center"
                                            onClick={onManualScrobble}
                                            disabled={isProcessingAction}
                                        >
                                            {isProcessingAction
                                                ? 'Processing...'
                                                : 'Manually Add to History'}
                                        </button>
                                    )
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
