import React, { useState, useEffect, useRef } from 'react';
import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';
import {
    MediaRatings,
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

// --- NEW HELPER COMPONENT ---
const StarRatingInput: React.FC<{
    label: string;
    currentRating: number | null;
    onRate: (rating: number) => void;
    isSubmitting: boolean;
}> = ({ label, currentRating, onRate, isSubmitting }) => {
    const [hoverRating, setHoverRating] = useState(0);

    return (
        <div className="mt-2 pt-2 border-t border-gray-100 first-of-type:border-t-0 first-of-type:pt-1 first-of-type:mt-1">
            <p className="text-xs text-gray-500 mb-0.5">{label}:</p>
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
// --- END NEW HELPER COMPONENT ---

// --- PROPS INTERFACE MODIFIED ---
interface ScrobbleNotificationProps {
    mediaInfo: ScrobbleNotificationMediaType;
    isEffectivelyScrobbled: boolean;
    traktHistoryId: number | null;
    liveScrobbleStatus: ActiveScrobbleStatus;
    onManualScrobble: () => Promise<void>;
    onUndoScrobble: () => Promise<void>;
    isProcessingAction: boolean;
    ratings: MediaRatings | null;
    onRate: (
        type: 'movie' | 'show' | 'season' | 'episode',
        rating: number
    ) => void;
}
// --- END MODIFICATION ---

export const ScrobbleNotification: React.FC<ScrobbleNotificationProps> = ({
    mediaInfo,
    isEffectivelyScrobbled,
    traktHistoryId,
    liveScrobbleStatus,
    onManualScrobble,
    onUndoScrobble,
    isProcessingAction,
    ratings,
    onRate
}) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const contentRef = useRef<HTMLDivElement>(null);
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

    const handleManualScrobbleClick = async () => {
        if (isProcessingAction) return;
        await onManualScrobble();
    };

    const handleUndoScrobbleClick = async () => {
        if (isProcessingAction || !traktHistoryId) return;
        await onUndoScrobble();
    };

    // --- NEW RATING HANDLER ---
    const handleRatingClick = async (
        type: 'movie' | 'show' | 'season' | 'episode',
        ratingValue: number
    ) => {
        if (isProcessingAction) return;
        await onRate(type, ratingValue);
    };
    // --- END NEW RATING HANDLER ---

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
                onMouseLeave={() => setIsExpanded(false)}
            >
                <div ref={contentRef} className="py-2 px-3">
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

                    {(isExpanded || isEffectivelyScrobbled) && (
                        <>
                            {/* --- RATING SECTION MODIFIED --- */}
                            {isMovieMediaInfo(mediaInfo) && (
                                <StarRatingInput
                                    label="Your Rating"
                                    currentRating={
                                        ratings?.show?.userRating ?? null
                                    }
                                    onRate={(r) =>
                                        handleRatingClick('movie', r)
                                    }
                                    isSubmitting={isProcessingAction}
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
                                />
                            )}
                            {/* --- END MODIFICATION --- */}

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
                                    liveScrobbleStatus === 'idle' && (
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
