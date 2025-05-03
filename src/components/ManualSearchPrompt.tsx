import React, { useState, useEffect } from 'react';
import {
    MediaInfoResponse,
    MessageResponse,
    MovieMediaInfo,
    ShowMediaInfo,
    MessageRequest
} from '../utils/types';
import { isMovieMediaInfo, isShowMediaInfo } from '../utils/typeGuards';

interface ManualSearchPromptProps {
    originalQuery: { type: string; query: string; years: string };
    onConfirmMedia: (selectedMedia: MediaInfoResponse) => void;
    onCancel: () => void;
}

export const ManualSearchPrompt: React.FC<ManualSearchPromptProps> = ({
    originalQuery,
    onConfirmMedia,
    onCancel
}) => {
    const [searchTerm, setSearchTerm] = useState(originalQuery.query);
    const [searchResults, setSearchResults] = useState<
        (MovieMediaInfo | ShowMediaInfo)[]
    >([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!searchTerm.trim()) return;
        setIsLoading(true);
        setError(null);
        setSearchResults([]);

        try {
            const response = await chrome.runtime.sendMessage<
                MessageRequest,
                MessageResponse<(MovieMediaInfo | ShowMediaInfo)[]>
            >({
                action: 'manualSearch',
                params: {
                    type: originalQuery.type,
                    query: searchTerm
                }
            });

            if (response.success && response.data) {
                setSearchResults(response.data);
                if (response.data.length === 0) {
                    setError('No results found for your search.');
                }
            } else {
                setError(response.error || 'Search failed.');
            }
        } catch (err) {
            console.error('Manual search send message error:', err);
            setError(
                err instanceof Error
                    ? err.message
                    : 'An unknown error occurred during search.'
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = (media: MediaInfoResponse) => {
        console.log('Media selected:', media);
        onConfirmMedia(media);
    };

    useEffect(() => {
        handleSearch();
    }, []);

    const getTitle = (item: MovieMediaInfo | ShowMediaInfo) => {
        if (isMovieMediaInfo(item)) {
            return item.movie.title;
        } else if (isShowMediaInfo(item)) {
            return item.show.title;
        }
        return 'Unknown Title';
    };
    const getYear = (item: MovieMediaInfo | ShowMediaInfo) => {
        if (isMovieMediaInfo(item)) {
            return item.movie.year;
        } else if (isShowMediaInfo(item)) {
            return item.show.year;
        }
        return undefined;
    };

    return (
        <div className="tmsync-manual-search fixed bottom-[60px] left-1/2 -translate-x-1/2 z-[1000000000] bg-white border border-gray-300 rounded-lg p-4 shadow-lg w-[350px] text-gray-800">
            <p className="m-0 mb-2.5 text-sm">
                Couldn't automatically identify "{originalQuery.query}". Please
                confirm or search:
            </p>
            <div className="flex">
                <input
                    type="text"
                    className="w-[calc(100%-80px)] p-2 mr-1 border border-gray-300 rounded"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search on Trakt..."
                />
                <button
                    className="px-3 py-2 cursor-pointer border-none rounded ml-1 bg-blue-500 text-white disabled:opacity-50"
                    onClick={handleSearch}
                    disabled={isLoading}
                >
                    {isLoading ? '...' : 'Search'}
                </button>
            </div>

            {error && <p className="text-red-600 text-xs mt-1">{error}</p>}

            {isLoading && searchResults.length === 0 && <p>Loading...</p>}

            {!isLoading && searchResults.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto mt-2.5 border-t border-gray-200 pt-2.5">
                    {searchResults.map((item) => {
                        const key = isMovieMediaInfo(item)
                            ? item.movie.ids?.trakt
                            : isShowMediaInfo(item)
                              ? item.show.ids?.trakt
                              : `fallback-${Math.random()}`;
                        return (
                            <div
                                key={key}
                                className="p-2 border-b border-gray-200 flex justify-between items-center"
                            >
                                <span>
                                    {getTitle(item)} ({getYear(item)})
                                </span>
                                <button
                                    className="px-2 py-1 cursor-pointer border-none rounded bg-green-500 text-white text-xs disabled:opacity-50"
                                    onClick={() => handleSelect(item)}
                                >
                                    Select
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <button
                className="px-3 py-2 cursor-pointer border-none rounded ml-1 bg-red-600 text-white mt-2.5 block w-full disabled:opacity-50"
                onClick={onCancel}
                disabled={isLoading}
            >
                Cancel / Not This
            </button>
        </div>
    );
};
