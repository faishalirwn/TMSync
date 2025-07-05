import { useMemo } from 'react';
import { useServiceAuth } from './useServiceAuth';
import { serviceRegistry } from '../services/ServiceRegistry';
import { ServiceType } from '../types/serviceTypes';

interface ServiceAuthInfo {
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
    const allServices = serviceRegistry.getAllServices();

    // Create individual auth hooks for each service
    const serviceAuthHooks = useMemo(() => {
        return allServices.map((service) => ({
            service,
            auth: useServiceAuth(service)
        }));
    }, [allServices]);

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
                    supportsScrobbling: capabilities.supportsScrobbling,
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
        loginToAll,
        logoutFromAll,
        refreshAllStatus,
        clearAllErrors,
        getServiceAuth
    };
}
