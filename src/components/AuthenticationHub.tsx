import React from 'react';
import { useMultiServiceAuth } from '../hooks/useMultiServiceAuth';
import { ServiceType } from '../types/serviceTypes';

interface ServiceAuthCardProps {
    serviceType: ServiceType;
    isLoggedIn: boolean;
    username: string | null;
    isLoading: boolean;
    error: string | null;
    onLogin: () => Promise<void>;
    onLogout: () => Promise<void>;
    onClearError: () => void;
    capabilities: {
        supportsScrobbling: boolean;
        supportsRatings: boolean;
        supportsComments: boolean;
        supportedMediaTypes: ('movie' | 'show')[];
    };
}

const ServiceAuthCard: React.FC<ServiceAuthCardProps> = ({
    serviceType,
    isLoggedIn,
    username,
    isLoading,
    error,
    onLogin,
    onLogout,
    onClearError,
    capabilities
}) => {
    const serviceName =
        serviceType.charAt(0).toUpperCase() + serviceType.slice(1);

    const getStatusColor = () => {
        if (error) return 'text-red-500';
        if (isLoggedIn) return 'text-green-500';
        return 'text-gray-500';
    };

    const getStatusText = () => {
        if (isLoading) return 'Checking...';
        if (error) return 'Error';
        if (isLoggedIn) return `Logged in${username ? ` as ${username}` : ''}`;
        return 'Not authenticated';
    };

    const getCapabilityText = () => {
        const caps = [];
        if (capabilities.supportsScrobbling) caps.push('Scrobbling');
        if (capabilities.supportsRatings) caps.push('Ratings');
        if (capabilities.supportsComments) caps.push('Comments');

        const mediaTypes = capabilities.supportedMediaTypes.join(', ');
        return `${caps.join(', ')} • ${mediaTypes}`;
    };

    return (
        <div className="border border-(--color-border) rounded-lg p-4 bg-(--color-surface-1)">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h3 className="text-lg font-semibold text-(--color-text-primary)">
                        {serviceName}
                    </h3>
                    <p className={`text-sm ${getStatusColor()}`}>
                        {getStatusText()}
                    </p>
                </div>

                <div className="flex gap-2">
                    {error && (
                        <button
                            onClick={onClearError}
                            className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                            title="Clear error"
                        >
                            Clear
                        </button>
                    )}

                    {isLoggedIn ? (
                        <button
                            onClick={onLogout}
                            disabled={isLoading}
                            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                        >
                            {isLoading ? 'Loading...' : 'Logout'}
                        </button>
                    ) : (
                        <button
                            onClick={onLogin}
                            disabled={isLoading}
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                            {isLoading ? 'Loading...' : 'Login'}
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                    {error}
                </div>
            )}

            <div className="text-sm text-(--color-text-secondary)">
                <strong>Capabilities:</strong> {getCapabilityText()}
            </div>
        </div>
    );
};

interface AuthenticationHubProps {
    showBulkActions?: boolean;
    className?: string;
}

export const AuthenticationHub: React.FC<AuthenticationHubProps> = ({
    showBulkActions = true,
    className = ''
}) => {
    const {
        services,
        authenticatedServices,
        hasAnyAuthenticated,
        isAnyLoading,
        hasAnyErrors,
        isServicesInitialized,
        loginToAll,
        logoutFromAll,
        refreshAllStatus,
        clearAllErrors
    } = useMultiServiceAuth();

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Header with summary */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-(--color-text-primary)">
                        Service Authentication
                    </h2>
                    <p className="text-sm text-(--color-text-secondary)">
                        {authenticatedServices.length} of {services.length}{' '}
                        services authenticated
                    </p>
                </div>

                {showBulkActions && services.length > 1 && (
                    <div className="flex gap-2">
                        <button
                            onClick={refreshAllStatus}
                            disabled={isAnyLoading}
                            className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                        >
                            Refresh All
                        </button>

                        {hasAnyErrors && (
                            <button
                                onClick={clearAllErrors}
                                className="px-3 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
                            >
                                Clear Errors
                            </button>
                        )}

                        {hasAnyAuthenticated && (
                            <button
                                onClick={logoutFromAll}
                                disabled={isAnyLoading}
                                className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                            >
                                Logout All
                            </button>
                        )}

                        <button
                            onClick={loginToAll}
                            disabled={isAnyLoading}
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                            Login All
                        </button>
                    </div>
                )}
            </div>

            {/* Service cards */}
            <div className="space-y-3">
                {services.map((service) => (
                    <ServiceAuthCard
                        key={service.serviceType}
                        serviceType={service.serviceType}
                        isLoggedIn={service.isLoggedIn}
                        username={service.username}
                        isLoading={service.isLoading}
                        error={service.error}
                        onLogin={service.login}
                        onLogout={service.logout}
                        onClearError={service.clearError}
                        capabilities={service.capabilities}
                    />
                ))}
            </div>

            {!isServicesInitialized && (
                <div className="text-center py-8">
                    <div className="inline-flex items-center px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                        <span className="text-blue-700">
                            Initializing services...
                        </span>
                    </div>
                </div>
            )}

            {isServicesInitialized && services.length === 0 && (
                <div className="text-center py-8 text-(--color-text-secondary)">
                    No tracking services configured
                </div>
            )}
        </div>
    );
};
