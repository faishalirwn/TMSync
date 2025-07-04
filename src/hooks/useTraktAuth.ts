import { useState, useEffect, useCallback } from 'react';
import { traktService } from '../services/TraktService';

export function useTraktAuth() {
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    const [username, setUsername] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const checkAuthStatus = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const isAuth = await traktService.isAuthenticated();
            if (isAuth) {
                const username = await traktService.getUsername();
                setIsLoggedIn(true);
                setUsername(username);
            } else {
                setIsLoggedIn(false);
                setUsername(null);
            }
        } catch (err) {
            console.error('Error checking auth status:', err);
            setError(
                err instanceof Error
                    ? err.message
                    : 'An error occurred checking login status.'
            );
            setIsLoggedIn(false);
            setUsername(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const login = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await traktService.login();
            await checkAuthStatus();
        } catch (err) {
            console.error('Error during login process:', err);
            setError(
                err instanceof Error
                    ? err.message
                    : 'An unexpected error occurred during login.'
            );
            setIsLoggedIn(false);
            setUsername(null);
        } finally {
            setIsLoading(false);
        }
    }, [checkAuthStatus]);

    const logout = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            await traktService.logout();
        } catch (err) {
            console.error('Error during logout:', err);
        } finally {
            setIsLoggedIn(false);
            setUsername(null);
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    return { isLoggedIn, username, isLoading, error, login, logout };
}
