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
import {
    convertToFuzzyDate,
    getCurrentFuzzyDate,
    type FuzzyDateInput
} from '../utils/fuzzyDate';

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
            supportsRatings: true, // Rating functionality implemented
            supportsComments: true, // AniList notes functionality implemented
            supportsHistory: true, // History add/remove implemented
            supportsSearch: true, // Search is implemented
            ratingScale: {
                min: 1,
                max: 10, // Our interface uses 1-10, converted to user's AniList format
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

        // Check if this media already exists in user's list (for rewatch detection)
        const existingEntry = await this.getExistingMediaListEntry(anilistId);

        // Get current date for tracking
        const currentDate = getCurrentFuzzyDate();

        // Determine if this is completion or just progress update
        let episodeNumber = 1;
        let isCompleted = false;
        let status: string;
        let repeatCount = 0;
        let startedAt: FuzzyDateInput | null = null;
        let completedAt: FuzzyDateInput | null = null;

        if (mediaInfo.type === 'movie') {
            // Movies are always "completed" when watched
            episodeNumber = 1;
            isCompleted = true;

            if (existingEntry) {
                // Movie already exists - this is a rewatch
                // Store original completion date before overwriting (only on first rewatch)
                if (
                    existingEntry.completedAt &&
                    (existingEntry.repeat || 0) === 0
                ) {
                    await this.storeOriginalCompletionDate(
                        anilistId,
                        existingEntry.completedAt
                    );
                }

                status = 'REPEATING';
                repeatCount = (existingEntry.repeat || 0) + 1;
                startedAt = existingEntry.startedAt; // Keep original start date
                completedAt = currentDate; // Update completion date
            } else {
                // First time watching this movie
                status = 'COMPLETED';
                repeatCount = 0;
                startedAt = currentDate;
                completedAt = currentDate;
            }
        } else {
            // TV shows use episode info
            episodeNumber = episodeInfo?.number || 1;
            const totalEpisodes = anilistMedia.episodes;
            isCompleted = totalEpisodes && episodeNumber >= totalEpisodes;

            if (existingEntry) {
                // Show already exists - handle episode progression and rewatch detection
                const existingProgress = existingEntry.progress || 0;
                const existingStatus = existingEntry.status;

                // IMPORTANT: Watching episodes less than current progress should be ignored
                // This is just checking out previous episodes, not a scrobble/update
                if (
                    episodeNumber < existingProgress &&
                    existingStatus !== 'REPEATING'
                ) {
                    // User is just viewing a previous episode - don't update entry
                    // Return the existing entry ID without changes
                    return { historyId: existingEntry.id };
                }

                // Determine if this is a rewatch scenario
                const isSeriesRewatch =
                    // Watching episode 1 of a completed series (starting rewatch)
                    (episodeNumber === 1 && existingStatus === 'COMPLETED') ||
                    // Already in REPEATING status (continuing rewatch)
                    existingStatus === 'REPEATING';

                if (isSeriesRewatch) {
                    // This is a rewatch
                    if (existingStatus === 'COMPLETED' && episodeNumber === 1) {
                        // Starting a new rewatch from episode 1
                        // Store original completion date before clearing (only on first rewatch)
                        if (
                            existingEntry.completedAt &&
                            (existingEntry.repeat || 0) === 0
                        ) {
                            await this.storeOriginalCompletionDate(
                                anilistId,
                                existingEntry.completedAt
                            );
                        }

                        status = 'REPEATING';
                        repeatCount = (existingEntry.repeat || 0) + 1;
                        startedAt = existingEntry.startedAt; // Keep original start date
                        completedAt = null; // Clear completion date for rewatch
                    } else if (existingStatus === 'REPEATING') {
                        // Continue existing rewatch - only update if progressing forward
                        if (episodeNumber >= existingProgress) {
                            status = 'REPEATING'; // Stay in REPEATING regardless of completion
                            repeatCount = existingEntry.repeat || 0;
                            startedAt = existingEntry.startedAt;
                            completedAt = isCompleted
                                ? currentDate
                                : existingEntry.completedAt;
                        } else {
                            // Watching previous episode during rewatch - don't update
                            return { historyId: existingEntry.id };
                        }
                    } else {
                        // Should not reach here, but handle gracefully
                        status = existingStatus;
                        repeatCount = existingEntry.repeat || 0;
                        startedAt = existingEntry.startedAt;
                        completedAt = existingEntry.completedAt;
                    }
                } else {
                    // Normal episode progression (not a rewatch)
                    if (episodeNumber > existingProgress) {
                        // Progressing forward normally
                        status = isCompleted ? 'COMPLETED' : 'CURRENT';
                        repeatCount = existingEntry.repeat || 0;
                        startedAt = existingEntry.startedAt || currentDate;

                        // Set completion date if completing for first time
                        if (isCompleted && existingStatus !== 'COMPLETED') {
                            completedAt = currentDate;
                        } else {
                            completedAt = existingEntry.completedAt;
                        }
                    } else if (episodeNumber === existingProgress) {
                        // Watching same episode again - don't update entry
                        return { historyId: existingEntry.id };
                    } else {
                        // episodeNumber < existingProgress is already handled above
                        // This should not happen, but provide fallback
                        status = existingStatus;
                        repeatCount = existingEntry.repeat || 0;
                        startedAt = existingEntry.startedAt;
                        completedAt = existingEntry.completedAt;
                    }
                }
            } else {
                // First time watching this show
                status = isCompleted ? 'COMPLETED' : 'CURRENT';
                repeatCount = 0;
                startedAt = currentDate;
                completedAt = isCompleted ? currentDate : null;
            }
        }

        // Use enhanced SaveMediaListEntry mutation with date tracking
        const mutation = `
            mutation($mediaId: Int!, $status: MediaListStatus!, $progress: Int!, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput, $repeat: Int) {
                SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, startedAt: $startedAt, completedAt: $completedAt, repeat: $repeat) {
                    id
                    progress
                    status
                    startedAt {
                        year
                        month
                        day
                    }
                    completedAt {
                        year
                        month
                        day
                    }
                    repeat
                }
            }
        `;

        const mutationVariables = {
            mediaId: anilistId,
            status: status,
            progress: episodeNumber,
            startedAt: startedAt,
            completedAt: completedAt,
            repeat: repeatCount
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
     * Remove item from watch history with smart undo logic
     */
    async removeFromHistory(historyId: number | string): Promise<void> {
        // Check authentication by attempting to get the token from storage
        const tokenData = await chrome.storage.local.get([
            'anilistAccessToken'
        ]);
        if (!tokenData.anilistAccessToken) {
            throw new Error('Not authenticated with AniList');
        }

        // Validate and convert ID
        let numericId: number;
        if (typeof historyId === 'string') {
            numericId = parseInt(historyId, 10);
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

        // AniList uses 32-bit signed integers for IDs
        const MAX_32BIT_INT = 2147483647;
        const MIN_32BIT_INT = -2147483648;

        if (numericId > MAX_32BIT_INT || numericId < MIN_32BIT_INT) {
            console.log(
                `⚠️ Skipping AniList removal - ID ${numericId} appears to be from another service (exceeds 32-bit range)`
            );
            throw new Error(
                `Cannot remove AniList entry: ID ${numericId} is not a valid AniList ID (likely from another service)`
            );
        }

        // Get current entry state to determine smart undo action
        const currentEntry = await this.getEntryById(numericId);
        if (!currentEntry) {
            throw new Error('Entry not found or already removed');
        }

        const undoAction = await this.determineUndoAction(currentEntry);

        if (undoAction.action === 'delete') {
            // Delete entire entry (first watch undo)
            await this.deleteMediaListEntry(numericId);
            // Clean up stored original completion date since entry is deleted
            await this.clearOriginalCompletionDate(currentEntry.mediaId);
        } else if (undoAction.action === 'update') {
            // Update entry to previous state (rewatch/episode undo)
            await this.updateMediaListEntry(numericId, undoAction.newState);
        }
    }

    /**
     * Get MediaList entry by ID
     */
    private async getEntryById(entryId: number): Promise<any | null> {
        try {
            const query = `
                query GetMediaListEntryById($id: Int) {
                    MediaList(id: $id) {
                        id
                        mediaId
                        status
                        progress
                        repeat
                        startedAt {
                            year
                            month
                            day
                        }
                        completedAt {
                            year
                            month
                            day
                        }
                        media {
                            episodes
                            format
                        }
                    }
                }
            `;

            const response = await this.makeGraphQLRequest(query, {
                id: entryId
            });
            return response.data?.MediaList || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Determine what undo action to take based on entry state
     */
    private async determineUndoAction(entry: any): Promise<{
        action: 'delete' | 'update';
        newState?: any;
    }> {
        const isMovie = entry.media.format === 'MOVIE';
        const progress = entry.progress || 0;
        const repeat = entry.repeat || 0;
        const status = entry.status;

        if (isMovie) {
            // Movie undo logic
            if (repeat > 0) {
                // Movie has rewatches - decrement repeat count
                // Try to restore original completion date if this is the last rewatch
                let restoredCompletedAt = null;
                if (repeat === 1) {
                    // This is undoing the last rewatch - restore original completion date
                    restoredCompletedAt = await this.getOriginalCompletionDate(
                        entry.mediaId
                    );
                    // Clean up stored date since we've restored it
                    if (restoredCompletedAt) {
                        await this.clearOriginalCompletionDate(entry.mediaId);
                    }
                }

                return {
                    action: 'update',
                    newState: {
                        status: repeat === 1 ? 'COMPLETED' : 'REPEATING',
                        repeat: repeat - 1,
                        completedAt: restoredCompletedAt
                    }
                };
            } else {
                // First watch - delete entire entry
                // Clean up any stored original completion date
                await this.clearOriginalCompletionDate(entry.mediaId);
                return { action: 'delete' };
            }
        } else {
            // Show undo logic
            if (status === 'REPEATING') {
                if (progress === 1 && repeat > 0) {
                    // Undoing start of rewatch - revert to completed
                    // Try to restore original completion date if this is the last rewatch
                    let restoredCompletedAt = null;
                    if (repeat === 1) {
                        // This is undoing the last rewatch - restore original completion date
                        restoredCompletedAt =
                            await this.getOriginalCompletionDate(entry.mediaId);
                        // Clean up stored date since we've restored it
                        if (restoredCompletedAt) {
                            await this.clearOriginalCompletionDate(
                                entry.mediaId
                            );
                        }
                    }

                    return {
                        action: 'update',
                        newState: {
                            status: 'COMPLETED',
                            progress: entry.media.episodes || progress,
                            repeat: repeat - 1,
                            completedAt:
                                restoredCompletedAt || entry.completedAt
                        }
                    };
                } else if (progress > 1) {
                    // Undoing episode in rewatch - decrement progress
                    // Since rewatching is linear, we only track forward progress
                    return {
                        action: 'update',
                        newState: {
                            progress: progress - 1
                            // Don't modify completedAt - preserve existing date during rewatch
                        }
                    };
                } else {
                    // Edge case - delete entry
                    // Clean up any stored original completion date
                    await this.clearOriginalCompletionDate(entry.mediaId);
                    return { action: 'delete' };
                }
            } else if (status === 'COMPLETED') {
                if (progress > 1) {
                    // Undoing series completion - revert to previous episode
                    return {
                        action: 'update',
                        newState: {
                            status: 'CURRENT',
                            progress: progress - 1,
                            completedAt: null
                        }
                    };
                } else {
                    // Undoing first episode - delete entry
                    // Clean up any stored original completion date
                    await this.clearOriginalCompletionDate(entry.mediaId);
                    return { action: 'delete' };
                }
            } else if (status === 'CURRENT') {
                if (progress > 1) {
                    // Undoing episode - decrement progress
                    return {
                        action: 'update',
                        newState: {
                            progress: progress - 1
                        }
                    };
                } else {
                    // Undoing first episode - delete entry
                    // Clean up any stored original completion date
                    await this.clearOriginalCompletionDate(entry.mediaId);
                    return { action: 'delete' };
                }
            } else {
                // Unknown status - delete entry
                // Clean up any stored original completion date
                await this.clearOriginalCompletionDate(entry.mediaId);
                return { action: 'delete' };
            }
        }
    }

    /**
     * Delete MediaList entry completely
     */
    private async deleteMediaListEntry(entryId: number): Promise<void> {
        const mutation = `
            mutation DeleteEntry($id: Int!) {
                DeleteMediaListEntry(id: $id) {
                    deleted
                }
            }
        `;

        const response = await this.makeGraphQLRequest(mutation, {
            id: entryId
        });

        if (response.errors) {
            throw new Error(`AniList API error: ${response.errors[0].message}`);
        }

        if (!response.data.DeleteMediaListEntry?.deleted) {
            throw new Error('Failed to remove entry from AniList');
        }
    }

    /**
     * Update MediaList entry to previous state
     */
    private async updateMediaListEntry(
        entryId: number,
        newState: any
    ): Promise<void> {
        const mutation = `
            mutation UpdateEntry($id: Int!, $status: MediaListStatus, $progress: Int, $repeat: Int, $completedAt: FuzzyDateInput) {
                SaveMediaListEntry(id: $id, status: $status, progress: $progress, repeat: $repeat, completedAt: $completedAt) {
                    id
                    status
                    progress
                    repeat
                }
            }
        `;

        const variables = {
            id: entryId,
            status: newState.status,
            progress: newState.progress,
            repeat: newState.repeat,
            completedAt: newState.completedAt
        };

        const response = await this.makeGraphQLRequest(mutation, variables);

        if (response.errors) {
            throw new Error(`AniList API error: ${response.errors[0].message}`);
        }
    }

    /**
     * Rating Methods
     */

    /**
     * Rate a movie (anime movie)
     */
    async rateMovie(movieIds: ServiceMediaIds, rating: number): Promise<void> {
        // AniList treats movies as anime, so we can rate them
        await this.rateAnimeByMediaInfo('movie', movieIds, rating);
    }

    /**
     * Rate a show (anime series)
     */
    async rateShow(showIds: ServiceMediaIds, rating: number): Promise<void> {
        await this.rateAnimeByMediaInfo('show', showIds, rating);
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
     * Rate anime by media info (helper method for both movies and shows)
     */
    private async rateAnimeByMediaInfo(
        type: 'movie' | 'show',
        mediaIds: ServiceMediaIds,
        rating: number
    ): Promise<void> {
        console.log(`⭐ AniList: Starting rating process for ${type}`, {
            mediaIds,
            rating
        });

        // Check authentication
        const tokenData = await chrome.storage.local.get([
            'anilistAccessToken'
        ]);
        if (!tokenData.anilistAccessToken) {
            console.log('❌ AniList: Not authenticated');
            throw new Error('Not authenticated with AniList');
        }
        console.log('✅ AniList: Authenticated');

        // Validate rating (1-10 scale)
        if (rating < 1 || rating > 10) {
            console.log('❌ AniList: Invalid rating:', rating);
            throw new Error('Rating must be between 1 and 10');
        }
        console.log('✅ AniList: Rating validation passed:', rating);

        // Get user's score format preference
        console.log('🔍 AniList: Getting user score format...');
        const userScoreFormat = await this.getUserScoreFormat();
        console.log('📊 AniList: User score format:', userScoreFormat);

        // Convert our 1-10 rating to user's preferred format
        const convertedScore = this.convertRatingToAniListFormat(
            rating,
            userScoreFormat
        );
        console.log('🔄 AniList: Converted score:', {
            original: rating,
            converted: convertedScore,
            format: userScoreFormat
        });

        // Try to find the anime using cached media context or search
        const anilistMedia = await this.findAnimeForRating(type, mediaIds);

        if (!anilistMedia) {
            console.log('❌ AniList: Could not find anime for rating');
            throw new Error(
                `Could not find ${type} on AniList for rating. Please ensure the anime exists on AniList and try rating from the media page.`
            );
        }

        // Rate the anime using SaveMediaListEntry mutation
        console.log('⭐ AniList: Setting rating...', {
            anilistId: anilistMedia.id,
            score: convertedScore
        });
        await this.setAnimeRating(anilistMedia.id, convertedScore);
        console.log('✅ AniList: Rating completed successfully');
    }

    /**
     * Find anime on AniList for rating using available identifiers
     */
    private async findAnimeForRating(
        type: 'movie' | 'show',
        mediaIds: ServiceMediaIds
    ): Promise<any | null> {
        console.log('🔍 AniList: Finding anime for rating...', {
            type,
            mediaIds
        });

        // Try to get recently viewed media context from storage
        const recentMediaData = await chrome.storage.local.get([
            'tmsync_recent_media'
        ]);
        const recentMedia = recentMediaData.tmsync_recent_media;

        console.log('📦 Recent media context:', recentMedia);

        if (recentMedia && recentMedia.type === type) {
            // Use the title from recent media context
            const title =
                type === 'movie'
                    ? recentMedia.movie?.title
                    : recentMedia.show?.title;
            if (title) {
                console.log(`🔍 Searching AniList for ${type}: "${title}"`);
                const searchResults = await this.searchAnimeByTitle(title);
                console.log('📋 AniList search results:', searchResults);

                if (searchResults.length > 0) {
                    console.log('✅ Found anime on AniList:', searchResults[0]);
                    return searchResults[0]; // Return best match
                } else {
                    console.log(
                        '❌ No anime found on AniList for title:',
                        title
                    );
                }
            } else {
                console.log('❌ No title found in recent media context');
            }
        } else {
            console.log('❌ No recent media context or type mismatch');
        }

        // Fallback: If no recent context, show helpful error
        return null;
    }

    /**
     * Get user's preferred score format from AniList
     */
    private async getUserScoreFormat(): Promise<string> {
        const query = `
            query {
                Viewer {
                    mediaListOptions {
                        scoreFormat
                    }
                }
            }
        `;

        const response = await this.makeGraphQLRequest(query);
        return (
            response.data?.Viewer?.mediaListOptions?.scoreFormat || 'POINT_10'
        );
    }

    /**
     * Convert our 1-10 rating to AniList's score format
     */
    private convertRatingToAniListFormat(
        rating: number,
        scoreFormat: string
    ): number {
        switch (scoreFormat) {
            case 'POINT_100':
                return Math.round(rating * 10); // 1-10 -> 10-100
            case 'POINT_10_DECIMAL':
                return rating; // 1-10 -> 1.0-10.0 (will be sent as float)
            case 'POINT_10':
                return Math.round(rating); // 1-10 -> 1-10
            case 'POINT_5':
                return Math.round(rating / 2); // 1-10 -> 1-5 (stars)
            case 'POINT_3':
                // 1-3 = 1 (sad), 4-6 = 2 (neutral), 7-10 = 3 (happy)
                if (rating <= 3) return 1;
                if (rating <= 6) return 2;
                return 3;
            default:
                return rating; // Fallback to 1-10
        }
    }

    /**
     * Search for anime by title on AniList
     */
    private async searchAnimeByTitle(title: string): Promise<any[]> {
        console.log(`🔍 AniList: Searching for anime with title: "${title}"`);

        const searchQuery = `
            query ($search: String) {
                Page(page: 1, perPage: 10) {
                    media(search: $search, type: ANIME) {
                        id
                        title {
                            romaji
                            english
                            native
                        }
                        format
                        seasonYear
                    }
                }
            }
        `;

        try {
            const response = await this.makeGraphQLRequest(
                searchQuery,
                { search: title },
                false
            );
            const results = response.data?.Page?.media || [];
            console.log(
                `📊 AniList: Found ${results.length} search results:`,
                results
            );

            // Try to find exact or close matches
            const exactMatches = results.filter((anime: any) => {
                const titles = [
                    anime.title.romaji,
                    anime.title.english,
                    anime.title.native
                ].filter(Boolean);

                return titles.some(
                    (animeTitle: string) =>
                        animeTitle.toLowerCase() === title.toLowerCase() ||
                        animeTitle
                            .toLowerCase()
                            .includes(title.toLowerCase()) ||
                        title.toLowerCase().includes(animeTitle.toLowerCase())
                );
            });

            console.log(
                `🎯 AniList: Found ${exactMatches.length} close matches:`,
                exactMatches
            );

            return exactMatches.length > 0 ? exactMatches : results;
        } catch (error) {
            console.error('❌ AniList: Search failed:', error);
            return [];
        }
    }

    /**
     * Set rating for anime using SaveMediaListEntry mutation
     */
    private async setAnimeRating(
        anilistId: number,
        score: number
    ): Promise<void> {
        const mutation = `
            mutation($mediaId: Int!, $score: Float) {
                SaveMediaListEntry(mediaId: $mediaId, score: $score) {
                    id
                    score
                    status
                }
            }
        `;

        const variables = {
            mediaId: anilistId,
            score: score
        };

        const response = await this.makeGraphQLRequest(mutation, variables);

        if (response.errors) {
            throw new Error(`AniList API error: ${response.errors[0].message}`);
        }

        const action =
            score === 0 ? 'removed rating from' : `rated with score ${score}`;
        console.log(`✅ Successfully ${action} anime ${anilistId}`);
    }

    /**
     * Unrating Methods
     */

    /**
     * Remove rating from a movie (anime movie)
     */
    async unrateMovie(movieIds: ServiceMediaIds): Promise<void> {
        await this.unrateAnimeByMediaInfo('movie', movieIds);
    }

    /**
     * Remove rating from a show (anime series)
     */
    async unrateShow(showIds: ServiceMediaIds): Promise<void> {
        await this.unrateAnimeByMediaInfo('show', showIds);
    }

    /**
     * Remove rating from a season (not applicable for AniList)
     */
    async unrateSeason(
        showIds: ServiceMediaIds,
        seasonNumber: number
    ): Promise<void> {
        throw new Error('AniList does not support season-specific ratings');
    }

    /**
     * Remove rating from an episode (not applicable for AniList)
     */
    async unrateEpisode(
        showIds: ServiceMediaIds,
        seasonNumber: number,
        episodeNumber: number
    ): Promise<void> {
        throw new Error('AniList does not support episode-specific ratings');
    }

    /**
     * Unrate anime by media info (helper method for both movies and shows)
     */
    private async unrateAnimeByMediaInfo(
        type: 'movie' | 'show',
        mediaIds: ServiceMediaIds
    ): Promise<void> {
        console.log(`🚫 AniList: Starting unrate process for ${type}`, {
            mediaIds
        });

        // Check authentication
        const tokenData = await chrome.storage.local.get([
            'anilistAccessToken'
        ]);
        if (!tokenData.anilistAccessToken) {
            console.log('❌ AniList: Not authenticated');
            throw new Error('Not authenticated with AniList');
        }
        console.log('✅ AniList: Authenticated');

        // Try to find the anime using cached media context or search
        const anilistMedia = await this.findAnimeForRating(type, mediaIds);

        if (!anilistMedia) {
            console.log('❌ AniList: Could not find anime for unrating');
            throw new Error(
                `Could not find ${type} on AniList for unrating. Please ensure the anime exists on AniList.`
            );
        }

        // Unrate the anime using SaveMediaListEntry mutation with 0 score
        console.log('🚫 AniList: Removing rating...', {
            anilistId: anilistMedia.id
        });
        await this.setAnimeRating(anilistMedia.id, 0);
        console.log('✅ AniList: Rating removed successfully');
    }

    /**
     * Comment Methods (AniList Notes)
     * Note: AniList only supports show-level notes, no episode/season level
     */

    /**
     * Get notes for media (show-level only)
     */
    async getComments(
        type: 'movie' | 'show' | 'season' | 'episode',
        mediaInfo: MediaInfoResponse,
        _episodeInfo?: SeasonEpisodeObj
    ): Promise<ServiceComment[]> {
        // AniList only supports show-level notes, map all types to show
        const mediaType = type === 'movie' || type === 'show' ? type : 'show';

        // Use the same search approach as rating methods
        const recentMediaData = await chrome.storage.local.get([
            'tmsync_recent_media'
        ]);
        const recentMedia = recentMediaData.tmsync_recent_media;

        if (!recentMedia || recentMedia.type !== mediaType) {
            console.log('No recent media context found for AniList notes');
            return [];
        }

        try {
            const title =
                mediaType === 'movie'
                    ? recentMedia.movie?.title
                    : recentMedia.show?.title;
            if (!title) {
                console.log('No title found in recent media context');
                return [];
            }

            // Search for the anime first
            const searchResults = await this.searchAnimeByTitle(title);
            if (searchResults.length === 0) {
                console.log('No AniList media found for notes');
                return [];
            }

            const anilistMedia = searchResults[0];
            const userId = await this.getUserId();

            const query = `
                query GetMediaListEntry($mediaId: Int, $userId: Int) {
                    MediaList(mediaId: $mediaId, userId: $userId) {
                        id
                        notes
                        updatedAt
                        user {
                            id
                            name
                        }
                    }
                }
            `;

            const variables = {
                mediaId: anilistMedia.id,
                userId: userId
            };

            const response = await this.makeGraphQLRequest(query, variables);
            const mediaListEntry = response.data.MediaList;

            if (!mediaListEntry || !mediaListEntry.notes) {
                return [];
            }

            // Convert to ServiceComment format
            const serviceComment: ServiceComment = {
                id: mediaListEntry.id,
                comment: mediaListEntry.notes,
                spoiler: false, // AniList doesn't support spoiler flags
                createdAt: new Date(
                    mediaListEntry.updatedAt * 1000
                ).toISOString(),
                updatedAt: new Date(
                    mediaListEntry.updatedAt * 1000
                ).toISOString(),
                user: {
                    username: mediaListEntry.user.name,
                    name: mediaListEntry.user.name
                },
                serviceData: {
                    anilistId: mediaListEntry.id,
                    mediaId: anilistMedia.id
                },
                serviceType: 'anilist' as ServiceType
            };

            return [serviceComment];
        } catch (error) {
            console.error('Error fetching AniList notes:', error);
            return [];
        }
    }

    /**
     * Post/update notes for media (show-level only)
     */
    async postComment(
        type: 'movie' | 'show' | 'season' | 'episode',
        mediaInfo: MediaInfoResponse,
        comment: string,
        _spoiler: boolean, // Ignored for AniList
        _episodeInfo?: SeasonEpisodeObj
    ): Promise<ServiceComment> {
        // AniList only supports show-level notes, map all types to show
        const mediaType = type === 'movie' || type === 'show' ? type : 'show';

        // Use the same search approach as rating methods
        const recentMediaData = await chrome.storage.local.get([
            'tmsync_recent_media'
        ]);
        const recentMedia = recentMediaData.tmsync_recent_media;

        if (!recentMedia || recentMedia.type !== mediaType) {
            throw new Error('No recent media context found for AniList notes');
        }

        const title =
            mediaType === 'movie'
                ? recentMedia.movie?.title
                : recentMedia.show?.title;
        if (!title) {
            throw new Error('No title found in recent media context');
        }

        // Search for the anime first
        const searchResults = await this.searchAnimeByTitle(title);
        if (searchResults.length === 0) {
            throw new Error('No AniList media found for notes');
        }

        const anilistMedia = searchResults[0];

        try {
            const mutation = `
                mutation SaveMediaListEntry($mediaId: Int, $notes: String) {
                    SaveMediaListEntry(mediaId: $mediaId, notes: $notes) {
                        id
                        notes
                        updatedAt
                        user {
                            id
                            name
                        }
                    }
                }
            `;

            const variables = {
                mediaId: anilistMedia.id,
                notes: comment
            };

            const response = await this.makeGraphQLRequest(mutation, variables);
            const mediaListEntry = response.data.SaveMediaListEntry;

            // Convert to ServiceComment format
            const serviceComment: ServiceComment = {
                id: mediaListEntry.id,
                comment: mediaListEntry.notes,
                spoiler: false, // AniList doesn't support spoiler flags
                createdAt: new Date(
                    mediaListEntry.updatedAt * 1000
                ).toISOString(),
                updatedAt: new Date(
                    mediaListEntry.updatedAt * 1000
                ).toISOString(),
                user: {
                    username: mediaListEntry.user.name,
                    name: mediaListEntry.user.name
                },
                serviceData: {
                    anilistId: mediaListEntry.id,
                    mediaId: anilistMedia.id
                },
                serviceType: 'anilist' as ServiceType
            };

            return serviceComment;
        } catch (error) {
            console.error('Error saving AniList notes:', error);
            throw error;
        }
    }

    /**
     * Update existing notes
     */
    async updateComment(
        commentId: number | string,
        comment: string,
        _spoiler: boolean // Ignored for AniList
    ): Promise<ServiceComment> {
        // For AniList, updating is the same as posting since it's MediaList entry based
        // We need to get the media ID from the comment ID (which is the MediaList entry ID)
        try {
            const mutation = `
                mutation SaveMediaListEntry($id: Int, $notes: String) {
                    SaveMediaListEntry(id: $id, notes: $notes) {
                        id
                        notes
                        updatedAt
                        user {
                            id
                            name
                        }
                    }
                }
            `;

            const variables = {
                id: commentId,
                notes: comment
            };

            const response = await this.makeGraphQLRequest(mutation, variables);
            const mediaListEntry = response.data.SaveMediaListEntry;

            // Convert to ServiceComment format
            const serviceComment: ServiceComment = {
                id: mediaListEntry.id,
                comment: mediaListEntry.notes,
                spoiler: false, // AniList doesn't support spoiler flags
                createdAt: new Date(
                    mediaListEntry.updatedAt * 1000
                ).toISOString(),
                updatedAt: new Date(
                    mediaListEntry.updatedAt * 1000
                ).toISOString(),
                user: {
                    username: mediaListEntry.user.name,
                    name: mediaListEntry.user.name
                },
                serviceData: {
                    anilistId: mediaListEntry.id,
                    mediaId: null // We don't have this from the update response
                },
                serviceType: 'anilist' as ServiceType
            };

            return serviceComment;
        } catch (error) {
            console.error('Error updating AniList notes:', error);
            throw error;
        }
    }

    /**
     * Delete notes (submit blank notes)
     */
    async deleteComment(commentId: number | string): Promise<void> {
        // For AniList, delete means setting notes to empty string
        try {
            const mutation = `
                mutation SaveMediaListEntry($id: Int, $notes: String) {
                    SaveMediaListEntry(id: $id, notes: $notes) {
                        id
                        notes
                    }
                }
            `;

            const variables = {
                id: commentId,
                notes: ''
            };

            await this.makeGraphQLRequest(mutation, variables);
        } catch (error) {
            console.error('Error deleting AniList notes:', error);
            throw error;
        }
    }

    /**
     * Check if media already exists in user's list
     */
    private async getExistingMediaListEntry(
        mediaId: number
    ): Promise<any | null> {
        try {
            const query = `
                query GetMediaListEntry($mediaId: Int, $userId: Int) {
                    MediaList(mediaId: $mediaId, userId: $userId) {
                        id
                        status
                        progress
                        repeat
                        startedAt {
                            year
                            month
                            day
                        }
                        completedAt {
                            year
                            month
                            day
                        }
                    }
                }
            `;

            const userId = await this.getUserId();
            const response = await this.makeGraphQLRequest(query, {
                mediaId: mediaId,
                userId: userId
            });

            return response.data?.MediaList || null;
        } catch (error) {
            // If entry doesn't exist or query fails, return null
            return null;
        }
    }

    /**
     * Original Completion Date Storage Methods
     */

    /**
     * Store original completion date before overwriting during rewatch
     */
    private async storeOriginalCompletionDate(
        mediaId: number,
        originalCompletedAt: FuzzyDateInput | null
    ): Promise<void> {
        if (!originalCompletedAt) return; // Nothing to store

        try {
            const storageKey = 'anilist_original_completion_dates';
            const data = await chrome.storage.local.get(storageKey);
            const originalDates = data[storageKey] || {};

            // Store the original completion date for this media
            originalDates[`media_${mediaId}`] = originalCompletedAt;

            await chrome.storage.local.set({ [storageKey]: originalDates });
            console.log(
                `📅 Stored original completion date for media ${mediaId}:`,
                originalCompletedAt
            );
        } catch (error) {
            console.error('Failed to store original completion date:', error);
            // Don't throw - this is not critical for the main operation
        }
    }

    /**
     * Retrieve original completion date for undo operations
     */
    private async getOriginalCompletionDate(
        mediaId: number
    ): Promise<FuzzyDateInput | null> {
        try {
            const storageKey = 'anilist_original_completion_dates';
            const data = await chrome.storage.local.get(storageKey);
            const originalDates = data[storageKey] || {};

            const originalDate = originalDates[`media_${mediaId}`] || null;
            console.log(
                `📅 Retrieved original completion date for media ${mediaId}:`,
                originalDate
            );
            return originalDate;
        } catch (error) {
            console.error(
                'Failed to retrieve original completion date:',
                error
            );
            return null;
        }
    }

    /**
     * Clear original completion date from storage (when no longer needed)
     */
    private async clearOriginalCompletionDate(mediaId: number): Promise<void> {
        try {
            const storageKey = 'anilist_original_completion_dates';
            const data = await chrome.storage.local.get(storageKey);
            const originalDates = data[storageKey] || {};

            delete originalDates[`media_${mediaId}`];

            await chrome.storage.local.set({ [storageKey]: originalDates });
            console.log(
                `🗑️ Cleared original completion date for media ${mediaId}`
            );
        } catch (error) {
            console.error('Failed to clear original completion date:', error);
            // Don't throw - this is not critical
        }
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

    /**
     * Get AniList media ID from MediaInfoResponse
     */
    private getAniListMediaId(mediaInfo: MediaInfoResponse): number | null {
        // Try to find AniList ID from the media info
        // This could be from various sources like recent media context or search results

        // For now, we'll need to use the search/context approach similar to findAnimeForRating
        // This is a simplified version - in practice, you'd want to cache this
        return null; // Will be handled by search in the calling methods
    }

    /**
     * Get current user ID from AniList
     */
    private async getUserId(): Promise<number> {
        try {
            const query = `
                query {
                    Viewer {
                        id
                    }
                }
            `;

            const response = await this.makeGraphQLRequest(query);
            const userId = response.data?.Viewer?.id;

            if (!userId) {
                throw new Error('Could not get user ID from AniList');
            }

            return userId;
        } catch (error) {
            console.error('Error getting AniList user ID:', error);
            throw error;
        }
    }
}

// Export singleton instance
export const aniListService = new AniListService();
