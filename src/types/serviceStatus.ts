/**
 * Service status types for real-time status indicators
 */

import { ServiceType } from './serviceTypes';

/**
 * Real-time service activity states
 */
export type ServiceActivityState =
    | 'idle' // Service available but not doing anything
    | 'starting_scrobble' // Sending real-time scrobble start request (Trakt)
    | 'scrobbling' // Active real-time scrobble session (Trakt)
    | 'pausing_scrobble' // Sending real-time scrobble pause request (Trakt)
    | 'paused' // Scrobble is paused/waiting (better than 'ready')
    | 'stopping_scrobble' // Sending real-time scrobble stop request (Trakt)
    | 'tracking_progress' // Watching for completion threshold (AniList, MAL)
    | 'updating_progress' // Sending progress update request (AniList, MAL)
    | 'rating' // Sending rating request
    | 'commenting' // Sending comment request
    | 'error' // Service encountered an error
    | 'disabled'; // Service disabled by user preference

/**
 * Service status information for real-time display
 */
export interface ServiceStatus {
    serviceType: ServiceType;
    isAuthenticated: boolean;
    activityState: ServiceActivityState;
    lastActivity?: string; // Timestamp of last activity
    errorMessage?: string; // Error details if activityState is 'error'
    isEnabled: boolean; // Whether service is enabled for current context
}

/**
 * Multi-service status update
 */
export interface MultiServiceStatus {
    services: ServiceStatus[];
    timestamp: string;
}

/**
 * Service status update event
 */
export interface ServiceStatusUpdateEvent {
    action: 'serviceStatusUpdate';
    data: MultiServiceStatus;
}
