import React, { useState, useEffect, useRef } from 'react';
import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';
import {
    RatingInfo,
    ScrobbleNotificationMediaType,
    ActiveScrobbleStatus
} from '../utils/types';

// Star component remains the same
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
        className={`w-4 h-4 cursor-${readOnly ? 'default' : 'pointer'} ${filled ? 'text-yellow-400' : 'text-gray-300'}`}
        fill="currentColor"
        viewBox="0 0 20 20"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);

interface ScrobbleNotificationProps {
    mediaInfo: ScrobbleNotificationMediaType;
    isEffectivelyScrobbled: boolean; // True if traktHistoryIdRef.current has a value
    traktHistoryId: number | null;
    liveScrobbleStatus: ActiveScrobbleStatus; // 'idle', 'started', 'paused'
    onManualScrobble: () => Promise<void>; // Renamed from onScrobble
    onUndoScrobble: () => Promise<void>;
    isProcessingAction: boolean; // Generic flag for when any scrobble/undo/rating action is in progress

    ratingInfo: RatingInfo | null;
    onRate: (rating: number) => void;
}

export const ScrobbleNotification: React.FC<ScrobbleNotificationProps> = ({
    mediaInfo,
    isEffectivelyScrobbled,
    traktHistoryId,
    liveScrobbleStatus,
    onManualScrobble,
    onUndoScrobble,
    isProcessingAction, // Use this to disable buttons during any related async op
    ratingInfo,
    onRate
}) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const initialExpandDoneRef = useRef(false); // To ensure auto-expand only happens once after a successful scrobble

    const [hoverRating, setHoverRating] = useState<number>(0);
    const [currentRating, setCurrentRating] = useState<number | null>(null);
    const [isRatingSubmitting, setIsRatingSubmitting] = useState(false); // Keep this specific to rating

    useEffect(() => {
        setCurrentRating(ratingInfo?.userRating ?? null);
    }, [ratingInfo]);

    useEffect(() => {
        // Auto-expand when an item is newly scrobbled (i.e., added to history)
        if (isEffectivelyScrobbled && !initialExpandDoneRef.current) {
            setIsExpanded(true);
            const timer = setTimeout(() => setIsExpanded(false), 7000); // Longer display for confirmation
            initialExpandDoneRef.current = true;
            return () => clearTimeout(timer);
        }
        // If it's undone, reset the flag so it can expand again if re-scrobbled
        if (!isEffectivelyScrobbled) {
            initialExpandDoneRef.current = false;
        }
    }, [isEffectivelyScrobbled]);

    const handleManualScrobbleClick = async () => {
        if (isProcessingAction) return;
        await onManualScrobble();
    };

    const handleUndoScrobbleClick = async () => {
        if (isProcessingAction || !traktHistoryId) return;
        await onUndoScrobble();
    };

    const handleRatingClick = async (ratingValue: number) => {
        if (
            isRatingSubmitting ||
            ratingValue === currentRating ||
            isProcessingAction
        )
            return;
        setIsRatingSubmitting(true);
        try {
            await onRate(ratingValue);
        } catch (error) {
            console.error('Error during rating submission:', error);
        } finally {
            setIsRatingSubmitting(false);
        }
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

    const containerClasses = `
        fixed bottom-0 left-1/2 -translate-x-1/2
        z-[999999999]
        transition-all duration-250 ease-in-out
        pointer-events-none
    `;

    const contentWrapperClasses = `
        bg-white w-72 
        text-base text-center overflow-hidden shadow-lg rounded-t-md
        transition-[max-height] duration-250 ease-in-out
        ${isExpanded ? 'max-h-96' : 'max-h-2 hover:max-h-96'}
        pointer-events-auto 
    `;

    let statusText = '';
    let statusColor = 'text-gray-700';

    if (isEffectivelyScrobbled) {
        statusText = 'Added to Trakt History';
        statusColor = 'text-green-600';
    } else if (liveScrobbleStatus === 'started') {
        statusText = 'Scrobbling to Trakt...';
        statusColor = 'text-blue-600';
    } else if (liveScrobbleStatus === 'paused') {
        statusText = 'Scrobbling Paused';
        statusColor = 'text-yellow-600';
    }

    return (
        <div className={containerClasses}>
            <div
                className={contentWrapperClasses}
                onMouseEnter={() => setIsExpanded(true)}
                onMouseLeave={() => {
                    if (
                        !isEffectivelyScrobbled ||
                        !initialExpandDoneRef.current
                    )
                        setIsExpanded(false);
                }}
            >
                <div ref={contentRef} className="py-2 px-3">
                    {/* Status Area */}
                    {statusText && (
                        <p
                            className={`font-semibold m-0 p-0 text-sm ${statusColor}`}
                        >
                            {statusText}
                        </p>
                    )}
                    <p className="text-black text-sm m-0 p-0 truncate">
                        {title} {year && `(${year})`}
                    </p>
                    {isShow &&
                        season !== undefined &&
                        episode !== undefined && (
                            <p className="text-gray-600 text-xs m-0 p-0">
                                S{String(season).padStart(2, '0')} E
                                {String(episode).padStart(2, '0')}
                            </p>
                        )}

                    {/* Actions and Rating Area - Shown if expanded or scrobbled */}
                    {(isExpanded || isEffectivelyScrobbled) && (
                        <>
                            {/* Rating Section */}
                            <div className="mt-1 border-t border-gray-100 pt-1">
                                <p className="text-xs text-gray-500 mb-0.5">
                                    Your Rating:
                                </p>
                                <div
                                    className="flex justify-center items-center space-x-0.5"
                                    onMouseLeave={() => setHoverRating(0)}
                                >
                                    {[...Array(10)].map((_, i) => {
                                        const ratingValue = i + 1;
                                        const isFilled =
                                            hoverRating >= ratingValue ||
                                            (!hoverRating &&
                                                (currentRating ?? 0) >=
                                                    ratingValue);
                                        return (
                                            <Star
                                                key={ratingValue}
                                                filled={isFilled}
                                                onClick={() =>
                                                    handleRatingClick(
                                                        ratingValue
                                                    )
                                                }
                                                onMouseEnter={() =>
                                                    setHoverRating(ratingValue)
                                                }
                                                onMouseLeave={() => {}} // Individual star leave handled by parent div
                                                readOnly={
                                                    isRatingSubmitting ||
                                                    isProcessingAction
                                                }
                                            />
                                        );
                                    })}
                                    {(isRatingSubmitting ||
                                        (isProcessingAction &&
                                            liveScrobbleStatus !== 'idle' &&
                                            !isEffectivelyScrobbled)) && ( // Show spinner for rating or general processing
                                        <svg
                                            className="animate-spin ml-1 h-3 w-3 text-gray-500"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            ></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                    )}
                                </div>
                            </div>

                            {/* Buttons: Manual Scrobble or Undo */}
                            <div className="mt-2">
                                {isEffectivelyScrobbled ? (
                                    <button
                                        className="text-red-500 px-2 py-1 rounded border-none cursor-pointer text-xs hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={handleUndoScrobbleClick}
                                        disabled={
                                            isProcessingAction ||
                                            !traktHistoryId
                                        }
                                    >
                                        Undo History Add?
                                    </button>
                                ) : (
                                    liveScrobbleStatus === 'idle' && ( // Only show manual add if no live scrobble active
                                        <button
                                            className="text-blue-600 w-full px-2 py-1 rounded border-none cursor-pointer my-1 text-sm hover:bg-blue-50 disabled:opacity-70 disabled:cursor-wait flex items-center justify-center"
                                            onClick={handleManualScrobbleClick}
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
