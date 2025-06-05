import { callApi } from './utils/api';
import { calculateConfidence } from './utils/confidenceHelper';
import { getCurrentSiteConfig } from './utils/siteConfigs';
import { SiteConfigBase } from './utils/siteConfigs/baseConfig';
import { isMovieMediaInfo, isShowMediaInfo } from './utils/typeGuards';
import {
    ActiveScrobbleState,
    HistoryBody,
    HostnameType,
    MediaInfoResponse,
    MediaStatusPayload,
    MessageRequest,
    MessageResponse,
    MovieMediaInfo,
    RatingInfo,
    RequestManualAddToHistoryParams,
    RequestScrobblePauseParams,
    RequestScrobbleStartParams,
    RequestScrobbleStopParams,
    ScrobbleBody,
    ScrobbleResponse,
    ScrobbleStopResponseData,
    SeasonEpisodeObj,
    ShowMediaInfo,
    TraktRating,
    WatchStatusInfo
} from './utils/types';
import { TraktShowWatchedProgress } from './utils/types/traktApi';

export type ScoredMediaInfo = MediaInfoResponse & {
    confidenceScore: number;
};

let activeScrobble: ActiveScrobbleState = {
    tabId: null,
    mediaInfo: null,
    episodeInfo: undefined,
    currentProgress: 0,
    status: 'idle',
    traktMediaType: null,
    lastUpdateTime: 0
};

const TRAKT_SCROBBLE_COMPLETION_THRESHOLD = 80;

function buildTraktScrobblePayload(
    mediaInfo: MediaInfoResponse,
    episodeInfo: SeasonEpisodeObj | undefined | null,
    progress: number
): ScrobbleBody {
    const payload: ScrobbleBody = { progress };

    if (isMovieMediaInfo(mediaInfo)) {
        payload.movie = mediaInfo.movie;
    } else if (isShowMediaInfo(mediaInfo) && episodeInfo) {
        payload.show = mediaInfo.show;
        payload.episode = episodeInfo;
    } else {
        throw new Error(
            'Invalid mediaInfo or missing episodeInfo for show to build scrobble payload'
        );
    }
    return payload;
}

function resetActiveScrobbleState() {
    activeScrobble = {
        tabId: null,
        mediaInfo: null,
        episodeInfo: undefined,
        currentProgress: 0,
        status: 'idle',
        traktMediaType: null,
        lastUpdateTime: 0,
        previousScrobbledUrl: ''
    };
    console.log('Active scrobble state reset.');
}

chrome.runtime.onMessage.addListener(
    (request: MessageRequest, sender, sendResponse) => {
        (async () => {
            const tabId = sender.tab?.id;

            if (!sender.tab || !sender.tab.url) {
                sendResponse({ success: false, error: 'no sender.tab' });
                return true;
            }
            const url = sender.tab.url;
            const urlObj = new URL(url);
            const hostname = urlObj.hostname as HostnameType;
            const siteConfig: SiteConfigBase | null =
                getCurrentSiteConfig(hostname);

            if (
                !siteConfig &&
                request.action !== 'confirmMedia' &&
                request.action !== 'manualSearch' &&
                !request.action.startsWith('requestScrobble') &&
                request.action !== 'requestManualAddToHistory'
            ) {
                if (request.action === 'mediaInfo') {
                    sendResponse({
                        success: false,
                        error: `No site config found for ${hostname}`
                    });
                    return true;
                }
            }

            const tabUrlIdentifier =
                siteConfig?.getUrlIdentifier(url) ||
                (tabId ? `tab-${tabId}-media` : 'unknown-identifier');

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

            if (request.action === 'confirmMedia') {
                const confirmedMedia = request.params as MediaInfoResponse;
                console.log(
                    'Background: confirmMedia request:',
                    confirmedMedia,
                    'for tabUrlIdentifier:',
                    tabUrlIdentifier
                );
                try {
                    await chrome.storage.local.set({
                        [tabUrlIdentifier]: {
                            mediaInfo: confirmedMedia,
                            confidence: 'high',
                            confirmedAt: Date.now()
                        }
                    });
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Error saving confirmed media:', error);
                    sendResponse({
                        success: false,
                        error: 'Failed to save confirmation'
                    });
                }
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

            if (request.action === 'requestScrobbleStart') {
                if (!tabId) {
                    sendResponse({
                        success: false,
                        error: 'Tab ID missing for scrobble start'
                    });
                    return true;
                }
                const params = request.params as RequestScrobbleStartParams;
                console.log(
                    `Background: requestScrobbleStart from tab ${tabId}`,
                    params
                );

                try {
                    // If another tab is actively scrobbling, pause it first
                    if (
                        activeScrobble.tabId &&
                        activeScrobble.tabId !== tabId &&
                        activeScrobble.status === 'started'
                    ) {
                        console.log(
                            `Pausing active scrobble on tab ${activeScrobble.tabId} due to new start on tab ${tabId}`
                        );
                        const oldScrobblePayload = buildTraktScrobblePayload(
                            activeScrobble.mediaInfo!,
                            activeScrobble.episodeInfo,
                            activeScrobble.currentProgress
                        );
                        await callApi(
                            `https://api.trakt.tv/scrobble/pause`,
                            'POST',
                            oldScrobblePayload
                        );
                        // Update state for the old scrobble, though it's effectively superseded
                        if (activeScrobble.tabId) {
                            // Check just in case
                            // We don't clear activeScrobble fully here, it will be overwritten by the new one.
                        }
                    }

                    const payload = buildTraktScrobblePayload(
                        params.mediaInfo,
                        params.episodeInfo,
                        params.progress
                    );
                    await callApi(
                        `https://api.trakt.tv/scrobble/start`,
                        'POST',
                        payload
                    );

                    activeScrobble = {
                        tabId: tabId,
                        mediaInfo: params.mediaInfo,
                        episodeInfo: params.episodeInfo,
                        currentProgress: params.progress,
                        status: 'started',
                        traktMediaType: isMovieMediaInfo(params.mediaInfo)
                            ? 'movie'
                            : 'episode',
                        lastUpdateTime: Date.now(),
                        previousScrobbledUrl: url
                    };
                    console.log(
                        'Background: Scrobble started successfully. ActiveScrobble:',
                        activeScrobble
                    );
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Error during scrobble/start:', error);
                    sendResponse({
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Scrobble start failed'
                    });
                }
                return true;
            }

            if (request.action === 'requestScrobblePause') {
                if (!tabId) {
                    sendResponse({
                        success: false,
                        error: 'Tab ID missing for scrobble pause'
                    });
                    return true;
                }
                const params = request.params as RequestScrobblePauseParams;
                console.log(
                    `Background: requestScrobblePause from tab ${tabId}`,
                    params
                );

                if (
                    activeScrobble.tabId !== tabId ||
                    activeScrobble.status !== 'started'
                ) {
                    console.warn(
                        'Received pause request for a non-active or non-matching scrobble. Ignoring.'
                    );
                    sendResponse({
                        success: false,
                        error: 'Scrobble not active on this tab or not started.'
                    });
                    return true;
                }

                try {
                    const payload = buildTraktScrobblePayload(
                        params.mediaInfo,
                        params.episodeInfo,
                        params.progress
                    );
                    await callApi(
                        `https://api.trakt.tv/scrobble/pause`,
                        'POST',
                        payload
                    );

                    activeScrobble.currentProgress = params.progress;
                    activeScrobble.status = 'paused';
                    activeScrobble.lastUpdateTime = Date.now();
                    console.log(
                        'Background: Scrobble paused successfully. ActiveScrobble:',
                        activeScrobble
                    );
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('Error during scrobble/pause:', error);
                    sendResponse({
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Scrobble pause failed'
                    });
                }
                return true;
            }

            if (request.action === 'requestScrobbleStop') {
                if (!tabId) {
                    sendResponse({
                        success: false,
                        error: 'Tab ID missing for scrobble stop'
                    });
                    return true;
                }
                const params = request.params as RequestScrobbleStopParams;
                console.log(
                    `Background: requestScrobbleStop from tab ${tabId}`,
                    params
                );

                if (activeScrobble.tabId !== tabId) {
                    console.warn(
                        'Received stop request for a non-active or non-matching scrobble. Ignoring.'
                    );
                    sendResponse({
                        success: false,
                        error: 'Scrobble not active on this tab for stop.'
                    });
                    return true;
                }

                let responseData: ScrobbleStopResponseData = {
                    action: 'error'
                };

                try {
                    const payload = buildTraktScrobblePayload(
                        params.mediaInfo,
                        params.episodeInfo,
                        params.progress
                    );
                    const traktResponse = await callApi<any>(
                        `https://api.trakt.tv/scrobble/stop`,
                        'POST',
                        payload
                    );
                    console.log('Trakt stop response:', traktResponse);

                    if (
                        params.progress >= TRAKT_SCROBBLE_COMPLETION_THRESHOLD
                    ) {
                        responseData = {
                            action: 'watched',
                            traktHistoryId:
                                traktResponse?.id ||
                                (traktResponse?.action === 'scrobble'
                                    ? traktResponse[
                                          activeScrobble.traktMediaType!
                                      ]?.ids?.trakt
                                    : undefined)
                            // Trakt's stop response is a bit inconsistent. Sometimes it gives a direct ID,
                            // sometimes it gives the media object with its ID under 'movie' or 'episode'.
                            // We might need to refine history ID extraction based on actual responses.
                            // A more robust way to get history ID might be a subsequent /sync/history call if traktResponse.id is not present.
                        };
                        console.log(
                            'Background: Scrobble stopped (watched). Progress:',
                            params.progress
                        );
                    } else {
                        responseData = { action: 'paused_incomplete' };
                        console.log(
                            'Background: Scrobble stopped (incomplete). Progress:',
                            params.progress
                        );
                    }

                    resetActiveScrobbleState();
                    sendResponse({ success: true, data: responseData });
                } catch (error) {
                    console.error('Error during scrobble/stop:', error);
                    // Don't reset activeScrobble on error, content script might retry or handle. Or do reset?
                    // For now, let's assume content script will manage if stop fails.
                    // resetActiveScrobbleState(); // Or perhaps not, to allow retries.
                    sendResponse({
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Scrobble stop failed',
                        data: responseData
                    });
                }
                return true;
            }

            if (request.action === 'requestManualAddToHistory') {
                const params =
                    request.params as RequestManualAddToHistoryParams;
                console.log(`Background: requestManualAddToHistory`, params);

                const historyBody: HistoryBody = {};
                if (isMovieMediaInfo(params.mediaInfo)) {
                    historyBody.movies = [{ ids: params.mediaInfo.movie.ids }];
                } else if (
                    isShowMediaInfo(params.mediaInfo) &&
                    params.episodeInfo
                ) {
                    historyBody.shows = [
                        {
                            ids: params.mediaInfo.show.ids,
                            seasons: [
                                {
                                    number: params.episodeInfo.season,
                                    episodes: [
                                        { number: params.episodeInfo.number }
                                    ]
                                }
                            ]
                        }
                    ];
                } else {
                    sendResponse({
                        success: false,
                        error: 'Invalid media for manual history add'
                    });
                    return true;
                }

                try {
                    const addResponse = await callApi(
                        `https://api.trakt.tv/sync/history`,
                        'POST',
                        historyBody
                    );
                    console.log(
                        'Trakt Manual Add History Response:',
                        addResponse
                    );

                    // To get history ID, similar to old scrobble logic:
                    // This part needs testing with /sync/history to see if it returns IDs directly
                    // or if a subsequent fetch is needed.
                    // For simplicity, we'll assume it might not return an ID directly here.
                    // The ScrobbleNotification for manual add might not need an undo for now.
                    const historyResponse = await callApi(
                        `https://api.trakt.tv/sync/history${isMovieMediaInfo(params.mediaInfo) ? '/movies' : '/episodes'}/${isMovieMediaInfo(params.mediaInfo) ? params.mediaInfo.movie.ids.trakt : params.mediaInfo.show.ids.trakt}?limit=1`,
                        'GET'
                    );

                    let traktHistoryId: number | undefined;
                    if (
                        Array.isArray(historyResponse) &&
                        historyResponse.length > 0 &&
                        historyResponse[0].id
                    ) {
                        traktHistoryId = historyResponse[0].id;
                    } else if (
                        addResponse?.added?.movies ||
                        addResponse?.added?.shows ||
                        addResponse?.added?.episodes
                    ) {
                        // If the /sync/history response indicates success but no direct ID,
                        // and we don't have an easy way to get the ID, we'll proceed without it for manual add's undo.
                        console.log(
                            'Manual add successful, but history ID not directly available for undo.'
                        );
                    }

                    sendResponse({
                        success: true,
                        data: { traktHistoryId } as ScrobbleResponse
                    });
                } catch (error) {
                    console.error('Error during manual add to history:', error);
                    sendResponse({
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Manual history add failed'
                    });
                }
                return true;
            }

            if (request.action === 'scrobble') {
                console.warn(
                    "Legacy 'scrobble' action called. This should be phased out."
                );

                sendResponse({
                    success: false,
                    error: 'Legacy scrobble not fully implemented here yet'
                });
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
                    sendResponse({ success: true });
                } catch (error) {
                    sendResponse({
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Undo failed'
                    });
                }
                return true;
            }

            // Default for unhandled actions
        })();
        return true;
    }
);

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    if (activeScrobble.tabId === tabId && activeScrobble.mediaInfo) {
        console.log(
            `Background: Tab ${tabId} (active scrobble) removed. Status: ${activeScrobble.status}, Progress: ${activeScrobble.currentProgress}%`
        );

        if (
            (activeScrobble.status === 'started' ||
                activeScrobble.status === 'paused') &&
            activeScrobble.currentProgress >=
                TRAKT_SCROBBLE_COMPLETION_THRESHOLD
        ) {
            try {
                console.log(
                    `Attempting to STOP scrobble for closed tab ${tabId} as progress was sufficient.`
                );
                const payload = buildTraktScrobblePayload(
                    activeScrobble.mediaInfo,
                    activeScrobble.episodeInfo,
                    activeScrobble.currentProgress
                );
                await callApi(
                    `https://api.trakt.tv/scrobble/stop`,
                    'POST',
                    payload
                );
                console.log(`Scrobble STOPPED for closed tab ${tabId}.`);
            } catch (error) {
                console.error(
                    `Error STOPPING scrobble for closed tab ${tabId}:`,
                    error
                );
            }
        } else if (activeScrobble.status === 'started') {
            try {
                console.log(
                    `Attempting to PAUSE scrobble for closed tab ${tabId} as progress was insufficient for stop.`
                );
                const payload = buildTraktScrobblePayload(
                    activeScrobble.mediaInfo,
                    activeScrobble.episodeInfo,
                    activeScrobble.currentProgress
                );
                await callApi(
                    `https://api.trakt.tv/scrobble/pause`,
                    'POST',
                    payload
                );
                console.log(`Scrobble PAUSED for closed tab ${tabId}.`);
            } catch (error) {
                console.error(
                    `Error PAUSING scrobble for closed tab ${tabId}:`,
                    error
                );
            }
        }

        resetActiveScrobbleState();
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (
        activeScrobble.tabId === tabId &&
        changeInfo.url &&
        activeScrobble.mediaInfo &&
        tab.url
    ) {
        // More robust check: if the new URL is for a different media item or not a watch page
        // const newUrlSiteConfig = getCurrentSiteConfig(
        //     new URL(tab.url).hostname as HostnameType
        // );
        // const oldMediaUrlIdentifier = siteConfig?.getUrlIdentifier(
        //     activeScrobble.previousScrobbledUrl || ''
        // ); // Need to store previous URL
        // const newMediaUrlIdentifier = newUrlSiteConfig?.getUrlIdentifier(
        //     tab.url
        // );

        // A simple check: if the base path of the scrobbled media's URL no longer matches the new tab URL's path
        // This is a heuristic and might need refinement based on how your getUrlIdentifier works.
        // A robust way is if newMediaUrlIdentifier implies a *different* media item or not a watch page.
        let navigatedAwayFromMedia = false;
        if (activeScrobble.mediaInfo && activeScrobble.previousScrobbledUrl) {
            // Store previousScrobbledUrl in activeScrobble
            const oldScrobbledUrl = new URL(
                activeScrobble.previousScrobbledUrl
            );
            const newCurrentUrl = new URL(tab.url);
            if (oldScrobbledUrl.pathname !== newCurrentUrl.pathname) {
                // Basic path check
                navigatedAwayFromMedia = true;
            }
            // More advanced:
            // const oldScrobbledMediaId = siteConfig?.getTmdbId?.(activeScrobble.previousScrobbledUrl) || siteConfig?.getTitle(activeScrobble.previousScrobbledUrl);
            // const newPotentialMediaId = newUrlSiteConfig?.getTmdbId?.(tab.url) || newUrlSiteConfig?.getTitle(tab.url);
            // if (oldScrobbledMediaId !== newPotentialMediaId) navigatedAwayFromMedia = true;
        } else {
            navigatedAwayFromMedia = true; // If no previous URL, assume navigation away
        }

        if (navigatedAwayFromMedia) {
            console.log(
                `Background: Tab ${tabId} (active scrobble) navigated away. Status: ${activeScrobble.status}, Progress: ${activeScrobble.currentProgress}%`
            );
            if (
                (activeScrobble.status === 'started' ||
                    activeScrobble.status === 'paused') &&
                activeScrobble.currentProgress >=
                    TRAKT_SCROBBLE_COMPLETION_THRESHOLD
            ) {
                try {
                    console.log(
                        `Attempting to STOP scrobble for navigated tab ${tabId}.`
                    );
                    const payload = buildTraktScrobblePayload(
                        activeScrobble.mediaInfo,
                        activeScrobble.episodeInfo,
                        activeScrobble.currentProgress
                    );
                    await callApi(
                        `https://api.trakt.tv/scrobble/stop`,
                        'POST',
                        payload
                    );
                    console.log(`Scrobble STOPPED for navigated tab ${tabId}.`);
                } catch (error) {
                    console.error(
                        `Error STOPPING scrobble for navigated tab ${tabId}:`,
                        error
                    );
                }
            } else if (activeScrobble.status === 'started') {
                try {
                    console.log(
                        `Attempting to PAUSE scrobble for navigated tab ${tabId}.`
                    );
                    const payload = buildTraktScrobblePayload(
                        activeScrobble.mediaInfo,
                        activeScrobble.episodeInfo,
                        activeScrobble.currentProgress
                    );
                    await callApi(
                        `https://api.trakt.tv/scrobble/pause`,
                        'POST',
                        payload
                    );
                    console.log(`Scrobble PAUSED for navigated tab ${tabId}.`);
                } catch (error) {
                    console.error(
                        `Error PAUSING scrobble for navigated tab ${tabId}:`,
                        error
                    );
                }
            }
            resetActiveScrobbleState();
        }
    }
});
