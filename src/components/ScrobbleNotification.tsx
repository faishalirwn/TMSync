import React, { useState, useEffect, useRef } from 'react';

import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';
import { RatingInfo, ScrobbleNotificationMediaType } from '../utils/types';

// Simple Star component for rating
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
    isScrobbled?: boolean;
    traktHistoryId?: number | null;
    onScrobble: () => Promise<void>;
    onUndoScrobble: () => Promise<void>;
    isScrobbling?: boolean;
    // --- New Rating Props ---
    ratingInfo: RatingInfo | null;
    onRate: (rating: number) => void; // Callback when user rates
}

export const ScrobbleNotification: React.FC<ScrobbleNotificationProps> = ({
    mediaInfo,
    isScrobbled,
    traktHistoryId,
    onScrobble,
    onUndoScrobble,
    isScrobbling = false,
    // --- Destructure new props ---
    ratingInfo,
    onRate
}) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const contentRef = useRef<HTMLDivElement>(null);
    // Rating UI State
    const [hoverRating, setHoverRating] = useState<number>(0); // Track rating user is hovering over
    const [currentRating, setCurrentRating] = useState<number | null>(null); // Local state reflecting Trakt rating
    const [isRatingSubmitting, setIsRatingSubmitting] = useState(false); // Optional: loading state for rating submission

    // Update local rating state when prop changes
    useEffect(() => {
        setCurrentRating(ratingInfo?.userRating ?? null);
    }, [ratingInfo]);

    // Auto-expand briefly when scrobbled successfully
    useEffect(() => {
        if (isScrobbled) {
            setIsExpanded(true);
            const timer = setTimeout(() => setIsExpanded(false), 5000);
            return () => clearTimeout(timer);
        }
    }, [isScrobbled]);

    const handleScrobble = () => {
        if (isScrobbling) return;
        onScrobble();
    };

    const handleUndoScrobble = () => {
        if (isScrobbling || !traktHistoryId) return;
        onUndoScrobble();
    };

    const handleRatingClick = async (ratingValue: number) => {
        if (isRatingSubmitting || ratingValue === currentRating) return; // Prevent clicks during submission or if rating is the same
        console.log(`Rating ${ratingValue} clicked.`);
        setIsRatingSubmitting(true); // Set loading state
        try {
            await onRate(ratingValue); // Call parent handler
            // Optimistic update handled by useEffect watching ratingInfo prop,
            // or could update setCurrentRating here directly if needed.
            // setCurrentRating(ratingValue); // Update immediately
        } catch (error) {
            console.error('Error during rating submission:', error);
            // Optionally revert UI or show error
        } finally {
            setIsRatingSubmitting(false); // Clear loading state
        }
    };

    const handleRatingHover = (ratingValue: number) => {
        setHoverRating(ratingValue);
    };

    const handleRatingLeave = () => {
        setHoverRating(0); // Reset hover state
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

    const containerClasses = `fixed bottom-0 w-full flex justify-center z-[999999999] transition-all duration-500 ease-in-out`;

    const contentWrapperClasses = `
         bg-white w-72 text-base text-center overflow-hidden shadow-lg rounded-t-md
         transition-[max-height] duration-500 ease-in-out
         ${isExpanded ? 'max-h-96' : 'max-h-2 hover:max-h-96'} 
     `;

    return (
        <div className={containerClasses}>
            <div
                className={contentWrapperClasses}
                onMouseEnter={() => setIsExpanded(true)}
                onMouseLeave={() => !isScrobbled && setIsExpanded(false)}
            >
                <div ref={contentRef} className="py-2 px-3">
                    {isScrobbled ? (
                        <div>
                            <p className="text-green-600 font-semibold m-0 p-0 text-sm">
                                Added to Trakt
                            </p>
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
                            {/* --- Rating Display/Input (After Scrobble) --- */}
                            <div className="mt-1 border-t border-gray-100 pt-1">
                                <p className="text-xs text-gray-500 mb-0.5">
                                    Your Rating:
                                </p>
                                <div
                                    className="flex justify-center items-center space-x-0.5"
                                    onMouseLeave={handleRatingLeave}
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
                                                    handleRatingHover(
                                                        ratingValue
                                                    )
                                                }
                                                onMouseLeave={() => {}} // onMouseLeave handled by parent div
                                                readOnly={isRatingSubmitting} // Disable clicks while submitting
                                            />
                                        );
                                    })}
                                    {isRatingSubmitting && (
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

                            <button
                                className="text-red-500 px-2 py-1 rounded border-none cursor-pointer mt-1 text-xs hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleUndoScrobble}
                                disabled={isScrobbling || isRatingSubmitting} // Also disable if rating is submitting
                            >
                                Undo?
                            </button>
                        </div>
                    ) : (
                        <button
                            className="text-blue-600 w-full px-2 py-1 rounded border-none cursor-pointer my-1 text-sm hover:bg-blue-50 disabled:opacity-70 disabled:cursor-wait flex items-center justify-center"
                            onClick={handleScrobble}
                            disabled={isScrobbling}
                        >
                            {isScrobbling ? (
                                <>
                                    <svg
                                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-600"
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
                                    Adding...
                                </>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <span>Add to Trakt history</span>
                                    <span className="text-xs text-gray-600 truncate max-w-full px-1">
                                        {title} {year && `(${year})`}
                                        {isShow &&
                                            season !== undefined &&
                                            episode !== undefined &&
                                            ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`}
                                    </span>
                                </div>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
