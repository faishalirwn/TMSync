/**
 * Service-agnostic types for multi-service architecture
 *
 * These types abstract away service-specific data structures,
 * allowing different tracking services to work with common interfaces.
 */

/**
 * Represents a tracking service (Trakt, AniList, MyAnimeList, etc.)
 */
export type ServiceType = 'trakt' | 'anilist' | 'myanimelist';

/**
 * Generic comment structure that works across all services
 */
export interface ServiceComment {
    id: number | string;
    comment: string;
    spoiler: boolean;
    createdAt: string;
    updatedAt?: string;
    user: {
        username: string;
        name?: string;
    };
    // Service-specific data can be stored here
    serviceData?: Record<string, any>;
    serviceType: ServiceType;
}

/**
 * Generic progress info that works across all services
 */
export interface ServiceProgressInfo {
    aired: number;
    completed: number;
    lastWatchedAt?: string;
    lastEpisode?: {
        season: number;
        number: number;
        title?: string;
    };
    seasons?: Array<{
        number: number;
        aired: number;
        completed: number;
        episodes: Array<{
            number: number;
            completed: boolean;
            watchedAt?: string;
        }>;
    }>;
    // Service-specific data
    serviceData?: Record<string, any>;
    serviceType: ServiceType;
}

/**
 * Generic media identifiers that work across all services
 */
export interface ServiceMediaIds {
    // Common identifiers
    tmdb?: number;
    imdb?: string;
    tvdb?: number;

    // Service-specific identifiers
    trakt?: number;
    anilist?: number;
    myanimelist?: number;

    // Allow for future services
    [key: string]: number | string | undefined;
}

/**
 * Service-agnostic rating info
 */
export interface ServiceRatingInfo {
    userRating: number;
    ratedAt: string;
    serviceType: ServiceType;
}

/**
 * Service-agnostic media ratings collection
 */
export interface ServiceMediaRatings {
    show?: ServiceRatingInfo;
    season?: ServiceRatingInfo;
    episode?: ServiceRatingInfo;
}

/**
 * Service-agnostic scrobble response
 */
export interface ServiceScrobbleResponse {
    action: 'watched' | 'paused_incomplete';
    historyId?: number | string;
    serviceType: ServiceType;
}

/**
 * Service-agnostic history entry
 */
export interface ServiceHistoryEntry {
    id: number | string;
    watchedAt: string;
    serviceType: ServiceType;
}

/**
 * Rating scale configuration for different services
 */
export interface ServiceRatingScale {
    min: number;
    max: number;
    step: number;
    serviceType: ServiceType;
}

/**
 * Service-specific configuration and capabilities
 */
export interface ServiceCapabilities {
    serviceType: ServiceType;

    // What features this service supports
    supportsRealTimeScrobbling: boolean; // Real-time start/pause/stop during playback (Trakt)
    supportsProgressTracking: boolean; // Episode/movie completion tracking (AniList, MAL)
    supportsRatings: boolean;
    supportsComments: boolean;
    supportsHistory: boolean;
    supportsSearch: boolean;

    // Rating system
    ratingScale: ServiceRatingScale;

    // Authentication method
    authMethod: 'oauth' | 'api_key' | 'username_password';

    // Supported media types
    supportedMediaTypes: ('movie' | 'show')[];

    // API rate limits
    rateLimits?: {
        requestsPerMinute: number;
        requestsPerHour: number;
    };
}

/**
 * Custom error for Trakt 409 Conflict responses (duplicate scrobble)
 */
export class TraktCooldownError extends Error {
    public readonly status: number = 409;
    public readonly watchedAt: Date;
    public readonly expiresAt: Date;

    constructor(message: string, watchedAt: string, expiresAt: string) {
        super(message);
        this.name = 'TraktCooldownError';
        this.watchedAt = new Date(watchedAt);
        this.expiresAt = new Date(expiresAt);
    }

    /**
     * Get remaining cooldown time in milliseconds
     */
    getRemainingCooldown(): number {
        return Math.max(0, this.expiresAt.getTime() - Date.now());
    }

    /**
     * Get user-friendly cooldown message
     */
    getCooldownMessage(): string {
        const remainingMs = this.getRemainingCooldown();
        if (remainingMs <= 0) {
            return 'You can scrobble again now';
        }

        const minutes = Math.ceil(remainingMs / (1000 * 60));
        return `Already scrobbled recently. Wait ${minutes} minute${minutes !== 1 ? 's' : ''} before scrobbling again.`;
    }
}
