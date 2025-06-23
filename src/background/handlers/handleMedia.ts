import { callApi } from '../../utils/api';
import { calculateConfidence } from '../../utils/confidenceHelper';
import { getCurrentSiteConfig } from '../../utils/siteConfigs';
import { isMovieMediaInfo, isShowMediaInfo } from '../../utils/typeGuards';
import {
    MediaInfoResponse,
    MediaRatings,
    MediaStatusPayload,
    MovieMediaInfo,
    ShowMediaInfo,
    WatchStatusInfo
} from '../../utils/types';
import { TraktShowWatchedProgress } from '../../utils/types/traktApi';

// Define the missing type locally
export type ScoredMediaInfo = MediaInfoResponse & {
    confidenceScore: number;
};

async function fetchStatusDetails(mediaInfo: MediaInfoResponse, url: string) {
    const siteConfig = getCurrentSiteConfig(new URL(url).hostname);
    if (!siteConfig)
        throw new Error('Could not get site config for status details.');

    const watchStatus: WatchStatusInfo = {
        isInHistory: false,
        isCompleted: false
    };
    let progressInfo: TraktShowWatchedProgress | null = null;
    const ratingInfo: MediaRatings = {};
    const movieTraktId = isMovieMediaInfo(mediaInfo)
        ? mediaInfo.movie.ids?.trakt
        : undefined;
    const showTraktId = isShowMediaInfo(mediaInfo)
        ? mediaInfo.show.ids?.trakt
        : undefined;

    if (movieTraktId) {
        const [history, ratings] = await Promise.all([
            callApi<any[]>(
                `https://api.trakt.tv/sync/history/movies/${movieTraktId}?limit=1`
            ).catch(() => []),
            callApi<any[]>(`https://api.trakt.tv/sync/ratings/movies`).catch(
                () => []
            )
        ]);
        if (history?.[0]?.watched_at) {
            watchStatus.isInHistory = true;
            watchStatus.lastWatchedAt = history[0].watched_at;
        }
        const movieRating = ratings.find(
            (r) => r.movie.ids.trakt === movieTraktId
        );
        if (movieRating)
            ratingInfo.show = {
                userRating: movieRating.rating,
                ratedAt: movieRating.rated_at
            };
    } else if (showTraktId) {
        progressInfo = await callApi<TraktShowWatchedProgress>(
            `https://api.trakt.tv/shows/${showTraktId}/progress/watched?hidden=false&specials=false`
        ).catch(() => null);
        if (progressInfo?.last_watched_at) {
            watchStatus.isInHistory = true;
            watchStatus.lastWatchedAt = progressInfo.last_watched_at;
        }
        watchStatus.isCompleted =
            !!progressInfo &&
            progressInfo.aired > 0 &&
            progressInfo.aired === progressInfo.completed;

        const [showRatings, seasonRatings, episodeRatings] = await Promise.all([
            callApi<any[]>(`https://api.trakt.tv/sync/ratings/shows`).catch(
                () => []
            ),
            callApi<any[]>(`https://api.trakt.tv/sync/ratings/seasons`).catch(
                () => []
            ),
            callApi<any[]>(`https://api.trakt.tv/sync/ratings/episodes`).catch(
                () => []
            )
        ]);

        const showRating = showRatings.find(
            (r) => r.show.ids.trakt === showTraktId
        );
        if (showRating)
            ratingInfo.show = {
                userRating: showRating.rating,
                ratedAt: showRating.rated_at
            };

        const episodeInfo = siteConfig.getSeasonEpisodeObj(url);
        if (episodeInfo) {
            const seasonRating = seasonRatings.find(
                (r) =>
                    r.show.ids.trakt === showTraktId &&
                    r.season.number === episodeInfo.season
            );
            if (seasonRating)
                ratingInfo.season = {
                    userRating: seasonRating.rating,
                    ratedAt: seasonRating.rated_at
                };
            const episodeRating = episodeRatings.find(
                (r) =>
                    r.show.ids.trakt === showTraktId &&
                    r.episode.season === episodeInfo.season &&
                    r.episode.number === episodeInfo.number
            );
            if (episodeRating)
                ratingInfo.episode = {
                    userRating: episodeRating.rating,
                    ratedAt: episodeRating.rated_at
                };
        }
    }
    return { watchStatus, progressInfo, ratingInfo };
}

export async function handleMediaInfo(
    params: { type: string; query: string; years: string },
    sender: chrome.runtime.MessageSender
): Promise<MediaStatusPayload> {
    if (!sender.tab?.url) throw new Error('Sender tab URL is missing.');
    const url = sender.tab.url;
    const siteConfig = getCurrentSiteConfig(new URL(url).hostname);
    if (!siteConfig)
        throw new Error(`No site config found for ${new URL(url).hostname}`);

    const tabUrlIdentifier = siteConfig.getUrlIdentifier(url);
    const cachedData = await chrome.storage.local.get(tabUrlIdentifier);
    if (cachedData[tabUrlIdentifier]?.confidence === 'high') {
        const details = await fetchStatusDetails(
            cachedData[tabUrlIdentifier].mediaInfo,
            url
        );
        return {
            ...details,
            mediaInfo: cachedData[tabUrlIdentifier].mediaInfo,
            confidence: 'high',
            originalQuery: params
        };
    }

    let mediaInfoResult: MediaInfoResponse | null = null;
    if (siteConfig.usesTmdbId) {
        const tmdbId = siteConfig.getTmdbId?.(url);
        if (tmdbId) {
            const mediaTypeGuess = siteConfig.getMediaType(url) || 'movie'; // Default to movie if detection fails
            try {
                const lookupResults = await callApi<MediaInfoResponse[]>(
                    `https://api.trakt.tv/search/tmdb/${tmdbId}?type=${mediaTypeGuess}&extended=full`
                );
                if (lookupResults.length > 0)
                    mediaInfoResult = lookupResults[0];
            } catch (e) {
                // If the first guess fails (e.g., movie for a show), try the other.
                if (mediaTypeGuess === 'movie') {
                    const lookupResults = await callApi<MediaInfoResponse[]>(
                        `https://api.trakt.tv/search/tmdb/${tmdbId}?type=show&extended=full`
                    );
                    if (lookupResults.length > 0)
                        mediaInfoResult = lookupResults[0];
                }
            }
        }
    }

    if (!mediaInfoResult) {
        const searchParams = new URLSearchParams({ query: params.query });
        const searchUrl = `https://api.trakt.tv/search/${params.type}?${searchParams.toString()}&extended=full`;
        const searchResults = await callApi<MediaInfoResponse[]>(
            searchUrl,
            'GET'
        );
        if (searchResults.length > 0) {
            const scoredResults = searchResults
                .map(
                    (result): ScoredMediaInfo => ({
                        ...result,
                        confidenceScore: calculateConfidence(
                            result,
                            params.query,
                            params.years
                        )
                    })
                )
                .sort((a, b) => b.confidenceScore - a.confidenceScore);
            if (scoredResults[0].confidenceScore >= 70) {
                mediaInfoResult = scoredResults[0];
            }
        }
    }

    if (mediaInfoResult) {
        await chrome.storage.local.set({
            [tabUrlIdentifier]: {
                mediaInfo: mediaInfoResult,
                confidence: 'high'
            }
        });
        const details = await fetchStatusDetails(mediaInfoResult, url);
        return {
            ...details,
            mediaInfo: mediaInfoResult,
            confidence: 'high',
            originalQuery: params
        };
    }

    return { mediaInfo: null, confidence: 'low', originalQuery: params };
}

export async function handleManualSearch(params: {
    type: string;
    query: string;
}): Promise<(MovieMediaInfo | ShowMediaInfo)[]> {
    const searchParams = new URLSearchParams({ query: params.query });
    const searchUrl = `https://api.trakt.tv/search/${params.type}?${searchParams.toString()}&extended=full&limit=10`;
    return await callApi(searchUrl, 'GET');
}

export async function handleConfirmMedia(
    params: MediaInfoResponse,
    sender: chrome.runtime.MessageSender
): Promise<void> {
    if (!sender.tab?.url) throw new Error('Sender tab URL is missing.');
    const siteConfig = getCurrentSiteConfig(new URL(sender.tab.url).hostname);
    if (!siteConfig) return;
    const tabUrlIdentifier = siteConfig.getUrlIdentifier(sender.tab.url);
    await chrome.storage.local.set({
        [tabUrlIdentifier]: {
            mediaInfo: params,
            confidence: 'high',
            confirmedAt: Date.now()
        }
    });
}
