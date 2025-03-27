import React, { useState, useEffect, useRef } from 'react';
import {
    MessageResponse,
    ScrobbleNotificationMediaType,
    ScrobbleResponse
} from '../utils/types';

interface ScrobbleNotificationProps {
    hidden?: boolean;
    mediaInfo: ScrobbleNotificationMediaType;
    isScrobbled?: boolean;
    traktHistoryId?: number | null;
    onScrobble: () => Promise<MessageResponse<ScrobbleResponse>>;
    onUndoScrobble: (historyId: number) => Promise<MessageResponse<unknown>>;
}

export const ScrobbleNotification: React.FC<ScrobbleNotificationProps> = ({
    hidden = false,
    mediaInfo,
    isScrobbled: initialIsScrobbled = false,
    traktHistoryId: initialTraktHistoryId = null,
    onScrobble,
    onUndoScrobble
}) => {
    const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const [isScrobbled, setIsScrobbled] = useState<boolean>(initialIsScrobbled);
    const [traktHistoryId, setTraktHistoryId] = useState<number | null>(
        initialTraktHistoryId
    );
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState<number>(0);

    useEffect(() => {
        setIsScrobbled(initialIsScrobbled);
        setTraktHistoryId(initialTraktHistoryId);

        if (initialIsScrobbled && !isScrobbled) {
            setIsExpanded(true);
            setTimeout(() => {
                setIsExpanded(false);
            }, 5000);
        }
    }, [initialIsScrobbled, initialTraktHistoryId, isScrobbled]);

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [isScrobbled, mediaInfo]);

    const handleScrobble = () => {
        onScrobble().catch((error: Error) => {
            console.error('Error during manual scrobble:', error);
        });
    };

    const handleUndoScrobble = () => {
        if (!traktHistoryId) return;
        onUndoScrobble(traktHistoryId).catch((error: Error) => {
            console.error('Error undoing scrobble:', error);
        });
    };

    if (!mediaInfo) return null;

    const getMediaTitle = (): string => {
        if ('movie' in mediaInfo) {
            return mediaInfo.movie.title;
        } else if ('show' in mediaInfo) {
            return mediaInfo.show.title;
        }
        return 'Unknown Title';
    };

    const getMediaYear = (): number | undefined => {
        if ('movie' in mediaInfo) {
            return mediaInfo.movie.year;
        } else if ('show' in mediaInfo) {
            return mediaInfo.show.year;
        }
        return undefined;
    };

    const title = getMediaTitle();
    const year = getMediaYear();
    const isShow = 'show' in mediaInfo;
    const season =
        isShow && 'season' in mediaInfo ? mediaInfo.season : undefined;
    const episode =
        isShow && 'number' in mediaInfo ? mediaInfo.number : undefined;

    return (
        <div
            className={`fixed bottom-0 w-full flex justify-center z-[999999999] ${hidden ? 'hidden' : 'flex'}`}
        >
            <div
                className={`bg-white w-72 text-xl text-center overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? `h-[${contentHeight}px]` : 'h-2'}`}
                onMouseEnter={() => setIsExpanded(true)}
                onMouseLeave={() => setIsExpanded(false)}
            >
                <div ref={contentRef} className="py-2">
                    {isScrobbled ? (
                        <div>
                            <p className="text-black text-xl m-0 p-0">Added</p>
                            <p className="text-black text-xl m-0 p-0">
                                {title} ({year})
                            </p>
                            {isShow && (
                                <p className="text-black text-xl m-0 p-0">
                                    Season: {season} Episode: {episode}
                                </p>
                            )}
                            <button
                                className="text-red-500 px-2 py-1 rounded border-none cursor-pointer my-2 text-base"
                                onClick={handleUndoScrobble}
                            >
                                Undo?
                            </button>
                        </div>
                    ) : (
                        <button
                            className="text-red-500 px-2 py-1 rounded border-none cursor-pointer my-2 text-base"
                            onClick={handleScrobble}
                        >
                            Add
                            <br />
                            {isShow
                                ? `${title} (${year}) Season ${season} Episode ${episode}`
                                : `${title} (${year})`}{' '}
                            to Trakt.tv history
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
