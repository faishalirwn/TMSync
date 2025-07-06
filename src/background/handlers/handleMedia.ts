import { traktService } from '../../services/TraktService';
import { calculateConfidence } from '../../utils/confidenceHelper';
import { getCurrentSiteConfig } from '../../utils/siteConfigs';
import {
    MediaInfoResponse,
    MovieMediaInfo,
    ScoredMediaInfo,
    ShowMediaInfo
} from '../../types/media';
import { MediaStatusPayload } from '../../types/messaging';

async function fetchStatusDetails(mediaInfo: MediaInfoResponse, url: string) {
    const siteConfig = getCurrentSiteConfig(new URL(url).hostname);
    if (!siteConfig)
        throw new Error('Could not get site config for status details.');

    // Check if authenticated before trying to fetch status
    const isAuthenticated = await traktService
        .isAuthenticated()
        .catch(() => false);
    if (!isAuthenticated) {
        // Return empty status when not authenticated
        return {
            watchStatus: { isInHistory: false },
            progressInfo: null,
            ratingInfo: {}
        };
    }

    const episodeInfo = siteConfig.getSeasonEpisodeObj(url);

    try {
        if (episodeInfo) {
            return await traktService.getMediaStatusWithEpisode(
                mediaInfo,
                episodeInfo
            );
        } else {
            return await traktService.getMediaStatus(mediaInfo);
        }
    } catch (error) {
        console.warn(
            'Failed to fetch status details, returning empty status:',
            error
        );
        // Return empty status on error
        return {
            watchStatus: { isInHistory: false },
            progressInfo: null,
            ratingInfo: {}
        };
    }
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
    const cachedData = await chrome.storage.local.get([
        tabUrlIdentifier,
        'tmsync_recent_media'
    ]);
    if (cachedData[tabUrlIdentifier]?.confidence === 'high') {
        // Ensure recent media context is also available
        if (!cachedData.tmsync_recent_media) {
            await chrome.storage.local.set({
                tmsync_recent_media: {
                    ...cachedData[tabUrlIdentifier].mediaInfo,
                    fromCache: Date.now()
                }
            });
            console.log('💾 Updated recent media context from cache');
        }

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
                const lookupResults = await traktService.getMediaByTmdbId(
                    tmdbId,
                    mediaTypeGuess as 'movie' | 'show'
                );
                const results = lookupResults ? [lookupResults] : [];
                if (results.length > 0) mediaInfoResult = results[0];
            } catch {
                // If the first guess fails (e.g., movie for a show), try the other.
                if (mediaTypeGuess === 'movie') {
                    const lookupResult = await traktService.getMediaByTmdbId(
                        tmdbId,
                        'show'
                    );
                    if (lookupResult) mediaInfoResult = lookupResult;
                }
            }
        }
    }

    if (!mediaInfoResult) {
        const searchResults = await traktService.searchMedia(
            params.query,
            params.type as 'movie' | 'show',
            params.years
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
            },
            // Store recent media context for services like AniList that need title for rating
            tmsync_recent_media: {
                ...mediaInfoResult,
                autoDetectedAt: Date.now()
            }
        });
        console.log(
            '💾 Auto-detected media stored with context:',
            mediaInfoResult
        );
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
    return await traktService.searchMedia(
        params.query,
        params.type as 'movie' | 'show'
    );
}

export async function handleConfirmMedia(
    params: MediaInfoResponse,
    sender: chrome.runtime.MessageSender
): Promise<void> {
    console.log('📝 handleConfirmMedia called with:', params);
    if (!sender.tab?.url) throw new Error('Sender tab URL is missing.');
    const siteConfig = getCurrentSiteConfig(new URL(sender.tab.url).hostname);
    if (!siteConfig) return;
    const tabUrlIdentifier = siteConfig.getUrlIdentifier(sender.tab.url);

    const storageData = {
        [tabUrlIdentifier]: {
            mediaInfo: params,
            confidence: 'high',
            confirmedAt: Date.now()
        },
        // Store recent media context for services like AniList that need title for rating
        tmsync_recent_media: {
            ...params,
            confirmedAt: Date.now()
        }
    };

    console.log('💾 Storing media context:', storageData);
    await chrome.storage.local.set(storageData);
    console.log('✅ Media context stored successfully');
}
