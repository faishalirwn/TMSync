/**
 * Service Status Indicator - Content Script Component
 *
 * Shows real-time status of all tracking services during video playback
 */

import React from 'react';
import { useServiceStatus } from '../../../hooks/useServiceStatus';
import {
    ServiceStatus,
    ServiceActivityState
} from '../../../types/serviceStatus';

interface ServiceStatusBadgeProps {
    status: ServiceStatus;
}

const ServiceStatusBadge: React.FC<ServiceStatusBadgeProps> = ({ status }) => {
    const getStatusColor = (state: ServiceActivityState): string => {
        switch (state) {
            case 'idle':
                return status.isAuthenticated ? 'bg-green-500' : 'bg-gray-400';
            case 'starting_scrobble':
            case 'scrobbling':
            case 'pausing_scrobble':
            case 'stopping_scrobble':
                return 'bg-blue-500 animate-pulse';
            case 'tracking_progress':
                return status.isAuthenticated ? 'bg-purple-500' : 'bg-gray-400';
            case 'updating_progress':
                return 'bg-purple-500 animate-pulse';
            case 'rating':
            case 'commenting':
                return 'bg-yellow-500 animate-pulse';
            case 'error':
                return 'bg-red-500';
            case 'disabled':
                return 'bg-gray-300';
            default:
                return 'bg-gray-400';
        }
    };

    const getStatusText = (state: ServiceActivityState): string => {
        switch (state) {
            case 'idle':
                return status.isAuthenticated ? 'Ready' : 'Not logged in';
            case 'starting_scrobble':
                return 'Starting scrobble...';
            case 'scrobbling':
                return 'Scrobbling';
            case 'pausing_scrobble':
                return 'Pausing scrobble...';
            case 'stopping_scrobble':
                return 'Stopping scrobble...';
            case 'tracking_progress':
                return 'Tracking progress';
            case 'updating_progress':
                return 'Updating progress...';
            case 'rating':
                return 'Rating...';
            case 'commenting':
                return 'Commenting...';
            case 'error':
                return status.errorMessage || 'Error';
            case 'disabled':
                return 'Disabled';
            default:
                return 'Unknown';
        }
    };

    const getServiceDisplayName = (serviceType: string): string => {
        switch (serviceType) {
            case 'trakt':
                return 'Trakt';
            case 'anilist':
                return 'AniList';
            case 'myanimelist':
                return 'MAL';
            default:
                return (
                    serviceType.charAt(0).toUpperCase() + serviceType.slice(1)
                );
        }
    };

    const statusColor = getStatusColor(status.activityState);
    const statusText = getStatusText(status.activityState);
    const serviceName = getServiceDisplayName(status.serviceType);

    return (
        <div className="flex items-center gap-2 px-2 py-1 bg-black bg-opacity-60 rounded text-white text-sm">
            <div className={`w-2 h-2 rounded-full ${statusColor}`} />
            <span className="font-medium">{serviceName}</span>
            <span className="text-gray-300">{statusText}</span>
            {status.activityState === 'error' && status.errorMessage && (
                <span
                    className="text-red-300 text-xs"
                    title={status.errorMessage}
                >
                    ⚠️
                </span>
            )}
        </div>
    );
};

interface ServiceStatusIndicatorProps {
    className?: string;
}

export const ServiceStatusIndicator: React.FC<ServiceStatusIndicatorProps> = ({
    className = ''
}) => {
    const { serviceStatuses, isLoading } = useServiceStatus();

    if (isLoading) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                <div className="text-white text-sm bg-black bg-opacity-60 px-2 py-1 rounded">
                    Loading services...
                </div>
            </div>
        );
    }

    if (serviceStatuses.length === 0) {
        return null;
    }

    return (
        <div className={`flex flex-col gap-1 ${className}`}>
            {serviceStatuses.map((status) => (
                <ServiceStatusBadge key={status.serviceType} status={status} />
            ))}
        </div>
    );
};
