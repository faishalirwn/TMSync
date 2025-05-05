import { callApi } from './utils/api';
import { calculateConfidence } from './utils/confidenceHelper';
import { getCurrentSiteConfig } from './utils/siteConfigs';
import { MediaType, SiteConfigBase } from './utils/siteConfigs/baseConfig';
import { isMovieMediaInfo, isShowMediaInfo } from './utils/typeGuards';
import {
    HistoryBody,
    HostnameType,
    MediaInfoResponse,
    MediaStatusPayload,
    MessageRequest,
    MessageResponse,
    MovieMediaInfo,
    RatingInfo,
    ScrobbleResponse,
    ShowMediaInfo,
    TraktRating,
    WatchStatusInfo
} from './utils/types';
import { TraktShowWatchedProgress } from './utils/types/traktApi';

export type ScoredMediaInfo = MediaInfoResponse & {
    confidenceScore: number;
};

chrome.runtime.onMessage.addListener(
    (request: MessageRequest, sender, sendResponse) => {
        (async () => {
            if (!sender.tab || !sender.tab.url) {
                sendResponse({ success: false, error: 'no sender.tab' });
                return true;
            }

            const url = sender.tab.url;
            const urlObj = new URL(url);
            const hostname = urlObj.hostname as HostnameType;
            const siteConfig: SiteConfigBase | null =
                getCurrentSiteConfig(hostname);

            if (!siteConfig) {
                sendResponse({
                    success: false,
                    error: `No site config found for ${hostname}`
                });
                return true;
            }

            const tabUrlIdentifier = siteConfig.getUrlIdentifier(url);

            if (!tabUrlIdentifier) {
                sendResponse({ success: false, error: 'tab url parse fail' });
                return true;
            }

            if (request.action === 'mediaInfo') {
                const originalQuery = request.params;
                let mediaInfoResult: MediaInfoResponse | null = null;
                let confidence: 'high' | 'low' = 'low';
                let lookupMethod: 'tmdb_id' | 'text_search' | 'cache' = 'cache';

                let watchStatus: WatchStatusInfo | undefined = undefined;
                let progressInfo: TraktShowWatchedProgress | null = null;
                let ratingInfo: RatingInfo | undefined = undefined;

                try {
                    const cachedData =
                        await chrome.storage.local.get(tabUrlIdentifier);
                    if (cachedData[tabUrlIdentifier]?.confidence === 'high') {
                        console.log(
                            'Using high-confidence cached mediaInfo:',
                            cachedData[tabUrlIdentifier].mediaInfo
                        );
                        mediaInfoResult =
                            cachedData[tabUrlIdentifier].mediaInfo;
                        confidence = 'high';
                        lookupMethod = 'cache';
                    }
                } catch (e) {
                    console.error('Error checking cache:', e);
                }

                if (confidence !== 'high') {
                    let attemptedTmdbLookup = false;

                    if (siteConfig.usesTmdbId) {
                        attemptedTmdbLookup = true;
                        lookupMethod = 'tmdb_id';
                        console.log('Attempting TMDB ID lookup...');
                        const tmdbId = siteConfig.getTmdbId?.(url);
                        let mediaTypeGuess = siteConfig.getMediaType(url);

                        if (tmdbId) {
                            try {
                                let lookupResults: MediaInfoResponse[] | null =
                                    null;

                                if (mediaTypeGuess === null) {
                                    console.log(
                                        `Media type ambiguous for ID ${tmdbId}, trying both...`
                                    );
                                    try {
                                        lookupResults = await callApi<
                                            MediaInfoResponse[]
                                        >(
                                            `https://api.trakt.tv/search/tmdb/${tmdbId}?type=movie&extended=full`,
                                            'GET'
                                        );
                                    } catch (movieError: any) {
                                        if (
                                            movieError?.message?.includes('404')
                                        )
                                            console.log(
                                                `TMDB movie lookup 404 for ${tmdbId}`
                                            );
                                        else
                                            console.warn(
                                                `TMDB movie lookup failed for ${tmdbId}:`,
                                                movieError
                                            );
                                    }
                                    if (
                                        !lookupResults ||
                                        lookupResults.length === 0
                                    ) {
                                        console.log(
                                            `TMDB movie lookup failed or empty, trying show...`
                                        );
                                        try {
                                            lookupResults = await callApi<
                                                MediaInfoResponse[]
                                            >(
                                                `https://api.trakt.tv/search/tmdb/${tmdbId}?type=show&extended=full`,
                                                'GET'
                                            );
                                        } catch (showError: any) {
                                            if (
                                                showError?.message?.includes(
                                                    '404'
                                                )
                                            )
                                                console.log(
                                                    `TMDB show lookup 404 for ${tmdbId}`
                                                );
                                            else
                                                console.warn(
                                                    `TMDB show lookup failed for ${tmdbId}:`,
                                                    showError
                                                );
                                        }
                                    }
                                } else {
                                    console.log(
                                        `Performing TMDB lookup for ID ${tmdbId} as type '${mediaTypeGuess}'...`
                                    );
                                    try {
                                        lookupResults = await callApi<
                                            MediaInfoResponse[]
                                        >(
                                            `https://api.trakt.tv/search/tmdb/${tmdbId}?type=${mediaTypeGuess}&extended=full`,
                                            'GET'
                                        );
                                    } catch (lookupError: any) {
                                        if (
                                            lookupError?.message?.includes(
                                                '404'
                                            )
                                        )
                                            console.log(
                                                `TMDB lookup 404 for ${tmdbId} as ${mediaTypeGuess}`
                                            );
                                        else
                                            console.error(
                                                `Error during TMDB ID lookup for ${tmdbId} as ${mediaTypeGuess}:`,
                                                lookupError
                                            );
                                    }
                                }

                                if (lookupResults && lookupResults.length > 0) {
                                    mediaInfoResult = lookupResults[0];
                                    confidence = 'high';
                                    console.log(
                                        `TMDB ID lookup successful for ${tmdbId}:`,
                                        mediaInfoResult
                                    );
                                } else {
                                    console.log(
                                        `TMDB ID lookup for ${tmdbId} returned no results.`
                                    );
                                }
                            } catch (error) {
                                console.error(
                                    `Error during TMDB ID lookup API calls for ${tmdbId}:`,
                                    error
                                );
                            }
                        } else {
                            console.log('TMDB ID not found by site config.');
                        }
                    }

                    if (
                        !siteConfig.usesTmdbId ||
                        (attemptedTmdbLookup && mediaInfoResult === null)
                    ) {
                        lookupMethod = 'text_search';
                        console.log('Attempting text search fallback...');
                        try {
                            const fallbackTitle = originalQuery.query;
                            const fallbackYear = originalQuery.years;

                            const mediaType =
                                originalQuery.type ||
                                siteConfig.getMediaType(url);

                            if (fallbackTitle && mediaType) {
                                const searchParams = new URLSearchParams({
                                    query: fallbackTitle
                                });
                                const searchUrl = `https://api.trakt.tv/search/${mediaType}?${searchParams.toString()}&extended=full`;
                                const searchResults = await callApi<
                                    MediaInfoResponse[]
                                >(searchUrl, 'GET');
                                if (searchResults && searchResults.length > 0) {
                                    const scoredResults: ScoredMediaInfo[] =
                                        searchResults
                                            .map(
                                                (
                                                    result:
                                                        | MovieMediaInfo
                                                        | ShowMediaInfo
                                                ): ScoredMediaInfo => ({
                                                    ...result,
                                                    confidenceScore:
                                                        calculateConfidence(
                                                            result,
                                                            fallbackTitle,
                                                            fallbackYear
                                                        )
                                                })
                                            )
                                            .sort(
                                                (
                                                    a: ScoredMediaInfo,
                                                    b: ScoredMediaInfo
                                                ) =>
                                                    b.confidenceScore -
                                                    a.confidenceScore
                                            );

                                    const bestMatch = scoredResults[0];
                                    const CONFIDENCE_THRESHOLD = 70;
                                    if (
                                        bestMatch.confidenceScore >=
                                        CONFIDENCE_THRESHOLD
                                    ) {
                                        mediaInfoResult = bestMatch;
                                        confidence = 'high';
                                        console.log(
                                            `Text search high confidence match (${bestMatch.confidenceScore}):`,
                                            mediaInfoResult
                                        );
                                    } else {
                                        mediaInfoResult = null;
                                        confidence = 'low';
                                        console.log(
                                            `Text search low confidence match (${bestMatch.confidenceScore}).`
                                        );
                                    }
                                } else {
                                    console.log(
                                        'Text search returned no results.'
                                    );
                                }
                            } else {
                                console.error(
                                    'Fallback failed: Missing title/type for text search.'
                                );
                            }
                        } catch (error) {
                            console.error(
                                'Error during text search fallback:',
                                error
                            );
                        }
                    }
                }

                if (confidence === 'high' && mediaInfoResult) {
                    console.log(
                        'High confidence match. Fetching status details...'
                    );

                    watchStatus = { isInHistory: false, isCompleted: false };
                    ratingInfo = { userRating: null };
                    progressInfo = null;

                    try {
                        let traktId: number | undefined = undefined;
                        if (isMovieMediaInfo(mediaInfoResult)) {
                            traktId = mediaInfoResult.movie.ids?.trakt;
                        } else if (isShowMediaInfo(mediaInfoResult)) {
                            traktId = mediaInfoResult.show.ids?.trakt;
                        }

                        if (traktId) {
                            if (isShowMediaInfo(mediaInfoResult)) {
                                try {
                                    progressInfo =
                                        await callApi<TraktShowWatchedProgress>(
                                            `https://api.trakt.tv/shows/${traktId}/progress/watched?hidden=false&specials=false`,
                                            'GET'
                                        );
                                    if (progressInfo) {
                                        if (progressInfo.last_watched_at) {
                                            watchStatus.isInHistory = true;
                                            watchStatus.lastWatchedAt =
                                                progressInfo.last_watched_at;
                                        }

                                        watchStatus.isCompleted =
                                            progressInfo.aired > 0 &&
                                            progressInfo.aired ===
                                                progressInfo.completed;
                                    }
                                } catch (progError) {
                                    console.error(
                                        'Failed to fetch show progress:',
                                        progError
                                    );
                                }
                            } else if (isMovieMediaInfo(mediaInfoResult)) {
                                try {
                                    const movieHistory = await callApi<any[]>(
                                        `https://api.trakt.tv/sync/history/movies/${traktId}?limit=1`,
                                        'GET'
                                    );
                                    if (
                                        movieHistory &&
                                        movieHistory.length > 0
                                    ) {
                                        watchStatus.isInHistory = true;
                                        watchStatus.lastWatchedAt =
                                            movieHistory[0]?.watched_at;
                                    }
                                } catch (histError) {
                                    console.error(
                                        'Failed to fetch movie history:',
                                        histError
                                    );
                                }
                            }

                            try {
                                const itemTypeForRating = isShowMediaInfo(
                                    mediaInfoResult
                                )
                                    ? 'shows'
                                    : 'movies';

                                const ratingResult = await callApi<
                                    TraktRating[]
                                >(
                                    `https://api.trakt.tv/sync/ratings/${itemTypeForRating}/${traktId}`,
                                    'GET'
                                );
                                if (
                                    ratingResult &&
                                    ratingResult.length > 0 &&
                                    ratingResult[0].rating
                                ) {
                                    ratingInfo.userRating =
                                        ratingResult[0].rating;
                                    ratingInfo.ratedAt =
                                        ratingResult[0].rated_at;
                                }
                            } catch (rateError) {
                                console.error(
                                    'Failed to fetch rating:',
                                    rateError
                                );
                            }
                        } else {
                            console.warn(
                                'Could not get Trakt ID from mediaInfoResult to fetch status.'
                            );
                        }

                        console.log('Fetched Status Details:', {
                            watchStatus,
                            progressInfo,
                            ratingInfo
                        });

                        await chrome.storage.local.set({
                            [tabUrlIdentifier]: {
                                mediaInfo: mediaInfoResult,
                                confidence: 'high',
                                lookupMethod: lookupMethod
                            }
                        });
                    } catch (error) {
                        console.error('Error fetching status details:', error);

                        watchStatus = undefined;
                        progressInfo = null;
                        ratingInfo = undefined;
                    }
                }

                const responsePayload: MediaStatusPayload = {
                    mediaInfo: mediaInfoResult,
                    confidence: confidence,
                    originalQuery: originalQuery,
                    watchStatus: watchStatus,
                    progressInfo: progressInfo,
                    ratingInfo: ratingInfo
                };
                const response: MessageResponse<MediaStatusPayload> = {
                    success: true,
                    data: responsePayload
                };
                sendResponse(response);
                return true;
            }

            if (request.action === 'rateItem') {
                const params = request.params as {
                    mediaInfo: MediaInfoResponse;
                    rating: number;
                };
                console.log(
                    `Received rateItem request: Rating ${params.rating}`
                );
                try {
                    const body: {
                        movies?: any[];
                        shows?: any[];
                        episodes?: any[];
                    } = {};
                    const mediaType = params.mediaInfo.type;

                    if (params.rating < 1 || params.rating > 10) {
                        throw new Error(
                            'Invalid rating value. Must be between 1 and 10.'
                        );
                    }

                    let traktId: number | undefined = undefined;
                    if (isMovieMediaInfo(params.mediaInfo)) {
                        traktId = params.mediaInfo.movie.ids?.trakt;
                    } else if (isShowMediaInfo(params.mediaInfo)) {
                        traktId = params.mediaInfo.show.ids?.trakt;
                    }

                    if (!traktId) {
                        throw new Error(
                            'Could not extract Trakt ID to rate item.'
                        );
                    }

                    if (mediaType === 'movie') {
                        body.movies = [
                            { ids: { trakt: traktId }, rating: params.rating }
                        ];
                    } else if (mediaType === 'show') {
                        body.shows = [
                            { ids: { trakt: traktId }, rating: params.rating }
                        ];
                    } else {
                        throw new Error(
                            `Rating type '${mediaType}' not currently supported directly.`
                        );
                    }

                    console.log('Submitting rating to Trakt:', body);
                    const ratingResponse = await callApi(
                        `https://api.trakt.tv/sync/ratings`,
                        'POST',
                        body
                    );
                    console.log('Trakt rating response:', ratingResponse);

                    if (
                        ratingResponse?.not_found &&
                        (ratingResponse.not_found.movies?.length ||
                            ratingResponse.not_found.shows?.length)
                    ) {
                        console.warn(
                            'Trakt reported item not found during rating.'
                        );
                    }

                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Error submitting rating:', error);
                    sendResponse({
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Failed to submit rating.'
                    });
                }
                return true;
            }

            if (request.action === 'manualSearch') {
                const params = request.params as {
                    type: string;
                    query: string;
                };
                console.log('Received manualSearch request:', params);
                try {
                    const searchParams = new URLSearchParams({
                        query: params.query
                    });
                    const searchUrl = `https://api.trakt.tv/search/${params.type}?${searchParams.toString()}&extended=full&limit=10`;
                    const searchResults: (MovieMediaInfo | ShowMediaInfo)[] =
                        await callApi(searchUrl, 'GET');

                    const response: MessageResponse<
                        (MovieMediaInfo | ShowMediaInfo)[]
                    > = {
                        success: true,
                        data: searchResults
                    };
                    sendResponse(response);
                } catch (error) {
                    console.error('Error during manualSearch:', error);
                    const response: MessageResponse<null> = {
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Manual search failed'
                    };
                    sendResponse(response);
                }
                return true;
            }

            if (request.action === 'confirmMedia') {
                const confirmedMedia = request.params as MediaInfoResponse;
                console.log('Received confirmMedia request:', confirmedMedia);
                try {
                    await chrome.storage.local.set({
                        [tabUrlIdentifier]: {
                            mediaInfo: confirmedMedia,
                            confidence: 'high',
                            confirmedAt: Date.now()
                        }
                    });
                    const response: MessageResponse<null> = { success: true };
                    sendResponse(response);
                } catch (error) {
                    console.error('Error saving confirmed media:', error);
                    const response: MessageResponse<null> = {
                        success: false,
                        error: 'Failed to save confirmation'
                    };
                    sendResponse(response);
                }
                return true;
            }

            if (request.action === 'scrobble') {
                const cacheResult =
                    await chrome.storage.local.get(tabUrlIdentifier);
                const cachedItem = cacheResult[tabUrlIdentifier];

                if (
                    !cachedItem ||
                    !cachedItem.mediaInfo ||
                    cachedItem.confidence !== 'high'
                ) {
                    const errorMsg =
                        'Cannot scrobble: Media info not found or not confirmed with high confidence.';
                    console.error(errorMsg, cachedItem);
                    sendResponse({ success: false, error: errorMsg });
                    return true;
                }

                const mediaInfo: MovieMediaInfo | ShowMediaInfo =
                    cachedItem.mediaInfo;
                let body: HistoryBody = {};

                if (mediaInfo.type === 'movie' && 'movie' in mediaInfo) {
                    body.movies = [{ ids: mediaInfo.movie.ids }];
                } else if (mediaInfo.type === 'show' && 'show' in mediaInfo) {
                    const seasonEpisode = siteConfig.getSeasonEpisodeObj(url);
                    if (!seasonEpisode) {
                        sendResponse({
                            success: false,
                            error: 'season episode parse fail for show'
                        });
                        return true;
                    }
                    const { season, number } = seasonEpisode;

                    body.shows = [
                        {
                            ids: mediaInfo.show.ids,
                            seasons: [
                                {
                                    number: season,
                                    episodes: [{ number: number }]
                                }
                            ]
                        }
                    ];
                } else {
                    sendResponse({
                        success: false,
                        error: 'Invalid mediaInfo structure for scrobble'
                    });
                    return true;
                }
                console.log('Scrobble Body:', body);

                try {
                    const addResponse = await callApi(
                        `https://api.trakt.tv/sync/history`,
                        'POST',
                        body
                    );
                    console.log('Trakt Add History Response:', addResponse);

                    const historyResponse = await callApi(
                        `https://api.trakt.tv/sync/history${mediaInfo.type === 'show' ? '/episodes' : ''}?limit=1`,
                        'GET'
                    );

                    if (!historyResponse || historyResponse.length === 0) {
                        throw new Error(
                            'Could not retrieve history ID after scrobble.'
                        );
                    }

                    const traktHistoryId = historyResponse[0].id;
                    console.log('Retrieved Trakt History ID:', traktHistoryId);

                    const response: MessageResponse<ScrobbleResponse> = {
                        success: true,
                        data: { traktHistoryId }
                    };
                    sendResponse(response);
                } catch (error) {
                    console.error('Error during scrobble:', error);
                    const response: MessageResponse<null> = {
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'fail scrobble dawg'
                    };
                    sendResponse(response);
                }
                return true;
            }

            if (request.action === 'undoScrobble') {
                const historyId = request.params.historyId;
                try {
                    await callApi(
                        `https://api.trakt.tv/sync/history/remove`,
                        'POST',
                        { ids: [historyId] }
                    );
                    const response: MessageResponse<null> = { success: true };
                    sendResponse(response);
                } catch (error) {
                    console.error('Error during undoScrobble:', error);
                    const response: MessageResponse<null> = {
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'fail undo scrobble dawg'
                    };
                    sendResponse(response);
                }
                return true;
            }
        })();

        return true;
    }
);
