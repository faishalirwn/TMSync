import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { clientId, clientSecret, traktHeaders } from './utils/config';
import { callApi } from './utils/api';

// interface UserSettings {
//     user: {
//         username: string;
//         name: string;
//         // Add other fields if needed
//     };
//     // Add other settings fields if needed
// }

const Options: React.FC = () => {
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
                    setIsLoggedIn(false);
                    setUsername(null);
                    await chrome.storage.local.remove([
                        'traktUsername',
                        'traktAccessToken',
                        'traktRefreshToken',
                        'traktTokenExpiresAt'
                    ]);
                    setError(
                        'Could not verify user session. Please login again.'
                    );
                }
            } else {
                setIsLoggedIn(false);
                setUsername(null);
                await chrome.storage.local.remove(['traktUsername']);

                if (storedToken) {
                    await chrome.storage.local.remove([
                        'traktAccessToken',
                        'traktRefreshToken',
                        'traktTokenExpiresAt'
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

    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    const handleLogin = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        let redirectUri: string | undefined;
        try {
            redirectUri = chrome.identity.getRedirectURL();
            if (!redirectUri) throw new Error('Could not get redirect URL.');
            console.log('OAuth Redirect URI:', redirectUri);
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

            console.log('Tokens stored successfully.');

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
            await chrome.storage.local.remove([
                'traktUsername',
                'traktAccessToken',
                'traktRefreshToken',
                'traktTokenExpiresAt'
            ]);
        } finally {
            setIsLoading(false);
        }
    }, [checkAuthStatus]);

    const handleLogout = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const tokenData = await chrome.storage.local.get([
                'traktAccessToken'
            ]);
            const token = tokenData.traktAccessToken;

            if (token) {
                await fetch('https://api.trakt.tv/oauth/revoke', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                        'trakt-api-key': clientId,
                        'trakt-api-version': '2'
                    },
                    body: JSON.stringify({ token: token })
                });
                console.log('Token revocation attempted.');
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
            console.log('Logged out and cleared storage.');
        }
    }, []);

    return (
        <div className="p-6 max-w-md mx-auto mt-10 bg-white rounded-lg shadow-md">
            <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
                TMSync Options
            </h1>

            {isLoading ? (
                <div className="flex justify-center items-center h-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            ) : (
                <div className="space-y-4">
                    {error && (
                        <div
                            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
                            role="alert"
                        >
                            <strong className="font-bold">Error:</strong>
                            <span className="block sm:inline ml-2">
                                {error}
                            </span>
                        </div>
                    )}

                    {isLoggedIn && username ? (
                        <div className="text-center">
                            <p className="text-lg text-green-700">
                                Logged in as:{' '}
                                <strong className="font-semibold">
                                    {username}
                                </strong>
                            </p>
                            <button
                                onClick={handleLogout}
                                className="mt-4 w-full bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150 ease-in-out"
                            >
                                Logout from Trakt.tv
                            </button>
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="text-gray-600 mb-4">
                                Connect your Trakt.tv account to sync your watch
                                history.
                            </p>
                            <button
                                onClick={handleLogin}
                                className="w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150 ease-in-out"
                            >
                                Login with Trakt.tv
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Options />);
} else {
    console.error("Target container 'root' not found for Options page.");
}
