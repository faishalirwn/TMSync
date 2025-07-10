import React from 'react';
import { ServiceType } from '../../../../types/serviceTypes';

interface CommentServiceBadgeProps {
    serviceType: ServiceType;
    isAuthenticated: boolean;
    isEnabled: boolean;
}

export const CommentServiceBadge: React.FC<CommentServiceBadgeProps> = ({
    serviceType,
    isAuthenticated,
    isEnabled
}) => {
    const getServiceName = (type: ServiceType): string => {
        switch (type) {
            case 'trakt':
                return 'Trakt';
            case 'anilist':
                return 'AniList';
            case 'myanimelist':
                return 'MAL';
            default:
                return (
                    String(type).charAt(0).toUpperCase() + String(type).slice(1)
                );
        }
    };

    const getStatusIcon = (): string => {
        if (!isEnabled) return '⚫'; // Disabled
        if (!isAuthenticated) return '⚪'; // Not authenticated
        return '🟢'; // Ready for comments
    };

    const getStatusText = (): string => {
        if (!isEnabled) return 'Disabled';
        if (!isAuthenticated) return 'Not logged in';
        return 'Ready';
    };

    const serviceName = getServiceName(serviceType);
    const icon = getStatusIcon();
    const statusText = getStatusText();

    return (
        <div className="flex items-center gap-1 text-xs">
            <span>{icon}</span>
            <span className="font-medium">{serviceName}:</span>
            <span className="text-(--color-text-secondary)">{statusText}</span>
        </div>
    );
};
