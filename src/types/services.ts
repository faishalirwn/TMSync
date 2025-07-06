import { MediaInfoResponse, SeasonEpisodeObj } from './media';
import { WatchStatusInfo } from './scrobbling';
import {
    ServiceType,
    ServiceComment,
    ServiceProgressInfo,
    ServiceMediaIds,
    ServiceMediaRatings,
    ServiceScrobbleResponse,
    ServiceCapabilities
} from './serviceTypes';

/**
 * Generic interface for all media tracking services
 *
 * This interface defines the contract that all tracking services must implement
 * to work with the TMSync multi-service architecture.
 */
export interface TrackerService {
    /**
     * Get service capabilities and configuration
     */
    getCapabilities(): ServiceCapabilities;

    /**
     * Authentication Methods
     */

    /**
     * Check if user is currently authenticated with this service
     */
    isAuthenticated(): Promise<boolean>;

    /**
     * Get current username for this service
     */
    getUsername(): Promise<string>;

    /**
     * Initiate login flow for this service
     */
    login(): Promise<void>;

    /**
     * Logout and clear stored credentials
     */
    logout(): Promise<void>;

    /**
     * Media Search and Identification Methods
     */

    /**
     * Search for media by query and type
     */
    searchMedia(
        query: string,
        type: 'movie' | 'show',
        years?: string
    ): Promise<MediaInfoResponse[]>;

    /**
     * Get media info by TMDB ID
     */
    getMediaByTmdbId(
        tmdbId: string,
        type: 'movie' | 'show'
    ): Promise<MediaInfoResponse | null>;

    /**
     * Get detailed media status including watch history and ratings
     */
    getMediaStatus(mediaInfo: MediaInfoResponse): Promise<{
        watchStatus: WatchStatusInfo;
        progressInfo: ServiceProgressInfo | null;
        ratingInfo: ServiceMediaRatings;
    }>;

    /**
     * Get media status with episode-specific ratings
     */
    getMediaStatusWithEpisode(
        mediaInfo: MediaInfoResponse,
        episodeInfo?: SeasonEpisodeObj
    ): Promise<{
        watchStatus: WatchStatusInfo;
        progressInfo: ServiceProgressInfo | null;
        ratingInfo: ServiceMediaRatings;
    }>;

    /**
     * Scrobbling Methods
     */

    /**
     * Start scrobbling media
     */
    startScrobble(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): Promise<void>;

    /**
     * Pause scrobbling
     */
    pauseScrobble(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): Promise<void>;

    /**
     * Stop scrobbling and mark as watched if threshold met
     */
    stopScrobble(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        progress: number
    ): Promise<ServiceScrobbleResponse>;

    /**
     * History Management Methods
     */

    /**
     * Add media to watch history manually
     */
    addToHistory(
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null
    ): Promise<{ historyId?: number | string }>;

    /**
     * Remove item from watch history
     */
    removeFromHistory(historyId: number | string): Promise<void>;

    /**
     * Rating Methods
     */

    /**
     * Rate a movie
     */
    rateMovie(movieIds: ServiceMediaIds, rating: number): Promise<void>;

    /**
     * Rate a show
     */
    rateShow(showIds: ServiceMediaIds, rating: number): Promise<void>;

    /**
     * Rate a season
     */
    rateSeason(
        showIds: ServiceMediaIds,
        seasonNumber: number,
        rating: number
    ): Promise<void>;

    /**
     * Rate an episode
     */
    rateEpisode(
        showIds: ServiceMediaIds,
        seasonNumber: number,
        episodeNumber: number,
        rating: number
    ): Promise<void>;

    /**
     * Unrating Methods
     */

    /**
     * Remove rating from a movie
     */
    unrateMovie(movieIds: ServiceMediaIds): Promise<void>;

    /**
     * Remove rating from a show
     */
    unrateShow(showIds: ServiceMediaIds): Promise<void>;

    /**
     * Remove rating from a season
     */
    unrateSeason(showIds: ServiceMediaIds, seasonNumber: number): Promise<void>;

    /**
     * Remove rating from an episode
     */
    unrateEpisode(
        showIds: ServiceMediaIds,
        seasonNumber: number,
        episodeNumber: number
    ): Promise<void>;

    /**
     * Comment Methods
     */

    /**
     * Get comments for media
     */
    getComments(
        type: 'movie' | 'show' | 'season' | 'episode',
        mediaInfo: MediaInfoResponse,
        episodeInfo?: SeasonEpisodeObj
    ): Promise<ServiceComment[]>;

    /**
     * Post a new comment
     */
    postComment(
        type: 'movie' | 'show' | 'season' | 'episode',
        mediaInfo: MediaInfoResponse,
        comment: string,
        spoiler: boolean,
        episodeInfo?: SeasonEpisodeObj
    ): Promise<ServiceComment>;

    /**
     * Update existing comment
     */
    updateComment(
        commentId: number | string,
        comment: string,
        spoiler: boolean
    ): Promise<ServiceComment>;

    /**
     * Delete a comment
     */
    deleteComment(commentId: number | string): Promise<void>;
}

/**
 * Configuration for a tracking service
 */
export interface ServiceConfig {
    serviceType: ServiceType;
    enabled: boolean;
    priority: number; // Lower numbers = higher priority
}

/**
 * Registry of all available tracking services
 */
export interface ServiceRegistry {
    /**
     * Get all registered services
     */
    getAllServices(): TrackerService[];

    /**
     * Get all enabled services ordered by priority
     */
    getEnabledServices(): TrackerService[];

    /**
     * Get a specific service by type
     */
    getService(serviceType: ServiceType): TrackerService | null;

    /**
     * Register a new service
     */
    registerService(service: TrackerService, config: ServiceConfig): void;

    /**
     * Update service configuration
     */
    updateServiceConfig(
        serviceType: ServiceType,
        config: Partial<ServiceConfig>
    ): void;

    /**
     * Get service configuration
     */
    getServiceConfig(serviceType: ServiceType): ServiceConfig | null;
}
