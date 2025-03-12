import React, { useState, useEffect, useRef, CSSProperties } from 'react';
import {
    MessageResponse,
    ScrobbleNotificationMediaType,
    ScrobbleResponse
} from '../utils/types';

// Define styles object with correct TypeScript types
const styles: Record<string, CSSProperties> = {
    container: {
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        zIndex: 999999999,
        position: 'fixed',
        bottom: 0
    },
    notification: {
        backgroundColor: 'white',
        width: '300px',
        fontSize: '1.25rem',
        lineHeight: '1.75rem',
        textAlign: 'center',
        overflow: 'hidden',
        transition: 'all 0.3s ease'
    },
    title: {
        fontSize: '1.25rem',
        lineHeight: '1.75rem',
        margin: '0',
        padding: '0',
        color: 'black'
    },
    episodeInfo: {
        fontSize: '1.25rem',
        lineHeight: '1.75rem',
        margin: '0',
        padding: '0',
        color: 'black'
    },
    button: {
        color: 'red',
        padding: '4px 8px',
        borderRadius: '4px',
        border: 'none',
        cursor: 'pointer',
        margin: '8px 0',
        fontSize: '1rem'
    }
};

interface ScrobbleNotificationProps {
    mediaInfo: ScrobbleNotificationMediaType;
    isScrobbled?: boolean;
    traktHistoryId?: number | null;
    onScrobble: () => Promise<MessageResponse<ScrobbleResponse>>;
    onUndoScrobble: (historyId: number) => Promise<MessageResponse<unknown>>;
}

export const ScrobbleNotification: React.FC<ScrobbleNotificationProps> = ({
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

    // Update state if props change
    useEffect(() => {
        setIsScrobbled(initialIsScrobbled);
        setTraktHistoryId(initialTraktHistoryId);

        // Auto-expand notification when it changes to scrobbled state
        if (initialIsScrobbled && !isScrobbled) {
            setIsExpanded(true);

            // Auto-collapse after 5 seconds
            setTimeout(() => {
                setIsExpanded(false);
            }, 5000);
        }
    }, [initialIsScrobbled, initialTraktHistoryId, isScrobbled]);

    // Measure content height when content changes
    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [isScrobbled, mediaInfo]);

    // Handle manual scrobble
    const handleScrobble = () => {
        onScrobble()
            .then((response: MessageResponse<ScrobbleResponse>) => {
                if (response.success && response.data) {
                    // The state will be updated by the parent component
                }
            })
            .catch((error: Error) => {
                console.error('Error during manual scrobble:', error);
            });
    };

    // Handle undo scrobble
    const handleUndoScrobble = () => {
        if (!traktHistoryId) return;

        onUndoScrobble(traktHistoryId).catch((error: Error) => {
            console.error('Error undoing scrobble:', error);
        });
    };

    if (!mediaInfo) return null;

    // Extract media type-specific information
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

    // Extract episode information
    const season =
        isShow && 'season' in mediaInfo ? mediaInfo.season : undefined;
    const episode =
        isShow && 'number' in mediaInfo ? mediaInfo.number : undefined;

    return (
        <div style={styles.container}>
            <div
                style={{
                    ...styles.notification,
                    height: isExpanded ? `${contentHeight}px` : '8px'
                }}
                onMouseEnter={() => setIsExpanded(true)}
                onMouseLeave={() => setIsExpanded(false)}
            >
                <div
                    ref={contentRef}
                    style={{
                        padding: '10px 0'
                    }}
                >
                    {isScrobbled ? (
                        <div>
                            <p style={styles.title}>Added</p>
                            <p style={styles.title}>
                                {title} ({year})
                            </p>
                            {isShow && (
                                <p style={styles.episodeInfo}>
                                    Season: {season} Episode: {episode}
                                </p>
                            )}
                            <button
                                style={styles.button}
                                onClick={handleUndoScrobble}
                            >
                                Undo?
                            </button>
                        </div>
                    ) : (
                        <button style={styles.button} onClick={handleScrobble}>
                            Add{' '}
                            {isShow
                                ? `Season ${season} Episode ${episode}`
                                : title}{' '}
                            to Trakt.tv history
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
