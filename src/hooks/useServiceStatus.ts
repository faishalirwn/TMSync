/**
 * Hook for managing real-time service status in content scripts
 */

import { useState, useEffect, useCallback } from 'react';
import {
    ServiceStatus,
    ServiceStatusUpdateEvent
} from '../types/serviceStatus';
import { ServiceType } from '../types/serviceTypes';

interface UseServiceStatusReturn {
    serviceStatuses: ServiceStatus[];
    isLoading: boolean;
    getServiceStatus: (serviceType: ServiceType) => ServiceStatus | undefined;
    refreshStatuses: () => Promise<void>;
}

/**
 * Hook for real-time service status updates in content scripts
 */
export function useServiceStatus(): UseServiceStatusReturn {
    const [serviceStatuses, setServiceStatuses] = useState<ServiceStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Register for status updates
    useEffect(() => {
        let isRegistered = false;

        const registerListener = async () => {
            try {
                // Register for status updates (background script will determine tab ID from sender)
                await chrome.runtime.sendMessage({
                    action: 'registerStatusListener',
                    params: {}
                });

                // Get initial status
                const initialStatuses = await chrome.runtime.sendMessage({
                    action: 'getServiceStatuses',
                    params: {}
                });

                if (initialStatuses.success) {
                    setServiceStatuses(initialStatuses.data || []);
                }

                isRegistered = true;
                setIsLoading(false);
            } catch (error) {
                console.error(
                    'Failed to register service status listener:',
                    error
                );
                setIsLoading(false);
            }
        };

        registerListener();

        // Listen for status updates
        const handleMessage = (message: ServiceStatusUpdateEvent) => {
            if (message.action === 'serviceStatusUpdate') {
                setServiceStatuses(message.data.services);
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);

        return () => {
            chrome.runtime.onMessage.removeListener(handleMessage);

            // Unregister listener
            if (isRegistered) {
                chrome.runtime
                    .sendMessage({
                        action: 'unregisterStatusListener',
                        params: {}
                    })
                    .catch(() => {
                        // Ignore errors during cleanup
                    });
            }
        };
    }, []);

    // Get status for specific service
    const getServiceStatus = useCallback(
        (serviceType: ServiceType): ServiceStatus | undefined => {
            return serviceStatuses.find(
                (status) => status.serviceType === serviceType
            );
        },
        [serviceStatuses]
    );

    // Refresh all service statuses
    const refreshStatuses = useCallback(async (): Promise<void> => {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'getServiceStatuses',
                params: {}
            });

            if (response.success) {
                setServiceStatuses(response.data || []);
            }
        } catch (error) {
            console.error('Failed to refresh service statuses:', error);
        }
    }, []);

    return {
        serviceStatuses,
        isLoading,
        getServiceStatus,
        refreshStatuses
    };
}
