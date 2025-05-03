import React, { useState, useEffect, useRef } from 'react';

import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';
import { ScrobbleNotificationMediaType } from '../utils/types';

interface ScrobbleNotificationProps {
    mediaInfo: ScrobbleNotificationMediaType;
    isScrobbled?: boolean;
    traktHistoryId?: number | null;
    onScrobble: () => Promise<void>;
    onUndoScrobble: () => Promise<void>;
    isScrobbling?: boolean;
}

export const ScrobbleNotification: React.FC<ScrobbleNotificationProps> = ({
    mediaInfo,
    isScrobbled,
    traktHistoryId,
    onScrobble,
    onUndoScrobble,
    isScrobbling = false
}) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<string>('auto');

    useEffect(() => {
        if (isScrobbled) {
            setIsExpanded(true);
            const timer = setTimeout(() => {
                setIsExpanded(false);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [isScrobbled]);

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(`${contentRef.current.scrollHeight}px`);
        }
    }, [isScrobbled, mediaInfo, isScrobbling]);

    const handleScrobble = () => {
        if (isScrobbling) return;
        onScrobble();
    };

    const handleUndoScrobble = () => {
        if (isScrobbling || !traktHistoryId) return;
        onUndoScrobble();
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
                    {' '}
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
                            <button
                                className="text-red-500 px-2 py-1 rounded border-none cursor-pointer my-1 text-xs hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleUndoScrobble}
                                disabled={isScrobbling}
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
