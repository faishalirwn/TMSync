import { useMemo, useState, useEffect } from 'react';
import { useServiceAuth } from './useServiceAuth';
import { serviceRegistry } from '../services/ServiceRegistry';
import { ServiceType } from '../types/serviceTypes';

export interface ServiceAuthInfo {
    serviceType: ServiceType;
    isLoggedIn: boolean;
    username: string | null;
    isLoading: boolean;
    error: string | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    checkAuthStatus: () => Promise<void>;
    clearError: () => void;
    capabilities: {
        supportsScrobbling: boolean;
        supportsRatings: boolean;
        supportsComments: boolean;
        supportedMediaTypes: ('movie' | 'show')[];
    };
}

interface UseMultiServiceAuthReturn {
    services: ServiceAuthInfo[];
    authenticatedServices: ServiceAuthInfo[];
    hasAnyAuthenticated: boolean;
    isAnyLoading: boolean;
    hasAnyErrors: boolean;
    isServicesInitialized: boolean;
    loginToAll: () => Promise<void>;
    logoutFromAll: () => Promise<void>;
    refreshAllStatus: () => Promise<void>;
    clearAllErrors: () => void;
    getServiceAuth: (serviceType: ServiceType) => ServiceAuthInfo | undefined;
}

/**
 * Hook for managing authentication across all registered tracking services
 *
 * @returns Aggregated auth state and bulk operations for all services
 */
export function useMultiServiceAuth(): UseMultiServiceAuthReturn {
    const [servicesInitialized, setServicesInitialized] = useState(false);
    const [allServices, setAllServices] = useState(
        serviceRegistry.getAllServices()
    );

    // Monitor service registry for changes
    useEffect(() => {
        const checkServices = () => {
            const currentServices = serviceRegistry.getAllServices();
            console.log(
                'useMultiServiceAuth: Checking services, found:',
                currentServices.length
            );

            if (currentServices.length > 0 && !servicesInitialized) {
                console.log(
                    'useMultiServiceAuth: Services initialized, updating state'
                );
                setAllServices(currentServices);
                setServicesInitialized(true);
            }
        };

        // Check immediately
        checkServices();

        // Set up a polling mechanism to check for service initialization
        const interval = setInterval(checkServices, 100);

        // Cleanup interval when services are found or component unmounts
        if (servicesInitialized) {
            clearInterval(interval);
        }

        return () => clearInterval(interval);
    }, [servicesInitialized]);

    // Always call hooks for the maximum possible number of services to avoid conditional hook calls
    // This ensures we don't violate the Rules of Hooks
    const traktAuth = useServiceAuth(
        allServices.find((s) => s.getCapabilities().serviceType === 'trakt') ||
            null
    );
    const anilistAuth = useServiceAuth(
        allServices.find(
            (s) => s.getCapabilities().serviceType === 'anilist'
        ) || null
    );

    // Create service auth info array from the individual hooks
    const serviceAuthHooks = useMemo(() => {
        const hooks = [];

        // Add Trakt if available
        const traktService = allServices.find(
            (s) => s.getCapabilities().serviceType === 'trakt'
        );
        if (traktService) {
            hooks.push({ service: traktService, auth: traktAuth });
        }

        // Add AniList if available
        const anilistService = allServices.find(
            (s) => s.getCapabilities().serviceType === 'anilist'
        );
        if (anilistService) {
            hooks.push({ service: anilistService, auth: anilistAuth });
        }

        return hooks;
    }, [allServices, traktAuth, anilistAuth]);

    // Transform to ServiceAuthInfo format
    const services: ServiceAuthInfo[] = useMemo(() => {
        return serviceAuthHooks.map(({ service, auth }) => {
            const capabilities = service.getCapabilities();
            return {
                serviceType: capabilities.serviceType,
                isLoggedIn: auth.isLoggedIn,
                username: auth.username,
                isLoading: auth.isLoading,
                error: auth.error,
                login: auth.login,
                logout: auth.logout,
                checkAuthStatus: auth.checkAuthStatus,
                clearError: auth.clearError,
                capabilities: {
                    supportsScrobbling:
                        capabilities.supportsRealTimeScrobbling ||
                        capabilities.supportsProgressTracking,
                    supportsRatings: capabilities.supportsRatings,
                    supportsComments: capabilities.supportsComments,
                    supportedMediaTypes: capabilities.supportedMediaTypes
                }
            };
        });
    }, [serviceAuthHooks]);

    // Computed properties
    const authenticatedServices = services.filter((s) => s.isLoggedIn);
    const hasAnyAuthenticated = authenticatedServices.length > 0;
    const isAnyLoading = services.some((s) => s.isLoading);
    const hasAnyErrors = services.some((s) => s.error !== null);

    // Bulk operations
    const loginToAll = async () => {
        await Promise.allSettled(services.map((service) => service.login()));
    };

    const logoutFromAll = async () => {
        await Promise.allSettled(
            authenticatedServices.map((service) => service.logout())
        );
    };

    const refreshAllStatus = async () => {
        await Promise.allSettled(
            services.map((service) => service.checkAuthStatus())
        );
    };

    const clearAllErrors = () => {
        services.forEach((service) => service.clearError());
    };

    const getServiceAuth = (serviceType: ServiceType) => {
        return services.find((s) => s.serviceType === serviceType);
    };

    return {
        services,
        authenticatedServices,
        hasAnyAuthenticated,
        isAnyLoading,
        hasAnyErrors,
        isServicesInitialized: servicesInitialized,
        loginToAll,
        logoutFromAll,
        refreshAllStatus,
        clearAllErrors,
        getServiceAuth
    };
}
