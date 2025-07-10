import React, { useState, useEffect, useRef } from 'react';
import { isMovieMediaInfo, isShowMediaInfo } from '../../../utils/typeGuards';
import {
    ActiveScrobbleStatus,
    ScrobbleNotificationMediaType
} from '../../../types/scrobbling';
import { CommentableType, MediaRatings } from '../../../types/media';
import { useServiceStatus } from '../../../hooks/useServiceStatus';
import {
    ServiceStatus,
    ServiceActivityState
} from '../../../types/serviceStatus';

const ServiceStatusBadge: React.FC<{
    status: ServiceStatus;
    hasHistoryEntries: boolean;
}> = ({ status, hasHistoryEntries }) => {
    const getStatusIcon = (state: ServiceActivityState): string => {
        switch (state) {
            case 'scrobbling':
            case 'starting_scrobble':
            case 'pausing_scrobble':
            case 'stopping_scrobble':
                return '🔵';
            case 'tracking_progress':
                return '🟣';
            case 'updating_progress':
                return '🟣';
            case 'error':
                return '🔴';
            case 'idle':
                return status.isAuthenticated ? '🟢' : '⚪';
            case 'disabled':
                return '⚫';
            default:
                return '⚪';
        }
    };

    const getStatusText = (state: ServiceActivityState): string => {
        // Always check authentication first
        if (!status.isAuthenticated) {
            return 'Not logged in';
        }

        if (hasHistoryEntries) {
            return 'Added to history';
        }

        switch (state) {
            case 'starting_scrobble':
                return 'Starting...';
            case 'scrobbling':
                return 'Scrobbling';
            case 'pausing_scrobble':
                return 'Pausing...';
            case 'paused':
                return 'Paused';
            case 'stopping_scrobble':
                return 'Stopping...';
            case 'tracking_progress':
                return 'Tracking progress';
            case 'updating_progress':
                return 'Updating...';
            case 'error':
                return 'Error';
            case 'idle':
                return 'Ready';
            case 'disabled':
                return 'Disabled';
            default:
                return 'Unknown';
        }
    };

    const getServiceName = (serviceType: string): string => {
        switch (serviceType) {
            case 'trakt':
                return 'Trakt';
            case 'anilist':
                return 'AniList';
            case 'myanimelist':
                return 'MAL';
            default:
                return (
                    serviceType.charAt(0).toUpperCase() + serviceType.slice(1)
                );
        }
    };

    const icon = getStatusIcon(status.activityState);
    const statusText = getStatusText(status.activityState);
    const serviceName = getServiceName(status.serviceType);

    return (
        <div className="flex items-center gap-1 text-xs">
            <span>{icon}</span>
            <span className="font-medium">{serviceName}:</span>
            <span className="text-(--color-text-secondary)">{statusText}</span>
        </div>
    );
};

const HalfStar: React.FC<{
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
            className="relative w-4 h-4 cursor-pointer"
            onMouseLeave={readOnly ? undefined : onMouseLeave}
        >
            <svg
                className="absolute inset-0 w-4 h-4 text-(--color-star-empty)"
                fill="currentColor"
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>

            {/* Left half overlay */}
            {leftHalf && (
                <svg
                    className="absolute inset-0 w-4 h-4 text-(--color-star-filled)"
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
                    className="absolute inset-0 w-4 h-4 text-(--color-star-filled)"
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

const StarRatingInput: React.FC<{
    label: string;
    currentRating: number | null;
    onRate: (rating: number) => void;
    isSubmitting: boolean;
    onCommentClick?: () => void;
}> = ({ label, currentRating, onRate, isSubmitting, onCommentClick }) => {
    const [hoverRating, setHoverRating] = useState(0);

    const displayRating = hoverRating || currentRating || 0;
    const currentHasDecimal =
        currentRating !== null && currentRating !== Math.round(currentRating);

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
                    const starNumber = i + 1;
                    return (
                        <HalfStar
                            key={starNumber}
                            rating={starNumber}
                            currentValue={displayRating}
                            onLeftClick={() => onRate(starNumber - 0.5)}
                            onRightClick={() => onRate(starNumber)}
                            onLeftHover={() => setHoverRating(starNumber - 0.5)}
                            onRightHover={() => setHoverRating(starNumber)}
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

interface ScrobbleNotificationProps {
    mediaInfo: ScrobbleNotificationMediaType;
    hasHistoryEntries: boolean;
    isScrobbled: boolean;
    hasEverBeenScrobbled: boolean;
    traktHistoryId: number | null;
    serviceHistoryIds: Record<string, any>;
    liveScrobbleStatus: ActiveScrobbleStatus;
    onManualScrobble: () => Promise<void>;
    onUndoScrobble: () => Promise<void>;
    isProcessingAction: boolean;
    ratings: MediaRatings | null;
    onRate: (type: CommentableType, rating: number) => void;
    onUnrate: (type: CommentableType) => void;
    onOpenCommentModal: (type: CommentableType) => void;
    globalScrobblingEnabled?: boolean;
    onGlobalScrobblingToggle?: (enabled: boolean) => void;
}

export const ScrobbleNotification: React.FC<ScrobbleNotificationProps> = ({
    mediaInfo,
    hasHistoryEntries,
    isScrobbled,
    hasEverBeenScrobbled,
    traktHistoryId,
    serviceHistoryIds,
    onManualScrobble,
    onUndoScrobble,
    isProcessingAction,
    ratings,
    onRate,
    onUnrate,
    onOpenCommentModal,
    globalScrobblingEnabled = true,
    onGlobalScrobblingToggle
}) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const initialExpandDoneRef = useRef(false);
    const { serviceStatuses, isLoading: isLoadingServiceStatus } =
        useServiceStatus();

    useEffect(() => {
        if (hasHistoryEntries && !initialExpandDoneRef.current) {
            setIsExpanded(true);
            const timer = setTimeout(() => setIsExpanded(false), 7000);
            initialExpandDoneRef.current = true;
            return () => clearTimeout(timer);
        }
        if (!hasHistoryEntries) {
            initialExpandDoneRef.current = false;
        }
    }, [hasHistoryEntries]);

    const handleRatingClick = async (
        type: CommentableType,
        ratingValue: number
    ) => {
        if (isProcessingAction) return;

        // Check if user is clicking the same rating they already have
        let currentUserRating: number | null = null;

        if (type === 'movie' && isMovieMediaInfo(mediaInfo)) {
            currentUserRating = ratings?.show?.userRating ?? null;
        } else if (type === 'show') {
            currentUserRating = ratings?.show?.userRating ?? null;
        } else if (type === 'season') {
            currentUserRating = ratings?.season?.userRating ?? null;
        } else if (type === 'episode') {
            currentUserRating = ratings?.episode?.userRating ?? null;
        }

        // If user clicks the same rating, unrate instead
        if (currentUserRating !== null && currentUserRating === ratingValue) {
            await onUnrate(type);
        } else {
            await onRate(type, ratingValue);
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

    const containerClasses = `fixed bottom-0 left-1/2 -translate-x-1/2 z-[999999999] transition-all duration-250 ease-in-out pointer-events-none`;
    const contentWrapperClasses = `bg-(--color-surface-1) w-72 text-base text-center overflow-hidden shadow-lg rounded-t-md transition-[max-height] duration-250 ease-in-out ${isExpanded ? 'max-h-[500px]' : 'max-h-2 hover:max-h-[500px]'} pointer-events-auto`;

    return (
        <div className={containerClasses}>
            <div
                className={contentWrapperClasses}
                onMouseEnter={() => setIsExpanded(true)}
                onMouseLeave={() => setIsExpanded(false)}
            >
                <div className="py-2 px-3">
                    {/* Smart Scrobbling Toggle */}
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-(--color-border)">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-(--color-text-primary)">
                                Auto Scrobbling
                            </span>
                            <span className="text-xs text-(--color-text-secondary)">
                                {hasEverBeenScrobbled
                                    ? Object.keys(serviceHistoryIds).some(
                                          (id) => serviceHistoryIds[id] === -1
                                      )
                                        ? '⚠️ Conflict'
                                        : '✅ Complete'
                                    : globalScrobblingEnabled
                                      ? '▶️ Active'
                                      : '⏸️ Paused'}
                            </span>
                        </div>
                        {!hasEverBeenScrobbled && (
                            // Functional toggle for active/paused states
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={globalScrobblingEnabled}
                                    onChange={(e) => {
                                        onGlobalScrobblingToggle?.(
                                            e.target.checked
                                        );
                                    }}
                                    className="sr-only"
                                />
                                <div
                                    className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
                                        globalScrobblingEnabled
                                            ? 'bg-(--color-accent-primary)' // Active state
                                            : 'bg-(--color-border)' // Paused state
                                    }`}
                                >
                                    <div
                                        className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out ${
                                            globalScrobblingEnabled
                                                ? 'translate-x-5'
                                                : 'translate-x-0'
                                        } mt-0.5 ml-0.5`}
                                    />
                                </div>
                            </label>
                        )}
                    </div>
                    {/* Service Status Indicators */}
                    {!isLoadingServiceStatus && serviceStatuses.length > 0 && (
                        <div className="flex flex-col gap-1 mb-2">
                            {serviceStatuses.map((serviceStatus) => (
                                <ServiceStatusBadge
                                    key={serviceStatus.serviceType}
                                    status={serviceStatus}
                                    hasHistoryEntries={hasHistoryEntries}
                                />
                            ))}
                        </div>
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

                    {(isExpanded || hasHistoryEntries) && (
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
                                {isScrobbled ? (
                                    /* Undo button - show when scrobbled */
                                    <button
                                        className="text-(--color-danger) px-2 py-1 rounded border-none cursor-pointer text-xs hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                        onClick={onUndoScrobble}
                                        disabled={
                                            isProcessingAction ||
                                            (!traktHistoryId &&
                                                Object.keys(serviceHistoryIds)
                                                    .length === 0)
                                        }
                                    >
                                        Undo History Add?
                                    </button>
                                ) : (
                                    /* Manual scrobble button - show when NOT scrobbled */
                                    <button
                                        className="text-(--color-accent-primary) w-full px-2 py-1 rounded border-none cursor-pointer my-1 text-sm hover:bg-(--color-surface-2) disabled:opacity-70 disabled:cursor-wait flex items-center justify-center"
                                        onClick={onManualScrobble}
                                        disabled={isProcessingAction}
                                    >
                                        {isProcessingAction
                                            ? 'Processing...'
                                            : 'Manually Add to History'}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
