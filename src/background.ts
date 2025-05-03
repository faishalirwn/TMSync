import { callApi } from './utils/api';
import { getCurrentSiteConfig } from './utils/siteConfigs';
import { SiteConfigBase } from './utils/siteConfigs/baseConfig';
import { isMovieMediaInfo, isShowMediaInfo } from './utils/typeGuards';
import {
    HistoryBody,
    HostnameType,
    MediaInfoActionResult,
    MediaInfoResponse,
    MessageRequest,
    MessageResponse,
    MovieMediaInfo,
    ScrobbleResponse,
    ShowMediaInfo
} from './utils/types';

function getTitleSimilarity(queryTitle: string, resultTitle: string): number {
    const q = queryTitle.toLowerCase().trim();
    const r = resultTitle.toLowerCase().trim();
    if (q === r) return 1.0;
    if (r.includes(q)) return 0.7;
    if (q.includes(r)) return 0.6;

    const queryWords = new Set(q.split(' '));
    const resultWords = r.split(' ');
    const overlap = resultWords.filter((word) => queryWords.has(word)).length;
    return (overlap / Math.max(queryWords.size, resultWords.length)) * 0.5;
}

export type ScoredMediaInfo = MediaInfoResponse & {
    confidenceScore: number;
};

function calculateConfidence(
    result: MovieMediaInfo | ShowMediaInfo,
    queryTitle: string,
    queryYear: string | number | null
): number {
    let score = 0;
    let resultTitle = '';
    let resultYear = 0;
    if (isMovieMediaInfo(result)) {
        resultTitle = result.movie.title;
        resultYear = result.movie.year;
    } else if (isShowMediaInfo(result)) {
        resultTitle = result.show.title;
        resultYear = result.show.year;
    } else {
        console.warn(
            'calculateConfidence received unexpected media type:',
            result
        );
        return 0;
    }

    const titleSim = getTitleSimilarity(queryTitle, resultTitle);
    score += titleSim * 50;

    if (queryYear && resultYear && String(resultYear) === String(queryYear)) {
        score += 40;
    }

    score += Math.min(result.score / 100, 10);

    return Math.min(score, 100);
}

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
                console.log('Received mediaInfo request:', originalQuery);

                try {
                    const cachedData =
                        await chrome.storage.local.get(tabUrlIdentifier);
                    if (
                        cachedData[tabUrlIdentifier] &&
                        cachedData[tabUrlIdentifier].confidence === 'high'
                    ) {
                        console.log(
                            'Using high-confidence cached mediaInfo:',
                            cachedData[tabUrlIdentifier].mediaInfo
                        );
                        const response: MessageResponse<MediaInfoActionResult> =
                            {
                                success: true,
                                data: {
                                    mediaInfo:
                                        cachedData[tabUrlIdentifier].mediaInfo,
                                    confidence: 'high',
                                    originalQuery: originalQuery
                                }
                            };
                        sendResponse(response);
                        return true;
                    }
                } catch (e) {
                    console.error('Error checking cache:', e);
                }

                try {
                    const searchParams = new URLSearchParams({
                        query: originalQuery.query
                    });
                    const searchUrl = `https://api.trakt.tv/search/${originalQuery.type}?${searchParams.toString()}&extended=full`;
                    const searchResults: (MovieMediaInfo | ShowMediaInfo)[] =
                        await callApi(searchUrl, 'GET');

                    if (!searchResults || searchResults.length === 0) {
                        console.log('No results from Trakt search.');
                        const response: MessageResponse<MediaInfoActionResult> =
                            {
                                success: true,
                                data: {
                                    mediaInfo: null,
                                    confidence: 'low',
                                    originalQuery: originalQuery
                                }
                            };
                        sendResponse(response);
                        return true;
                    }

                    const scoredResults: ScoredMediaInfo[] = searchResults
                        .map((result) => ({
                            ...result,
                            confidenceScore: calculateConfidence(
                                result,
                                originalQuery.query,
                                originalQuery.years
                            )
                        }))
                        .sort((a, b) => b.confidenceScore - a.confidenceScore);

                    console.log(
                        'Scored Results:',
                        scoredResults.map((r) => {
                            if (r.type === 'movie' && 'movie' in r) {
                                return {
                                    title: r.movie?.title,
                                    year: r.movie?.year,
                                    score: r.confidenceScore
                                };
                            } else if (r.type === 'show' && 'show' in r) {
                                return {
                                    title: r.show?.title,
                                    year: r.show?.year,
                                    score: r.confidenceScore
                                };
                            }
                        })
                    );

                    const bestMatch = scoredResults[0];
                    const CONFIDENCE_THRESHOLD = 70;

                    if (bestMatch.confidenceScore >= CONFIDENCE_THRESHOLD) {
                        console.log(
                            `High confidence match found (${bestMatch.confidenceScore}):`,
                            bestMatch
                        );

                        await chrome.storage.local.set({
                            [tabUrlIdentifier]: {
                                mediaInfo: bestMatch,
                                confidence: 'high'
                            }
                        });
                        const response: MessageResponse<MediaInfoActionResult> =
                            {
                                success: true,
                                data: {
                                    mediaInfo: bestMatch,
                                    confidence: 'high',
                                    originalQuery: originalQuery
                                }
                            };
                        sendResponse(response);
                    } else {
                        console.log(
                            `Low confidence match (${bestMatch.confidenceScore}). Threshold: ${CONFIDENCE_THRESHOLD}`
                        );
                        const response: MessageResponse<MediaInfoActionResult> =
                            {
                                success: true,
                                data: {
                                    mediaInfo: null,
                                    confidence: 'low',
                                    originalQuery: originalQuery
                                }
                            };
                        sendResponse(response);
                    }
                } catch (error) {
                    console.error('Error during mediaInfo action:', error);
                    const response: MessageResponse<MediaInfoActionResult> = {
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Failed to get media info from Trakt'
                    };
                    sendResponse(response);
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
