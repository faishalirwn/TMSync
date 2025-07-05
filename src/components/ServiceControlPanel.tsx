import React from 'react';
import { useMultiServiceAuth } from '../hooks/useMultiServiceAuth';
import { useServicePreferences } from '../hooks/useServicePreferences';
import { ServiceAuthInfo } from '../hooks/useMultiServiceAuth';

/**
 * Service Control Panel for options page
 * Allows users to enable/disable services globally
 */
export const ServiceControlPanel: React.FC = () => {
    const { services, isServicesInitialized } = useMultiServiceAuth();
    const { preferences, isLoading, toggleService, isServiceEnabled } =
        useServicePreferences();

    if (!isServicesInitialized || isLoading) {
        return (
            <div className="bg-(--color-surface-1) rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4 text-(--color-text-primary)">
                    Service Control
                </h2>
                <p className="text-(--color-text-secondary)">
                    Loading service preferences...
                </p>
            </div>
        );
    }

    if (services.length === 0) {
        return (
            <div className="bg-(--color-surface-1) rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4 text-(--color-text-primary)">
                    Service Control
                </h2>
                <p className="text-(--color-text-secondary)">
                    No services available.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-(--color-surface-1) rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4 text-(--color-text-primary)">
                Service Control
            </h2>
            <p className="text-(--color-text-secondary) mb-4">
                Control which services handle your scrobbling, rating, and
                commenting actions. Disabled services will not be used for any
                tracking activities.
            </p>

            <div className="space-y-3">
                {services.map((service: ServiceAuthInfo) => {
                    const serviceType = service.serviceType;
                    const enabled = isServiceEnabled(serviceType);
                    const capabilities = service.capabilities;

                    // Build capability description
                    const capabilityList = [];
                    if (capabilities.supportsScrobbling)
                        capabilityList.push('Scrobbling');
                    if (capabilities.supportsRatings)
                        capabilityList.push('Ratings');
                    if (capabilities.supportsComments)
                        capabilityList.push('Comments');

                    const capabilityText =
                        capabilityList.length > 0
                            ? capabilityList.join(', ')
                            : 'Basic features';

                    return (
                        <div
                            key={serviceType}
                            className="flex items-center justify-between p-4 bg-(--color-surface-2) rounded-md shadow-sm"
                        >
                            <div className="flex items-center space-x-3">
                                <div className="flex flex-col">
                                    <span className="font-medium text-(--color-text-primary) capitalize">
                                        {serviceType}
                                    </span>
                                    <span className="text-sm text-(--color-text-secondary)">
                                        {capabilityText}
                                    </span>
                                </div>
                            </div>

                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={() => toggleService(serviceType)}
                                    className="sr-only"
                                />
                                <div
                                    className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
                                        enabled
                                            ? 'bg-(--color-accent-primary)'
                                            : 'bg-(--color-border)'
                                    }`}
                                >
                                    <div
                                        className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform duration-200 ease-in-out ${
                                            enabled
                                                ? 'translate-x-5'
                                                : 'translate-x-0'
                                        } mt-0.5 ml-0.5`}
                                    />
                                </div>
                                <span className="ml-3 text-sm text-(--color-text-primary)">
                                    {enabled ? 'Enabled' : 'Disabled'}
                                </span>
                            </label>
                        </div>
                    );
                })}
            </div>

            <div className="mt-4 p-3 bg-(--color-surface-3) rounded-md">
                <p className="text-xs text-(--color-text-secondary)">
                    <strong>Note:</strong> If you disable all services, TMSync
                    will only provide quick links to tracking sites. Scrobbling,
                    rating, and commenting features will be unavailable.
                </p>
            </div>
        </div>
    );
};
