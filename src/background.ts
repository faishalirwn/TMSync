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
    MediaRatings,
    MediaStatusPayload,
    MessageRequest,
    MessageResponse,
    MovieMediaInfo,
    RequestManualAddToHistoryParams,
    RequestScrobblePauseParams,
    RequestScrobbleStartParams,
    RequestScrobbleStopParams,
    ScrobbleBody,
    ScrobbleResponse,
    ScrobbleStopResponseData,
    SeasonEpisodeObj,
    ShowMediaInfo,
    TraktComment,
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

let cachedUsername: string | null = null;
async function getUsername(): Promise<string> {
    if (cachedUsername) return cachedUsername;

    const data = await chrome.storage.local.get('traktUsername');
    if (data.traktUsername) {
        cachedUsername = data.traktUsername;
        return data.traktUsername;
    }

    console.log('Username not cached, fetching from Trakt settings...');
    const settings = await callApi<any>(
        'https://api.trakt.tv/users/settings',
        'GET'
    );
    const username = settings?.user?.username;

    if (username) {
        cachedUsername = username;
        await chrome.storage.local.set({ traktUsername: username });
        return username;
    }

    throw new Error(
        'Could not determine Trakt username. The user might need to re-authenticate.'
    );
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
                !request.action.startsWith('rate') &&
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
                let ratingInfo: MediaRatings = {};

                try {
                    const cachedData =
                        await chrome.storage.local.get(tabUrlIdentifier);
                    if (cachedData[tabUrlIdentifier]?.confidence === 'high') {
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
                        const tmdbId = siteConfig.getTmdbId?.(url);
                        let mediaTypeGuess = siteConfig.getMediaType(url);

                        if (tmdbId) {
                            try {
                                let lookupResults: MediaInfoResponse[] | null =
                                    null;

                                if (mediaTypeGuess === null) {
                                    try {
                                        lookupResults = await callApi<
                                            MediaInfoResponse[]
                                        >(
                                            `https://api.trakt.tv/search/tmdb/${tmdbId}?type=movie&extended=full`,
                                            'GET'
                                        );
                                    } catch (movieError: any) {
                                        //Ignore
                                    }
                                    if (
                                        !lookupResults ||
                                        lookupResults.length === 0
                                    ) {
                                        try {
                                            lookupResults = await callApi<
                                                MediaInfoResponse[]
                                            >(
                                                `https://api.trakt.tv/search/tmdb/${tmdbId}?type=show&extended=full`,
                                                'GET'
                                            );
                                        } catch (showError: any) {
                                            //Ignore
                                        }
                                    }
                                } else {
                                    try {
                                        lookupResults = await callApi<
                                            MediaInfoResponse[]
                                        >(
                                            `https://api.trakt.tv/search/tmdb/${tmdbId}?type=${mediaTypeGuess}&extended=full`,
                                            'GET'
                                        );
                                    } catch (lookupError: any) {
                                        //Ignore
                                    }
                                }

                                if (lookupResults && lookupResults.length > 0) {
                                    mediaInfoResult = lookupResults[0];
                                    confidence = 'high';
                                }
                            } catch (error) {
                                //Ignore
                            }
                        }
                    }

                    if (
                        !siteConfig.usesTmdbId ||
                        (attemptedTmdbLookup && mediaInfoResult === null)
                    ) {
                        lookupMethod = 'text_search';
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
                                    const scoredResults = searchResults
                                        .map(
                                            (result): ScoredMediaInfo => ({
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
                                            (a, b) =>
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
                                    } else {
                                        mediaInfoResult = null;
                                        confidence = 'low';
                                    }
                                }
                            }
                        } catch (error) {
                            //Ignore
                        }
                    }
                }

                if (confidence === 'high' && mediaInfoResult) {
                    console.log(
                        'High confidence match. Fetching status details...'
                    );

                    watchStatus = { isInHistory: false, isCompleted: false };
                    progressInfo = null;
                    ratingInfo = {};

                    try {
                        let movieTraktId: number | undefined;
                        let showTraktId: number | undefined;

                        if (isMovieMediaInfo(mediaInfoResult)) {
                            movieTraktId = mediaInfoResult.movie.ids?.trakt;
                        } else if (isShowMediaInfo(mediaInfoResult)) {
                            showTraktId = mediaInfoResult.show.ids?.trakt;
                        }

                        if (movieTraktId) {
                            try {
                                const movieHistory = await callApi<any[]>(
                                    `https://api.trakt.tv/sync/history/movies/${movieTraktId}?limit=1`,
                                    'GET',
                                    null,
                                    true
                                );
                                if (movieHistory?.[0]?.watched_at) {
                                    watchStatus.isInHistory = true;
                                    watchStatus.lastWatchedAt =
                                        movieHistory[0].watched_at;
                                }
                            } catch (e) {
                                console.warn('Error fetching movie history', e);
                            }

                            try {
                                const allMovieRatings = await callApi<any[]>(
                                    `https://api.trakt.tv/sync/ratings/movies`,
                                    'GET',
                                    null,
                                    true
                                );
                                const movieRating = allMovieRatings.find(
                                    (r) => r.movie.ids.trakt === movieTraktId
                                );
                                if (movieRating) {
                                    ratingInfo.show = {
                                        userRating: movieRating.rating,
                                        ratedAt: movieRating.rated_at
                                    };
                                }
                            } catch (e) {
                                console.warn('Error fetching movie ratings', e);
                            }
                        } else if (showTraktId) {
                            try {
                                progressInfo =
                                    await callApi<TraktShowWatchedProgress>(
                                        `https://api.trakt.tv/shows/${showTraktId}/progress/watched?hidden=false&specials=false`,
                                        'GET',
                                        null,
                                        true
                                    );
                                if (progressInfo?.last_watched_at) {
                                    watchStatus.isInHistory = true;
                                    watchStatus.lastWatchedAt =
                                        progressInfo.last_watched_at;
                                }
                                watchStatus.isCompleted =
                                    progressInfo?.aired > 0 &&
                                    progressInfo.aired ===
                                        progressInfo.completed;
                            } catch (e) {
                                console.warn('Error fetching show progress', e);
                            }

                            try {
                                const allShowRatings = await callApi<any[]>(
                                    `https://api.trakt.tv/sync/ratings/shows`,
                                    'GET',
                                    null,
                                    true
                                );
                                const showRating = allShowRatings.find(
                                    (r) => r.show.ids.trakt === showTraktId
                                );
                                if (showRating) {
                                    ratingInfo.show = {
                                        userRating: showRating.rating,
                                        ratedAt: showRating.rated_at
                                    };
                                }
                            } catch (e) {
                                console.warn('Error fetching show ratings', e);
                            }

                            const episodeInfo =
                                siteConfig.getSeasonEpisodeObj(url);
                            if (episodeInfo) {
                                try {
                                    const [
                                        allSeasonRatings,
                                        allEpisodeRatings
                                    ] = await Promise.all([
                                        callApi<any[]>(
                                            `https://api.trakt.tv/sync/ratings/seasons`,
                                            'GET',
                                            null,
                                            true
                                        ).catch(() => []),
                                        callApi<any[]>(
                                            `https://api.trakt.tv/sync/ratings/episodes`,
                                            'GET',
                                            null,
                                            true
                                        ).catch(() => [])
                                    ]);

                                    const seasonRating = allSeasonRatings.find(
                                        (r) =>
                                            r.show.ids.trakt === showTraktId &&
                                            r.season.number ===
                                                episodeInfo.season
                                    );
                                    if (seasonRating) {
                                        ratingInfo.season = {
                                            userRating: seasonRating.rating,
                                            ratedAt: seasonRating.rated_at
                                        };
                                    }

                                    const episodeRating =
                                        allEpisodeRatings.find(
                                            (r) =>
                                                r.show.ids.trakt ===
                                                    showTraktId &&
                                                r.episode.season ===
                                                    episodeInfo.season &&
                                                r.episode.number ===
                                                    episodeInfo.number
                                        );
                                    if (episodeRating) {
                                        ratingInfo.episode = {
                                            userRating: episodeRating.rating,
                                            ratedAt: episodeRating.rated_at
                                        };
                                    }
                                } catch (epError) {
                                    console.warn(
                                        'Could not fetch season/episode ratings.',
                                        epError
                                    );
                                }
                            }
                        }

                        await chrome.storage.local.set({
                            [tabUrlIdentifier]: {
                                mediaInfo: mediaInfoResult,
                                confidence: 'high',
                                lookupMethod: lookupMethod
                            }
                        });
                    } catch (error) {
                        console.error('Error fetching status details:', error);
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
                sendResponse({ success: true, data: responsePayload });
                return true;
            }

            if (request.action === 'confirmMedia') {
                const confirmedMedia = request.params as MediaInfoResponse;
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
                    sendResponse({
                        success: false,
                        error: 'Failed to save confirmation'
                    });
                }
                return true;
            }

            if (
                request.action === 'rateShow' ||
                request.action === 'rateMovie'
            ) {
                const params = request.params as any;
                const { mediaInfo, rating } = params;

                const body: { movies?: any[]; shows?: any[] } = {};
                const item = { ids: mediaInfo[mediaInfo.type].ids, rating };

                if (request.action === 'rateMovie') body.movies = [item];
                else body.shows = [item];

                try {
                    await callApi(
                        `https://api.trakt.tv/sync/ratings`,
                        'POST',
                        body
                    );
                    sendResponse({ success: true });
                } catch (error) {
                    sendResponse({
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Rating failed'
                    });
                }
                return true;
            }

            if (
                request.action === 'rateSeason' ||
                request.action === 'rateEpisode'
            ) {
                const params = request.params as any;
                const { mediaInfo, episodeInfo, rating } = params;

                const body: { seasons?: any[]; episodes?: any[] } = {};

                try {
                    if (request.action === 'rateEpisode') {
                        const epDetails = await callApi<any>(
                            `https://api.trakt.tv/shows/${mediaInfo.show.ids.trakt}/seasons/${episodeInfo.season}/episodes/${episodeInfo.number}`
                        );
                        const episodeTraktId = epDetails?.ids?.trakt;
                        if (!episodeTraktId)
                            throw new Error(
                                'Could not find Trakt ID for the episode.'
                            );
                        body.episodes = [
                            { ids: { trakt: episodeTraktId }, rating }
                        ];
                    } else {
                        const seasons = await callApi<any[]>(
                            `https://api.trakt.tv/shows/${mediaInfo.show.ids.trakt}/seasons`
                        );
                        const seasonTraktId = seasons.find(
                            (s) => s.number === episodeInfo.season
                        )?.ids?.trakt;
                        if (!seasonTraktId)
                            throw new Error(
                                'Could not find Trakt ID for the season.'
                            );
                        body.seasons = [
                            { ids: { trakt: seasonTraktId }, rating }
                        ];
                    }

                    await callApi(
                        `https://api.trakt.tv/sync/ratings`,
                        'POST',
                        body
                    );
                    sendResponse({ success: true });
                } catch (error) {
                    sendResponse({
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Rating failed'
                    });
                }
                return true;
            }

            if (request.action === 'manualSearch') {
                const params = request.params as {
                    type: string;
                    query: string;
                };
                try {
                    const searchParams = new URLSearchParams({
                        query: params.query
                    });
                    const searchUrl = `https://api.trakt.tv/search/${params.type}?${searchParams.toString()}&extended=full&limit=10`;
                    const searchResults: (MovieMediaInfo | ShowMediaInfo)[] =
                        await callApi(searchUrl, 'GET');

                    sendResponse({
                        success: true,
                        data: searchResults
                    });
                } catch (error) {
                    sendResponse({
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Manual search failed'
                    });
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

                try {
                    if (
                        activeScrobble.tabId &&
                        activeScrobble.tabId !== tabId &&
                        activeScrobble.status === 'started'
                    ) {
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
                    sendResponse({ success: true });
                } catch (error) {
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

                if (
                    activeScrobble.tabId !== tabId ||
                    activeScrobble.status !== 'started'
                ) {
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
                    sendResponse({ success: true });
                } catch (error) {
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

                if (activeScrobble.tabId !== tabId) {
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
                        };
                    } else {
                        responseData = { action: 'paused_incomplete' };
                    }

                    resetActiveScrobbleState();
                    sendResponse({ success: true, data: responseData });
                } catch (error) {
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
                    }

                    sendResponse({
                        success: true,
                        data: { traktHistoryId } as ScrobbleResponse
                    });
                } catch (error) {
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

            if (request.action === 'getComments') {
                const { type, mediaInfo, episodeInfo } = request.params;
                try {
                    const username = await getUsername();
                    const url = `https://api.trakt.tv/users/${username}/comments/${type}s/all`;
                    const allComments = await callApi<any[]>(
                        url,
                        'GET',
                        null,
                        true
                    );

                    let filteredComments: TraktComment[] = [];

                    if (type === 'movie' && isMovieMediaInfo(mediaInfo)) {
                        const id = mediaInfo.movie.ids.trakt;
                        filteredComments = allComments
                            .filter((c) => c.movie?.ids?.trakt === id)
                            .map((c) => c.comment);
                    } else if (type === 'show' && isShowMediaInfo(mediaInfo)) {
                        const id = mediaInfo.show.ids.trakt;
                        filteredComments = allComments
                            .filter((c) => c.show?.ids?.trakt === id)
                            .map((c) => c.comment);
                    } else if (
                        type === 'season' &&
                        isShowMediaInfo(mediaInfo) &&
                        episodeInfo
                    ) {
                        const id = mediaInfo.show.ids.trakt;
                        filteredComments = allComments
                            .filter(
                                (c) =>
                                    c.show?.ids?.trakt === id &&
                                    c.season?.number === episodeInfo.season
                            )
                            .map((c) => c.comment);
                    } else if (
                        type === 'episode' &&
                        isShowMediaInfo(mediaInfo) &&
                        episodeInfo
                    ) {
                        const id = mediaInfo.show.ids.trakt;
                        filteredComments = allComments
                            .filter(
                                (c) =>
                                    c.show?.ids?.trakt === id &&
                                    c.episode?.season === episodeInfo.season &&
                                    c.episode?.number === episodeInfo.number
                            )
                            .map((c) => c.comment);
                    }

                    sendResponse({ success: true, data: filteredComments });
                } catch (e) {
                    sendResponse({
                        success: false,
                        error:
                            e instanceof Error
                                ? e.message
                                : 'Failed to get comments.'
                    });
                }
                return true;
            }

            if (request.action === 'postComment') {
                const { type, mediaInfo, episodeInfo, comment, spoiler } =
                    request.params;
                const body: any = { comment, spoiler };

                try {
                    if (type === 'movie' && isMovieMediaInfo(mediaInfo)) {
                        body.movie = { ids: mediaInfo.movie.ids };
                    } else if (type === 'show' && isShowMediaInfo(mediaInfo)) {
                        body.show = { ids: mediaInfo.show.ids };
                    } else if (
                        type === 'season' &&
                        isShowMediaInfo(mediaInfo) &&
                        episodeInfo
                    ) {
                        const seasons = await callApi<any[]>(
                            `https://api.trakt.tv/shows/${mediaInfo.show.ids.trakt}/seasons`
                        );
                        const seasonId = seasons.find(
                            (s) => s.number === episodeInfo.season
                        )?.ids?.trakt;
                        if (!seasonId)
                            throw new Error(
                                'Could not find Trakt ID for the season.'
                            );
                        body.season = { ids: { trakt: seasonId } };
                    } else if (
                        type === 'episode' &&
                        isShowMediaInfo(mediaInfo) &&
                        episodeInfo
                    ) {
                        const epDetails = await callApi<any>(
                            `https://api.trakt.tv/shows/${mediaInfo.show.ids.trakt}/seasons/${episodeInfo.season}/episodes/${episodeInfo.number}`
                        );
                        const episodeId = epDetails?.ids?.trakt;
                        if (!episodeId)
                            throw new Error(
                                'Could not find Trakt ID for the episode.'
                            );
                        body.episode = { ids: { trakt: episodeId } };
                    } else {
                        throw new Error(
                            'Invalid media type for posting comment.'
                        );
                    }

                    const newComment = await callApi<TraktComment>(
                        'https://api.trakt.tv/comments',
                        'POST',
                        body,
                        true
                    );
                    sendResponse({ success: true, data: newComment });
                } catch (e) {
                    sendResponse({
                        success: false,
                        error:
                            e instanceof Error
                                ? e.message
                                : 'Failed to post comment.'
                    });
                }
                return true;
            }

            if (request.action === 'updateComment') {
                const { commentId, comment, spoiler } = request.params;
                try {
                    const updatedComment = await callApi<TraktComment>(
                        `https://api.trakt.tv/comments/${commentId}`,
                        'PUT',
                        { comment, spoiler },
                        true
                    );
                    sendResponse({ success: true, data: updatedComment });
                } catch (e) {
                    sendResponse({
                        success: false,
                        error:
                            e instanceof Error
                                ? e.message
                                : 'Failed to update comment.'
                    });
                }
                return true;
            }

            if (request.action === 'deleteComment') {
                const { commentId } = request.params;
                try {
                    await callApi<void>(
                        `https://api.trakt.tv/comments/${commentId}`,
                        'DELETE',
                        null,
                        true
                    );
                    sendResponse({ success: true });
                } catch (e) {
                    sendResponse({
                        success: false,
                        error:
                            e instanceof Error
                                ? e.message
                                : 'Failed to delete comment.'
                    });
                }
                return true;
            }
        })();
        return true;
    }
);

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
    if (activeScrobble.tabId === tabId && activeScrobble.mediaInfo) {
        if (
            (activeScrobble.status === 'started' ||
                activeScrobble.status === 'paused') &&
            activeScrobble.currentProgress >=
                TRAKT_SCROBBLE_COMPLETION_THRESHOLD
        ) {
            try {
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
            } catch (error) {
                //Ignore
            }
        } else if (activeScrobble.status === 'started') {
            try {
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
            } catch (error) {
                //Ignore
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
        let navigatedAwayFromMedia = false;
        if (activeScrobble.mediaInfo && activeScrobble.previousScrobbledUrl) {
            const oldScrobbledUrl = new URL(
                activeScrobble.previousScrobbledUrl
            );
            const newCurrentUrl = new URL(tab.url);
            if (oldScrobbledUrl.pathname !== newCurrentUrl.pathname) {
                navigatedAwayFromMedia = true;
            }
        } else {
            navigatedAwayFromMedia = true;
        }

        if (navigatedAwayFromMedia) {
            if (
                (activeScrobble.status === 'started' ||
                    activeScrobble.status === 'paused') &&
                activeScrobble.currentProgress >=
                    TRAKT_SCROBBLE_COMPLETION_THRESHOLD
            ) {
                try {
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
                } catch (error) {
                    //Ignore
                }
            } else if (activeScrobble.status === 'started') {
                try {
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
                } catch (error) {
                    //Ignore
                }
            }
            resetActiveScrobbleState();
        }
    }
});
