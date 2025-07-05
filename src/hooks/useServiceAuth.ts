import { useState, useEffect, useCallback } from 'react';
import { TrackerService } from '../types/services';
import { ServiceType } from '../types/serviceTypes';

interface ServiceAuthState {
    isLoggedIn: boolean;
    username: string | null;
    isLoading: boolean;
    error: string | null;
    serviceType: ServiceType;
}

interface UseServiceAuthReturn extends ServiceAuthState {
    login: () => Promise<void>;
    logout: () => Promise<void>;
    checkAuthStatus: () => Promise<void>;
    clearError: () => void;
}

/**
 * Generic hook for managing authentication state of any TrackerService
 *
 * @param service - The TrackerService instance to manage auth for
 * @returns Authentication state and methods for the service
 */
export function useServiceAuth(service: TrackerService): UseServiceAuthReturn {
    const serviceType = service.getCapabilities().serviceType;

    const [state, setState] = useState<ServiceAuthState>({
        isLoggedIn: false,
        username: null,
        isLoading: true,
        error: null,
        serviceType
    });

    const updateState = useCallback((updates: Partial<ServiceAuthState>) => {
        setState((prev) => ({ ...prev, ...updates }));
    }, []);

    const clearError = useCallback(() => {
        updateState({ error: null });
    }, [updateState]);

    const checkAuthStatus = useCallback(async () => {
        updateState({ isLoading: true, error: null });

        try {
            const isAuth = await service.isAuthenticated();

            if (isAuth) {
                try {
                    const username = await service.getUsername();
                    updateState({
                        isLoggedIn: true,
                        username,
                        isLoading: false
                    });
                } catch (usernameError) {
                    // Authenticated but can't get username - still consider logged in
                    console.warn(
                        `${serviceType}: Could not fetch username:`,
                        usernameError
                    );
                    updateState({
                        isLoggedIn: true,
                        username: null,
                        isLoading: false
                    });
                }
            } else {
                updateState({
                    isLoggedIn: false,
                    username: null,
                    isLoading: false
                });
            }
        } catch (error) {
            console.error(`${serviceType}: Auth status check failed:`, error);
            updateState({
                isLoggedIn: false,
                username: null,
                isLoading: false,
                error:
                    error instanceof Error
                        ? error.message
                        : 'Authentication check failed'
            });
        }
    }, [service, serviceType, updateState]);

    const login = useCallback(async () => {
        updateState({ isLoading: true, error: null });

        try {
            await service.login();
            // Check auth status after successful login to update state
            await checkAuthStatus();
        } catch (error) {
            console.error(`${serviceType}: Login failed:`, error);
            updateState({
                isLoading: false,
                error: error instanceof Error ? error.message : 'Login failed'
            });
        }
    }, [service, serviceType, checkAuthStatus, updateState]);

    const logout = useCallback(async () => {
        updateState({ isLoading: true, error: null });

        try {
            await service.logout();
            updateState({
                isLoggedIn: false,
                username: null,
                isLoading: false
            });
        } catch (error) {
            console.error(`${serviceType}: Logout failed:`, error);
            updateState({
                isLoading: false,
                error: error instanceof Error ? error.message : 'Logout failed'
            });
        }
    }, [service, serviceType, updateState]);

    // Check auth status on mount
    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    return {
        ...state,
        login,
        logout,
        checkAuthStatus,
        clearError
    };
}
