import { useState, useEffect, useCallback } from 'react';
import { ServiceType } from '../types/serviceTypes';
import {
    getServicePreferences,
    setServiceEnabled,
    isServiceEnabled,
    ServicePreferences
} from '../utils/servicePreferences';

interface UseServicePreferencesReturn {
    preferences: ServicePreferences;
    isLoading: boolean;
    toggleService: (serviceType: ServiceType) => Promise<void>;
    isServiceEnabled: (serviceType: ServiceType) => boolean;
    refreshPreferences: () => Promise<void>;
}

/**
 * Hook for managing user service preferences
 */
export function useServicePreferences(): UseServicePreferencesReturn {
    const [preferences, setPreferences] = useState<ServicePreferences>({});
    const [isLoading, setIsLoading] = useState(true);

    const refreshPreferences = useCallback(async () => {
        setIsLoading(true);
        try {
            const prefs = await getServicePreferences();
            setPreferences(prefs);
        } catch (error) {
            console.error('Failed to load service preferences:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const toggleService = useCallback(
        async (serviceType: ServiceType) => {
            const currentlyEnabled = preferences[serviceType] !== false;
            const newEnabled = !currentlyEnabled;

            try {
                await setServiceEnabled(serviceType, newEnabled);
                await refreshPreferences(); // Refresh to get updated state
            } catch (error) {
                console.error(
                    `Failed to toggle service ${serviceType}:`,
                    error
                );
            }
        },
        [preferences, refreshPreferences]
    );

    const checkIsServiceEnabled = useCallback(
        (serviceType: ServiceType): boolean => {
            return preferences[serviceType] !== false; // Default to enabled
        },
        [preferences]
    );

    useEffect(() => {
        refreshPreferences();
    }, [refreshPreferences]);

    return {
        preferences,
        isLoading,
        toggleService,
        isServiceEnabled: checkIsServiceEnabled,
        refreshPreferences
    };
}
