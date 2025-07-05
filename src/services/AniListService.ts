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
        // Search both anime shows and movies
        const anilistType = type === 'movie' ? 'ANIME' : 'ANIME'; // AniList uses ANIME for both

        const searchQuery = `
            query ($search: String, $seasonYear: Int, $type: MediaType) {
                Page(page: 1, perPage: 10) {
                    media(search: $search, type: $type, seasonYear: $seasonYear) {
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

        const variables: any = {
            search: query,
            type: anilistType
        };
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
        // Check authentication by attempting to get the token from storage
        const tokenData = await chrome.storage.local.get([
            'anilistAccessToken'
        ]);
        if (!tokenData.anilistAccessToken) {
            throw new Error('Not authenticated with AniList');
        }

        // AniList supports both anime shows and movies

        // Search AniList directly for the media
        const mediaTitle =
            mediaInfo.type === 'movie'
                ? mediaInfo.movie.title
                : mediaInfo.show.title;
        const mediaYear =
            mediaInfo.type === 'movie'
                ? mediaInfo.movie.year
                : mediaInfo.show.year;

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

        const searchVariables: any = { search: mediaTitle };
        if (mediaYear) {
            searchVariables.seasonYear = mediaYear;
        }

        const searchResponse = await this.makeGraphQLRequest(
            searchQuery,
            searchVariables,
            false
        );
        const mediaList = searchResponse.data?.Page?.media || [];

        if (mediaList.length === 0) {
            throw new Error(`Could not find anime "${mediaTitle}" on AniList`);
        }

        // Use first result (could improve with better matching later)
        const anilistMedia = mediaList[0];
        const anilistId = anilistMedia.id;

        // Determine if this is completion or just progress update
        let episodeNumber = 1;
        let isCompleted = false;

        if (mediaInfo.type === 'movie') {
            // Movies are always "completed" when watched
            episodeNumber = 1;
            isCompleted = true;
        } else {
            // TV shows use episode info
            episodeNumber = episodeInfo?.number || 1;
            const totalEpisodes = anilistMedia.episodes;
            isCompleted = totalEpisodes && episodeNumber >= totalEpisodes;
        }

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
        // Keep ID as number to avoid precision issues with large integers
        return { historyId: entry.id };
    }

    /**
     * Remove item from watch history
     */
    async removeFromHistory(historyId: number | string): Promise<void> {
        // Check authentication by attempting to get the token from storage
        const tokenData = await chrome.storage.local.get([
            'anilistAccessToken'
        ]);
        if (!tokenData.anilistAccessToken) {
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

        // Ensure ID is handled as a proper number for GraphQL Int type
        let numericId: number;
        if (typeof historyId === 'string') {
            numericId = parseInt(historyId, 10);
            // Check if the parsed number is valid and within safe integer range
            if (isNaN(numericId) || !Number.isSafeInteger(numericId)) {
                throw new Error(`Invalid AniList entry ID: ${historyId}`);
            }
        } else {
            numericId = historyId;
            if (!Number.isSafeInteger(numericId)) {
                throw new Error(
                    `AniList entry ID exceeds safe integer range: ${historyId}`
                );
            }
        }

        // AniList uses 32-bit signed integers for IDs, check if this ID is within range
        const MAX_32BIT_INT = 2147483647;
        const MIN_32BIT_INT = -2147483648;

        if (numericId > MAX_32BIT_INT || numericId < MIN_32BIT_INT) {
            // This is likely a Trakt ID or other service ID that can't be used with AniList
            console.log(
                `⚠️ Skipping AniList removal - ID ${numericId} appears to be from another service (exceeds 32-bit range)`
            );
            throw new Error(
                `Cannot remove AniList entry: ID ${numericId} is not a valid AniList ID (likely from another service)`
            );
        }

        const variables = { id: numericId };

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
