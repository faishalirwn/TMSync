import { useState, useEffect, useCallback } from 'react';
import { callApi } from '../utils/api';
import { clientId, clientSecret } from '../utils/config';

export function useTraktAuth() {
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    const [username, setUsername] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const checkAuthStatus = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const tokenData = await chrome.storage.local.get([
                'traktAccessToken',
                'traktTokenExpiresAt'
            ]);
            const storedToken = tokenData.traktAccessToken;
            const expiresAt = tokenData.traktTokenExpiresAt || 0;

            if (storedToken && Date.now() < expiresAt) {
                const settings = await callApi(
                    'https://api.trakt.tv/users/settings',
                    'GET'
                );
                if (settings?.user?.username) {
                    setIsLoggedIn(true);
                    setUsername(settings.user.username);
                    await chrome.storage.local.set({
                        traktUsername: settings.user.username
                    });
                } else {
                    throw new Error(
                        'Could not verify user session. Please login again.'
                    );
                }
            } else {
                setIsLoggedIn(false);
                setUsername(null);
                if (storedToken) {
                    await chrome.storage.local.remove([
                        'traktAccessToken',
                        'traktRefreshToken',
                        'traktTokenExpiresAt',
                        'traktUsername'
                    ]);
                }
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
            await chrome.storage.local.remove([
                'traktUsername',
                'traktAccessToken',
                'traktRefreshToken',
                'traktTokenExpiresAt'
            ]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const login = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        let redirectUri: string | undefined;
        try {
            redirectUri = chrome.identity.getRedirectURL();
            if (!redirectUri) throw new Error('Could not get redirect URL.');
        } catch (err) {
            console.error('Error getting redirect URL:', err);
            setError('Failed to configure authentication redirect.');
            setIsLoading(false);
            return;
        }

        const authUrl = `https://trakt.tv/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

        try {
            const redirectUrlResponse = await chrome.identity.launchWebAuthFlow(
                {
                    url: authUrl,
                    interactive: true
                }
            );

            if (chrome.runtime.lastError || !redirectUrlResponse) {
                throw new Error(
                    chrome.runtime.lastError?.message ||
                        'Authentication cancelled or failed.'
                );
            }

            const url = new URL(redirectUrlResponse);
            const code = url.searchParams.get('code');

            if (!code) {
                throw new Error('Could not get authorization code from Trakt.');
            }

            const tokenResponse = await fetch(
                'https://api.trakt.tv/oauth/token',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: code,
                        client_id: clientId,
                        client_secret: clientSecret,
                        redirect_uri: redirectUri,
                        grant_type: 'authorization_code'
                    })
                }
            );

            const tokenData = await tokenResponse.json();
            if (!tokenResponse.ok) {
                throw new Error(
                    `Token exchange failed: ${tokenData.error_description || tokenResponse.statusText}`
                );
            }

            const expiresAt = Date.now() + tokenData.expires_in * 1000;
            await chrome.storage.local.set({
                traktAccessToken: tokenData.access_token,
                traktRefreshToken: tokenData.refresh_token,
                traktTokenExpiresAt: expiresAt
            });

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
            const tokenData = await chrome.storage.local.get([
                'traktAccessToken'
            ]);
            if (tokenData.traktAccessToken) {
                await fetch('https://api.trakt.tv/oauth/revoke', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${tokenData.traktAccessToken}`,
                        'trakt-api-key': clientId,
                        'trakt-api-version': '2'
                    },
                    body: JSON.stringify({ token: tokenData.traktAccessToken })
                });
            }
        } catch (err) {
            console.error('Error revoking token (continuing logout):', err);
        } finally {
            await chrome.storage.local.remove([
                'traktAccessToken',
                'traktRefreshToken',
                'traktTokenExpiresAt',
                'traktUsername'
            ]);
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
