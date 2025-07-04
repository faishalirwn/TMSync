import { clientId, clientSecret, traktHeaders } from '../utils/config';
import {
    MediaInfoResponse,
    SeasonEpisodeObj,
    MediaRatings
} from '../types/media';
import {
    TraktComment,
    ScrobbleBody,
    TraktShowWatchedProgress
} from '../types/trakt';
import { WatchStatusInfo, ScrobbleStopResponseData } from '../types/scrobbling';

/**
 * TraktService - Handles all Trakt.tv API interactions
 *
 * This service encapsulates authentication, media operations, scrobbling,
 * ratings, comments, and user data management for Trakt.tv.
 */
export class TraktService {
    private isRefreshing = false;
    private refreshSubscribers: ((token: string) => void)[] = [];
    private cachedUsername: string | null = null;

    /**
     * Authentication Methods
     */

    /**
     * Check if user is currently authenticated with Trakt
     */
    async isAuthenticated(): Promise<boolean> {
        try {
            const tokenData = await chrome.storage.local.get([
                'traktAccessToken',
                'traktTokenExpiresAt'
            ]);
            const storedToken = tokenData.traktAccessToken;
            const expiresAt = tokenData.traktTokenExpiresAt || 0;

            return !!(storedToken && Date.now() < expiresAt);
        } catch {
            return false;
        }
    }

    /**
     * Get current user settings and info
     */
    async getUserSettings(): Promise<any> {
        return this.callApi('https://api.trakt.tv/users/settings', 'GET');
    }

    /**
     * Get cached or fetch current username
     */
    async getUsername(): Promise<string> {
        if (this.cachedUsername) return this.cachedUsername;

        const data = await chrome.storage.local.get('traktUsername');
        if (data.traktUsername) {
            this.cachedUsername = data.traktUsername;
            return data.traktUsername;
        }

        const settings = await this.getUserSettings();
        const username = settings?.user?.username;
        if (username) {
            this.cachedUsername = username;
            await chrome.storage.local.set({ traktUsername: username });
            return username;
        }

        throw new Error('Could not determine Trakt username.');
    }

    /**
     * Initiate OAuth login flow
     */
    async login(): Promise<void> {
        let redirectUri: string | undefined;
        try {
            redirectUri = chrome.identity.getRedirectURL();
            if (!redirectUri) throw new Error('Could not get redirect URL.');
        } catch (err) {
            console.error('Error getting redirect URL:', err);
            throw new Error('Failed to configure authentication redirect.');
        }

        const authUrl = `https://trakt.tv/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

        try {
            const redirectUrlResponse = await chrome.identity.launchWebAuthFlow(
                {
                    url: authUrl,
                    interactive: true
                }
            );

            if (chrome.runtime.lastError || !redirectUrlResponse) {
                throw new Error(
                    chrome.runtime.lastError?.message ||
                        'Authentication cancelled or failed.'
                );
            }

            const url = new URL(redirectUrlResponse);
            const code = url.searchParams.get('code');

            if (!code) {
                throw new Error('Could not get authorization code from Trakt.');
            }

            const tokenResponse = await fetch(
                'https://api.trakt.tv/oauth/token',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: code,
                        client_id: clientId,
                        client_secret: clientSecret,
                        redirect_uri: redirectUri,
                        grant_type: 'authorization_code'
                    })
                }
            );

            const tokenData = await tokenResponse.json();
            if (!tokenResponse.ok) {
                throw new Error(
                    `Token exchange failed: ${tokenData.error_description || tokenResponse.statusText}`
                );
            }

            const expiresAt = Date.now() + tokenData.expires_in * 1000;
            await chrome.storage.local.set({
                traktAccessToken: tokenData.access_token,
                traktRefreshToken: tokenData.refresh_token,
                traktTokenExpiresAt: expiresAt
            });

            // Fetch and cache user info
            const settings = await this.getUserSettings();
            if (settings?.user?.username) {
                this.cachedUsername = settings.user.username;
                await chrome.storage.local.set({
                    traktUsername: settings.user.username
                });
            }
        } catch (err) {
            console.error('Error during login process:', err);
            throw err instanceof Error
                ? err
                : new Error('An unexpected error occurred during login.');
        }
    }

    /**
     * Logout and clear stored tokens
     */
    async logout(): Promise<void> {
        try {
            const tokenData = await chrome.storage.local.get([
                'traktAccessToken'
            ]);
            if (tokenData.traktAccessToken) {
                await fetch('https://api.trakt.tv/oauth/revoke', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${tokenData.traktAccessToken}`,
                        'trakt-api-key': clientId,
                        'trakt-api-version': '2'
                    },
                    body: JSON.stringify({ token: tokenData.traktAccessToken })
                });
            }
        } catch (err) {
            console.error('Error revoking token (continuing logout):', err);
        } finally {
            await chrome.storage.local.remove([
                'traktAccessToken',
                'traktRefreshToken',
                'traktTokenExpiresAt',
                'traktUsername'
            ]);
            this.cachedUsername = null;
        }
    }

    /**
     * Media Search and Identification Methods
     */

    /**
     * Search for media by query and type
     */
    async searchMedia(
        query: string,
        type: 'movie' | 'show',
        years?: string
    ): Promise<any[]> {
        const params = new URLSearchParams();
        params.append('query', query);
        if (years) params.append('years', years);

        const url = `https://api.trakt.tv/search/${type}?${params.toString()}`;
        return this.callApi(url, 'GET', null, false);
    }

    /**
     * Get media info by TMDB ID
     */
    async getMediaByTmdbId(
        tmdbId: string,
        type: 'movie' | 'show'
    ): Promise<any> {
        const url = `https://api.trakt.tv/search/tmdb/${tmdbId}?type=${type}`;
        const results = await this.callApi(url, 'GET', null, false);
        return results?.[0] || null;
    }

    /**
     * Get detailed media status including watch history and ratings
     */
    async getMediaStatus(mediaInfo: MediaInfoResponse): Promise<{
        watchStatus: WatchStatusInfo;
        progressInfo: TraktShowWatchedProgress | null;
        ratingInfo: MediaRatings;
    }> {
        const watchStatus: WatchStatusInfo = {
            isInHistory: false,
            isCompleted: false
        };
        let progressInfo: TraktShowWatchedProgress | null = null;
        const ratingInfo: MediaRatings = {};

        if (mediaInfo.type === 'movie') {
            const movieTraktId = mediaInfo.movie.ids?.trakt;
            if (movieTraktId) {
                const [history, ratings] = await Promise.all([
                    this.callApi(
                        `https://api.trakt.tv/sync/history/movies/${movieTraktId}?limit=1`
                    ).catch(() => []),
                    this.callApi(
                        `https://api.trakt.tv/sync/ratings/movies`
                    ).catch(() => [])
                ]);

                if (history?.[0]?.watched_at) {
                    watchStatus.isInHistory = true;
                    watchStatus.lastWatchedAt = history[0].watched_at;
                }

                const movieRating = ratings.find(
                    (r: any) => r.movie.ids.trakt === movieTraktId
                );
                if (movieRating) {
                    ratingInfo.show = {
                        userRating: movieRating.rating,
                        ratedAt: movieRating.rated_at
                    };
                }
            }
        } else if (mediaInfo.type === 'show') {
            const showTraktId = mediaInfo.show.ids?.trakt;
            if (showTraktId) {
                progressInfo = await this.callApi(
                    `https://api.trakt.tv/shows/${showTraktId}/progress/watched?hidden=false&specials=false`
                ).catch(() => null);

                if (progressInfo?.last_watched_at) {
                    watchStatus.isInHistory = true;
                    watchStatus.lastWatchedAt = progressInfo.last_watched_at;
                }

                watchStatus.isCompleted = !!(
                    progressInfo &&
                    progressInfo.aired > 0 &&
                    progressInfo.aired === progressInfo.completed
                );

                const [showRatings, seasonRatings, episodeRatings] =
                    await Promise.all([
                        this.callApi(
                            `https://api.trakt.tv/sync/ratings/shows`
                        ).catch(() => []),
                        this.callApi(
                            `https://api.trakt.tv/sync/ratings/seasons`
                        ).catch(() => []),
                        this.callApi(
                            `https://api.trakt.tv/sync/ratings/episodes`
                        ).catch(() => [])
                    ]);

                const showRating = showRatings.find(
                    (r: any) => r.show.ids.trakt === showTraktId
                );
                if (showRating) {
                    ratingInfo.show = {
                        userRating: showRating.rating,
                        ratedAt: showRating.rated_at
                    };
                }

                // Note: Season and episode ratings would need episode info context
                // This will be handled by calling methods when episode info is available
            }
        }

        return { watchStatus, progressInfo, ratingInfo };
    }

    /**
     * Get media status with episode-specific ratings
     */
    async getMediaStatusWithEpisode(
        mediaInfo: MediaInfoResponse,
        episodeInfo?: SeasonEpisodeObj
    ): Promise<{
        watchStatus: WatchStatusInfo;
        progressInfo: TraktShowWatchedProgress | null;
        ratingInfo: MediaRatings;
    }> {
        const result = await this.getMediaStatus(mediaInfo);

        // Add episode-specific ratings if this is a show with episode info
        if (mediaInfo.type === 'show' && episodeInfo) {
            const showTraktId = mediaInfo.show.ids?.trakt;
            if (showTraktId) {
                const [seasonRatings, episodeRatings] = await Promise.all([
                    this.callApi(
                        `https://api.trakt.tv/sync/ratings/seasons`
                    ).catch(() => []),
                    this.callApi(
                        `https://api.trakt.tv/sync/ratings/episodes`
                    ).catch(() => [])
                ]);

                const seasonRating = seasonRatings.find(
                    (r: any) =>
                        r.show.ids.trakt === showTraktId &&
                        r.season.number === episodeInfo.season
                );
                if (seasonRating) {
                    result.ratingInfo.season = {
                        userRating: seasonRating.rating,
                        ratedAt: seasonRating.rated_at
                    };
                }

                const episodeRating = episodeRatings.find(
                    (r: any) =>
                        r.show.ids.trakt === showTraktId &&
                        r.episode.season === episodeInfo.season &&
                        r.episode.number === episodeInfo.number
                );
                if (episodeRating) {
                    result.ratingInfo.episode = {
                        userRating: episodeRating.rating,
                        ratedAt: episodeRating.rated_at
                    };
                }
            }
        }

        return result;
    }

    /**
     * Scrobbling Methods
     */

    /**
     * Start scrobbling media
     */
    async startScrobble(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): Promise<void> {
        const payload = this.buildScrobblePayload(
            mediaInfo,
            episodeInfo,
            progress
        );
        await this.callApi(
            'https://api.trakt.tv/scrobble/start',
            'POST',
            payload
        );
    }

    /**
     * Pause scrobbling
     */
    async pauseScrobble(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): Promise<void> {
        const payload = this.buildScrobblePayload(
            mediaInfo,
            episodeInfo,
            progress
        );
        await this.callApi(
            'https://api.trakt.tv/scrobble/pause',
            'POST',
            payload
        );
    }

    /**
     * Stop scrobbling and mark as watched if threshold met
     */
    async stopScrobble(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): Promise<ScrobbleStopResponseData> {
        const payload = this.buildScrobblePayload(
            mediaInfo,
            episodeInfo,
            progress
        );
        const response = await this.callApi(
            'https://api.trakt.tv/scrobble/stop',
            'POST',
            payload
        );

        const COMPLETION_THRESHOLD = 80;
        if (progress >= COMPLETION_THRESHOLD) {
            return { action: 'watched', traktHistoryId: response?.id };
        } else {
            return { action: 'paused_incomplete' };
        }
    }

    /**
     * Add media to watch history manually
     */
    async addToHistory(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null
    ): Promise<{ traktHistoryId?: number }> {
        const historyBody: any = {};

        if (mediaInfo.type === 'movie') {
            historyBody.movies = [{ ids: mediaInfo.movie.ids }];
        } else if (mediaInfo.type === 'show' && episodeInfo) {
            historyBody.shows = [
                {
                    ids: mediaInfo.show.ids,
                    seasons: [
                        {
                            number: episodeInfo.season,
                            episodes: [{ number: episodeInfo.number }]
                        }
                    ]
                }
            ];
        } else {
            throw new Error('Invalid media for manual history add');
        }

        await this.callApi(
            'https://api.trakt.tv/sync/history',
            'POST',
            historyBody
        );

        // Get the history ID of the item we just added
        const historyEndpoint =
            mediaInfo.type === 'movie' ? 'movies' : 'episodes';
        const traktId =
            mediaInfo.type === 'movie'
                ? mediaInfo.movie.ids.trakt
                : mediaInfo.show.ids.trakt;

        const historyResponse = await this.callApi(
            `https://api.trakt.tv/sync/history/${historyEndpoint}/${traktId}?limit=1`,
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

        return { traktHistoryId };
    }

    /**
     * Remove item from watch history
     */
    async removeFromHistory(historyId: number): Promise<void> {
        await this.callApi(`https://api.trakt.tv/sync/history/remove`, 'POST', {
            ids: [historyId]
        });
    }

    /**
     * Rating Methods
     */

    /**
     * Rate a movie
     */
    async rateMovie(movieIds: any, rating: number): Promise<void> {
        const body = {
            movies: [{ ids: movieIds, rating }]
        };
        await this.callApi('https://api.trakt.tv/sync/ratings', 'POST', body);
    }

    /**
     * Rate a show
     */
    async rateShow(showIds: any, rating: number): Promise<void> {
        const body = {
            shows: [{ ids: showIds, rating }]
        };
        await this.callApi('https://api.trakt.tv/sync/ratings', 'POST', body);
    }

    /**
     * Rate a season
     */
    async rateSeason(
        showIds: any,
        seasonNumber: number,
        rating: number
    ): Promise<void> {
        // Get season details first
        const seasons = await this.callApi(
            `https://api.trakt.tv/shows/${showIds.trakt}/seasons`
        );
        const seasonId = seasons.find((s: any) => s.number === seasonNumber)
            ?.ids?.trakt;

        if (!seasonId) {
            throw new Error(`Season ${seasonNumber} not found for show`);
        }

        const body = {
            seasons: [{ ids: { trakt: seasonId }, rating }]
        };
        await this.callApi('https://api.trakt.tv/sync/ratings', 'POST', body);
    }

    /**
     * Rate an episode
     */
    async rateEpisode(
        showIds: any,
        seasonNumber: number,
        episodeNumber: number,
        rating: number
    ): Promise<void> {
        // Get episode details first
        const episodes = await this.callApi(
            `https://api.trakt.tv/shows/${showIds.trakt}/seasons/${seasonNumber}/episodes`
        );
        const episodeId = episodes.find((e: any) => e.number === episodeNumber)
            ?.ids?.trakt;

        if (!episodeId) {
            throw new Error(
                `Episode ${seasonNumber}x${episodeNumber} not found`
            );
        }

        const body = {
            episodes: [{ ids: { trakt: episodeId }, rating }]
        };
        await this.callApi('https://api.trakt.tv/sync/ratings', 'POST', body);
    }

    /**
     * Comment Methods
     */

    /**
     * Get comments for media
     */
    async getComments(
        type: 'movie' | 'show' | 'season' | 'episode',
        mediaInfo: MediaInfoResponse,
        episodeInfo?: SeasonEpisodeObj
    ): Promise<TraktComment[]> {
        // Implementation will be moved from handleComments
        throw new Error('getComments method not yet implemented');
    }

    /**
     * Post a new comment
     */
    async postComment(
        type: 'movie' | 'show' | 'season' | 'episode',
        mediaInfo: MediaInfoResponse,
        comment: string,
        spoiler: boolean,
        episodeInfo?: SeasonEpisodeObj
    ): Promise<TraktComment> {
        // Implementation will be moved from handleComments
        throw new Error('postComment method not yet implemented');
    }

    /**
     * Update existing comment
     */
    async updateComment(
        commentId: number,
        comment: string,
        spoiler: boolean
    ): Promise<TraktComment> {
        const response = await this.callApi(
            `https://api.trakt.tv/comments/${commentId}`,
            'PUT',
            {
                comment,
                spoiler
            }
        );
        return response;
    }

    /**
     * Delete a comment
     */
    async deleteComment(commentId: number): Promise<void> {
        await this.callApi(
            `https://api.trakt.tv/comments/${commentId}`,
            'DELETE'
        );
    }

    /**
     * Private Helper Methods
     */

    /**
     * Build scrobble payload for API calls
     */
    private buildScrobblePayload(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): ScrobbleBody {
        const payload: ScrobbleBody = { progress };

        if (mediaInfo.type === 'movie') {
            payload.movie = mediaInfo.movie;
        } else if (mediaInfo.type === 'show' && episodeInfo) {
            payload.show = mediaInfo.show;
            payload.episode = episodeInfo;
        } else {
            throw new Error(
                'Invalid mediaInfo or missing episodeInfo for show'
            );
        }

        return payload;
    }

    /**
     * Subscribe to token refresh events
     */
    private subscribeTokenRefresh(cb: (token: string) => void): void {
        this.refreshSubscribers.push(cb);
    }

    /**
     * Notify token refresh subscribers
     */
    private onRefreshed(token: string): void {
        this.refreshSubscribers.forEach((cb) => cb(token));
        this.refreshSubscribers = [];
    }

    /**
     * Refresh access token using refresh token
     */
    private async refreshToken(): Promise<string | null> {
        console.log('Attempting token refresh...');
        this.isRefreshing = true;

        const tokenData = await chrome.storage.local.get(['traktRefreshToken']);
        const storedRefreshToken = tokenData.traktRefreshToken;

        if (!storedRefreshToken) {
            console.error('No refresh token found. Cannot refresh.');
            this.isRefreshing = false;
            await this.logout();
            return null;
        }

        let redirectUri: string | undefined;
        try {
            redirectUri = chrome.identity.getRedirectURL();
            if (!redirectUri)
                throw new Error('Could not get redirect URL for refresh.');
        } catch (error) {
            console.error('Error getting redirect URL during refresh:', error);
            this.isRefreshing = false;
            return null;
        }

        try {
            const response = await fetch('https://api.trakt.tv/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    refresh_token: storedRefreshToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUri,
                    grant_type: 'refresh_token'
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Token refresh failed:', response.status, data);
                await this.logout();
                this.isRefreshing = false;
                this.onRefreshed('');
                return null;
            }

            console.log('Token refresh successful:', data);
            const newExpiresAt = Date.now() + data.expires_in * 1000;

            await chrome.storage.local.set({
                traktAccessToken: data.access_token,
                traktRefreshToken: data.refresh_token,
                traktTokenExpiresAt: newExpiresAt
            });

            this.isRefreshing = false;
            this.onRefreshed(data.access_token);
            return data.access_token;
        } catch (error) {
            console.error('Error during token refresh fetch:', error);
            this.isRefreshing = false;
            this.onRefreshed('');
            return null;
        }
    }

    /**
     * Core API call method with automatic token management
     */
    private async callApi<T = any>(
        url: string,
        method: RequestInit['method'] = 'GET',
        body: BodyInit | object | null = null,
        isAuth: boolean = true
    ): Promise<T> {
        let accessToken: string | null = null;

        if (isAuth) {
            const tokenData = await chrome.storage.local.get([
                'traktAccessToken',
                'traktTokenExpiresAt'
            ]);
            const expiresAt = tokenData.traktTokenExpiresAt || 0;
            const storedAccessToken = tokenData.traktAccessToken;

            if (!storedAccessToken || Date.now() >= expiresAt - 60000) {
                console.log('Access token missing or expired/expiring soon.');

                if (this.isRefreshing) {
                    console.log('Waiting for ongoing token refresh...');
                    return new Promise((resolve) => {
                        this.subscribeTokenRefresh(async (newToken) => {
                            if (!newToken) {
                                throw new Error(
                                    'Authentication failed during refresh.'
                                );
                            }
                            resolve(
                                this.callApiInternal(
                                    url,
                                    method,
                                    body,
                                    isAuth,
                                    newToken
                                )
                            );
                        });
                    });
                } else {
                    accessToken = await this.refreshToken();
                    if (!accessToken) {
                        await this.logout();
                        throw new Error(
                            'Authentication required. Please login via the extension popup.'
                        );
                    }
                }
            } else {
                accessToken = storedAccessToken;
            }
        }

        return this.callApiInternal(url, method, body, isAuth, accessToken);
    }

    /**
     * Internal API call implementation
     */
    private async callApiInternal<T = any>(
        url: string,
        method: RequestInit['method'] = 'GET',
        body: BodyInit | object | null = null,
        isAuth: boolean = true,
        accessToken: string | null = null
    ): Promise<T> {
        const headers: HeadersInit = { ...traktHeaders };

        if (isAuth && accessToken) {
            headers['Authorization'] = `Bearer ${accessToken}`;
        }

        if (body && typeof body === 'object' && !(body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }

        const response = await fetch(url, {
            method,
            headers,
            body: body as BodyInit
        });

        if (!response.ok) {
            throw new Error(
                `Trakt API error: ${response.status} ${response.statusText}`
            );
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            return response.json();
        } else {
            return response.text() as T;
        }
    }
}

// Export singleton instance
export const traktService = new TraktService();
