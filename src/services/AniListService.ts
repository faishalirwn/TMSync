import { TrackerService } from '../types/services';
import {
    ServiceType,
    ServiceComment,
    ServiceProgressInfo,
    ServiceMediaIds,
    ServiceMediaRatings,
    ServiceScrobbleResponse,
    ServiceCapabilities
} from '../types/serviceTypes';
import { MediaInfoResponse, SeasonEpisodeObj } from '../types/media';
import { WatchStatusInfo } from '../types/scrobbling';

/**
 * AniListService - Handles all AniList API interactions
 *
 * This service encapsulates authentication, media operations, scrobbling,
 * ratings, and user data management for AniList using GraphQL.
 */
export class AniListService implements TrackerService {
    private accessToken: string | null = null;
    private cachedUsername: string | null = null;

    // Configuration - would typically come from environment or config
    private readonly clientId = process.env.ANILIST_CLIENT_ID || '';
    private readonly apiEndpoint = 'https://graphql.anilist.co';

    /**
     * Get service capabilities and configuration
     */
    getCapabilities(): ServiceCapabilities {
        return {
            serviceType: 'anilist' as ServiceType,
            supportsRealTimeScrobbling: false, // AniList doesn't support real-time scrobbling
            supportsProgressTracking: true, // Episode progress tracking implemented
            supportsRatings: false, // TODO: Not yet implemented - set to true when completed
            supportsComments: false, // TODO: Not yet implemented - set to true when completed
            supportsHistory: true, // History add/remove implemented
            supportsSearch: true, // Search is implemented
            ratingScale: {
                min: 1,
                max: 10, // Default to 10-point, but AniList supports multiple formats
                step: 1,
                serviceType: 'anilist'
            },
            authMethod: 'oauth',
            supportedMediaTypes: ['show', 'movie'], // AniList supports anime TV shows and movies
            rateLimits: {
                requestsPerMinute: 90,
                requestsPerHour: 90 * 60 // AniList rate limit is roughly 90 requests per minute
            }
        };
    }

    /**
     * Authentication Methods
     */

    /**
     * Check if user is currently authenticated with AniList
     */
    async isAuthenticated(): Promise<boolean> {
        try {
            const tokenData = await chrome.storage.local.get([
                'anilistAccessToken',
                'anilistTokenExpiresAt'
            ]);
            const storedToken = tokenData.anilistAccessToken;
            const expiresAt = tokenData.anilistTokenExpiresAt || 0;

            return !!(storedToken && Date.now() < expiresAt);
        } catch {
            return false;
        }
    }

    /**
     * Get current username for AniList
     */
    async getUsername(): Promise<string> {
        if (this.cachedUsername) return this.cachedUsername;

        const data = await chrome.storage.local.get('anilistUsername');
        if (data.anilistUsername) {
            this.cachedUsername = data.anilistUsername;
            return data.anilistUsername;
        }

        // Fetch username from AniList API
        const query = `
            query {
                Viewer {
                    name
                }
            }
        `;

        const response = await this.makeGraphQLRequest(query);
        const username = response.data?.Viewer?.name;

        if (username) {
            this.cachedUsername = username;
            await chrome.storage.local.set({ anilistUsername: username });
            return username;
        }

        throw new Error('Could not determine AniList username.');
    }

    /**
     * Initiate OAuth login flow for AniList using implicit grant
     */
    async login(): Promise<void> {
        // Use implicit grant flow - no redirect_uri needed for AniList
        const authUrl = `https://anilist.co/api/v2/oauth/authorize?client_id=${this.clientId}&response_type=token`;

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

            // Parse the access token from the URL fragment (not query params)
            const url = new URL(redirectUrlResponse);
            const fragment = url.hash.substring(1); // Remove the '#'
            const params = new URLSearchParams(fragment);

            const accessToken = params.get('access_token');
            const expiresIn = params.get('expires_in');

            if (!accessToken) {
                throw new Error(
                    'Could not get access token from AniList redirect.'
                );
            }

            // AniList tokens are long-lived (1 year by default)
            const expiresAt = expiresIn
                ? Date.now() + parseInt(expiresIn) * 1000
                : Date.now() + 365 * 24 * 60 * 60 * 1000; // Default to 1 year

            await chrome.storage.local.set({
                anilistAccessToken: accessToken,
                anilistTokenExpiresAt: expiresAt
            });

            // Fetch and cache user info
            await this.getUsername();
        } catch (err) {
            console.error('Error during AniList login process:', err);
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
            // AniList doesn't have a token revocation endpoint
            await chrome.storage.local.remove([
                'anilistAccessToken',
                'anilistTokenExpiresAt',
                'anilistUsername'
            ]);
            this.cachedUsername = null;
            this.accessToken = null;
        } catch (err) {
            console.error('Error during AniList logout:', err);
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
    ): Promise<MediaInfoResponse[]> {
        // Map our type to AniList type (only shows/anime for now)
        if (type !== 'show') {
            return []; // AniList focuses on anime/manga, not movies
        }

        const searchQuery = `
            query ($search: String, $seasonYear: Int) {
                Page(page: 1, perPage: 10) {
                    media(search: $search, type: ANIME, seasonYear: $seasonYear) {
                        id
                        idMal
                        title {
                            romaji
                            english
                            native
                        }
                        episodes
                        seasonYear
                        format
                        status
                        description
                        coverImage {
                            large
                        }
                        externalLinks {
                            site
                            url
                        }
                    }
                }
            }
        `;

        const variables: any = { search: query };
        if (years) {
            const year = parseInt(years);
            if (!isNaN(year)) {
                variables.seasonYear = year;
            }
        }

        const response = await this.makeGraphQLRequest(
            searchQuery,
            variables,
            false
        );
        const media = response.data?.Page?.media || [];

        // Convert AniList format to our MediaInfoResponse format
        return media.map((item: any) => this.convertAniListToMediaInfo(item));
    }

    /**
     * Get media info by TMDB ID
     */
    async getMediaByTmdbId(
        tmdbId: string,
        type: 'movie' | 'show'
    ): Promise<MediaInfoResponse | null> {
        // AniList doesn't directly support TMDB ID lookup
        // This would require a mapping service or external API
        // For now, return null as this feature isn't available
        return null;
    }

    /**
     * Get detailed media status including watch history and ratings
     */
    async getMediaStatus(mediaInfo: MediaInfoResponse): Promise<{
        watchStatus: WatchStatusInfo;
        progressInfo: ServiceProgressInfo | null;
        ratingInfo: ServiceMediaRatings;
    }> {
        // Implementation would fetch user's list entry for this media
        throw new Error('getMediaStatus not yet implemented for AniList');
    }

    /**
     * Get media status with episode-specific ratings
     */
    async getMediaStatusWithEpisode(
        mediaInfo: MediaInfoResponse,
        episodeInfo?: SeasonEpisodeObj
    ): Promise<{
        watchStatus: WatchStatusInfo;
        progressInfo: ServiceProgressInfo | null;
        ratingInfo: ServiceMediaRatings;
    }> {
        // AniList doesn't have episode-specific ratings, only series-level
        return await this.getMediaStatus(mediaInfo);
    }

    /**
     * Scrobbling Methods (Progress Tracking)
     */

    /**
     * Start scrobbling media (update progress)
     */
    async startScrobble(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): Promise<void> {
        // Implementation would update MediaList entry with current progress
        throw new Error('startScrobble not yet implemented for AniList');
    }

    /**
     * Pause scrobbling (no-op for AniList as it doesn't have real-time scrobbling)
     */
    async pauseScrobble(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): Promise<void> {
        // AniList doesn't have pause state, so this is a no-op
    }

    /**
     * Stop scrobbling and update progress/status
     */
    async stopScrobble(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): Promise<ServiceScrobbleResponse> {
        // Implementation would update MediaList entry and determine if completed
        throw new Error('stopScrobble not yet implemented for AniList');
    }

    /**
     * History Management Methods
     */

    /**
     * Add media to watch history manually
     */
    async addToHistory(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null
    ): Promise<{ historyId?: number | string }> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with AniList');
        }

        if (mediaInfo.type !== 'show') {
            throw new Error('AniList currently only supports TV shows/anime');
        }

        // Search AniList directly for the media
        const searchQuery = `
            query ($search: String, $seasonYear: Int) {
                Page(page: 1, perPage: 5) {
                    media(search: $search, type: ANIME, seasonYear: $seasonYear) {
                        id
                        episodes
                        title {
                            romaji
                            english
                        }
                    }
                }
            }
        `;

        const searchVariables: any = { search: mediaInfo.show.title };
        if (mediaInfo.show.year) {
            searchVariables.seasonYear = mediaInfo.show.year;
        }

        const searchResponse = await this.makeGraphQLRequest(
            searchQuery,
            searchVariables,
            false
        );
        const mediaList = searchResponse.data?.Page?.media || [];

        if (mediaList.length === 0) {
            throw new Error(
                `Could not find anime "${mediaInfo.show.title}" on AniList`
            );
        }

        // Use first result (could improve with better matching later)
        const anilistMedia = mediaList[0];
        const anilistId = anilistMedia.id;

        // Determine if this is completion or just progress update
        const episodeNumber = episodeInfo?.number || 1;
        const totalEpisodes = anilistMedia.episodes;
        const isCompleted = totalEpisodes && episodeNumber >= totalEpisodes;

        // Use SaveMediaListEntry mutation
        const mutation = `
            mutation($mediaId: Int!, $status: MediaListStatus!, $progress: Int!) {
                SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress) {
                    id
                    progress
                    status
                }
            }
        `;

        const mutationVariables = {
            mediaId: anilistId,
            status: isCompleted ? 'COMPLETED' : 'CURRENT',
            progress: episodeNumber
        };

        const mutationResponse = await this.makeGraphQLRequest(
            mutation,
            mutationVariables
        );

        if (mutationResponse.errors) {
            throw new Error(
                `AniList API error: ${mutationResponse.errors[0].message}`
            );
        }

        const entry = mutationResponse.data.SaveMediaListEntry;
        return { historyId: entry.id.toString() };
    }

    /**
     * Remove item from watch history
     */
    async removeFromHistory(historyId: number | string): Promise<void> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with AniList');
        }

        // Use DeleteMediaListEntry mutation
        const mutation = `
            mutation($id: Int!) {
                DeleteMediaListEntry(id: $id) {
                    deleted
                }
            }
        `;

        const variables = {
            id:
                typeof historyId === 'string'
                    ? parseInt(historyId, 10)
                    : historyId
        };

        const response = await this.makeGraphQLRequest(mutation, variables);

        if (response.errors) {
            throw new Error(`AniList API error: ${response.errors[0].message}`);
        }

        if (!response.data.DeleteMediaListEntry?.deleted) {
            throw new Error('Failed to remove entry from AniList');
        }
    }

    /**
     * Rating Methods
     */

    /**
     * Rate a movie (not applicable for AniList)
     */
    async rateMovie(movieIds: ServiceMediaIds, rating: number): Promise<void> {
        throw new Error('AniList does not support movie ratings');
    }

    /**
     * Rate a show (anime)
     */
    async rateShow(showIds: ServiceMediaIds, rating: number): Promise<void> {
        // Implementation would use SaveMediaListEntry mutation with score
        throw new Error('rateShow not yet implemented for AniList');
    }

    /**
     * Rate a season (not applicable for AniList)
     */
    async rateSeason(
        showIds: ServiceMediaIds,
        seasonNumber: number,
        rating: number
    ): Promise<void> {
        throw new Error('AniList does not support season-specific ratings');
    }

    /**
     * Rate an episode (not applicable for AniList)
     */
    async rateEpisode(
        showIds: ServiceMediaIds,
        seasonNumber: number,
        episodeNumber: number,
        rating: number
    ): Promise<void> {
        throw new Error('AniList does not support episode-specific ratings');
    }

    /**
     * Comment Methods (not supported by AniList API)
     */

    /**
     * Get comments for media
     */
    async getComments(
        type: 'movie' | 'show' | 'season' | 'episode',
        mediaInfo: MediaInfoResponse,
        episodeInfo?: SeasonEpisodeObj
    ): Promise<ServiceComment[]> {
        throw new Error('AniList does not support comments via API');
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
    ): Promise<ServiceComment> {
        throw new Error('AniList does not support posting comments via API');
    }

    /**
     * Update existing comment
     */
    async updateComment(
        commentId: number | string,
        comment: string,
        spoiler: boolean
    ): Promise<ServiceComment> {
        throw new Error('AniList does not support updating comments via API');
    }

    /**
     * Delete a comment
     */
    async deleteComment(commentId: number | string): Promise<void> {
        throw new Error('AniList does not support deleting comments via API');
    }

    /**
     * Private Helper Methods
     */

    /**
     * Make a GraphQL request to AniList API
     */
    private async makeGraphQLRequest(
        query: string,
        variables: any = {},
        requireAuth: boolean = true
    ): Promise<any> {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        };

        if (requireAuth) {
            const tokenData = await chrome.storage.local.get([
                'anilistAccessToken'
            ]);
            const token = tokenData.anilistAccessToken;
            if (!token) {
                throw new Error('No AniList access token available');
            }
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query,
                variables
            })
        });

        if (!response.ok) {
            throw new Error(
                `AniList API error: ${response.status} ${response.statusText}`
            );
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error(
                `AniList API error: ${data.errors[0]?.message || 'Unknown error'}`
            );
        }

        return data;
    }

    /**
     * Convert AniList media format to our MediaInfoResponse format
     */
    private convertAniListToMediaInfo(anilistMedia: any): MediaInfoResponse {
        // This is a basic conversion - would need refinement based on actual usage
        return {
            type: 'show',
            score: 0, // Default score, would be updated from user's list
            show: {
                title:
                    anilistMedia.title?.english ||
                    anilistMedia.title?.romaji ||
                    'Unknown',
                year: anilistMedia.seasonYear || 0,
                ids: {
                    trakt: 0, // Default values since AniList doesn't have these
                    slug: '',
                    tvdb: 0,
                    imdb: '',
                    tmdb: 0
                }
            }
        };
    }
}

// Export singleton instance
export const aniListService = new AniListService();
