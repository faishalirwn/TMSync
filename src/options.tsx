import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { clientId, clientSecret, traktHeaders } from './utils/config';
import { callApi } from './utils/api';
import { siteConfigs } from './utils/siteConfigs';

interface SiteQuickLinkPreference {
    enabled: boolean;
    order: number;
}
export interface UserQuickLinkPrefs {
    [siteKey: string]: SiteQuickLinkPreference;
}

const Options: React.FC = () => {
    const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
    const [username, setUsername] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [quickLinkPrefs, setQuickLinkPrefs] = useState<UserQuickLinkPrefs>(
        {}
    );
    const [siteSearchTerm, setSiteSearchTerm] = useState('');
    const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);

    const availableSitesForQuickLinks = useMemo(() => {
        console.log('Recalculating availableSitesForQuickLinks...');
        return Object.entries(siteConfigs)
            .filter(([key, config]) => !!config.generateWatchLink)
            .map(([key, config]) => ({
                key: key,
                name: config.name,
                logo: chrome.runtime.getURL(
                    `images/logos/${key.toLowerCase()}.png`
                )
            }));
    }, []);
    useEffect(() => {
        const loadPreferences = async () => {
            setIsLoadingPrefs(true);
            const data = await chrome.storage.sync.get([
                'quickLinkPreferences'
            ]);
            const loadedPrefs = (data.quickLinkPreferences ||
                {}) as UserQuickLinkPrefs;

            let maxOrder = -1;

            Object.values(loadedPrefs).forEach((p) => {
                const pref = p as SiteQuickLinkPreference;
                if (
                    pref &&
                    typeof pref.order === 'number' &&
                    pref.order > maxOrder
                ) {
                    maxOrder = pref.order;
                }
            });

            const initialPrefs: UserQuickLinkPrefs = {};
            availableSitesForQuickLinks.forEach((site, index) => {
                const existingPref = loadedPrefs[site.key];
                initialPrefs[site.key] = existingPref || {
                    enabled: true,
                    order: maxOrder + 1 + index
                };
            });
            setQuickLinkPrefs(initialPrefs);
            setIsLoadingPrefs(false);
        };

        if (isLoggedIn) {
            loadPreferences();
        } else {
            setQuickLinkPrefs({});
            setIsLoadingPrefs(false);
        }
    }, [isLoggedIn, availableSitesForQuickLinks]);

    const handleToggleSite = (siteKey: string) => {
        const newPrefs = {
            ...quickLinkPrefs,
            [siteKey]: {
                ...quickLinkPrefs[siteKey],
                enabled: !quickLinkPrefs[siteKey]?.enabled
            }
        };
        setQuickLinkPrefs(newPrefs);
        chrome.storage.sync.set({ quickLinkPreferences: newPrefs });
    };

    const handleMoveSite = (siteKey: string, direction: 'up' | 'down') => {
        const orderedSites = availableSitesForQuickLinks
            .map((s) => ({ ...s, ...quickLinkPrefs[s.key] }))
            .sort((a, b) => a.order - b.order);

        const currentIndex = orderedSites.findIndex((s) => s.key === siteKey);
        if (currentIndex === -1) return;

        let newIndex = currentIndex;
        if (direction === 'up' && currentIndex > 0) newIndex = currentIndex - 1;
        if (direction === 'down' && currentIndex < orderedSites.length - 1)
            newIndex = currentIndex + 1;

        if (newIndex !== currentIndex) {
            const [movedSite] = orderedSites.splice(currentIndex, 1);
            orderedSites.splice(newIndex, 0, movedSite);

            const newPrefs: UserQuickLinkPrefs = {};
            orderedSites.forEach((site, index) => {
                newPrefs[site.key] = {
                    ...(quickLinkPrefs[site.key] || { enabled: true }),
                    order: index
                };
            });
            setQuickLinkPrefs(newPrefs);
            chrome.storage.sync.set({ quickLinkPreferences: newPrefs });
        }
    };

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
        <div className="bg-(--color-background) text-(--color-text-primary) min-h-screen">
            <div className="p-6 max-w-md mx-auto mt-10 bg-(--color-surface-1) rounded-lg shadow-md">
                <h1 className="text-2xl font-bold text-center mb-6 text-(--color-text-primary)">
                    TMSync Options
                </h1>

                {isLoading ? (
                    <div className="flex justify-center items-center h-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-(--color-accent-primary)"></div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {error && (
                            <div
                                className="bg-red-900/30 border border-red-500/50 text-(--color-danger-text) px-4 py-3 rounded relative"
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
                                <p className="text-lg text-(--color-success-text)">
                                    Logged in as:{' '}
                                    <strong className="font-semibold">
                                        {username}
                                    </strong>
                                </p>
                                <button
                                    onClick={handleLogout}
                                    className="mt-4 w-full bg-(--color-danger) hover:bg-(--color-danger-hover) text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150 ease-in-out"
                                >
                                    Logout from Trakt.tv
                                </button>
                            </div>
                        ) : (
                            <div className="text-center">
                                <p className="text-(--color-text-secondary) mb-4">
                                    Connect your Trakt.tv account to sync your
                                    watch history.
                                </p>
                                <button
                                    onClick={handleLogin}
                                    className="w-full bg-(--color-accent-primary) hover:bg-(--color-accent-primary-hover) text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition duration-150 ease-in-out"
                                >
                                    Login with Trakt.tv
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {isLoggedIn && (
                    <div className="mt-8 pt-6 border-t border-(--color-border)">
                        <h2 className="text-xl font-semibold mb-4 text-(--color-text-primary)">
                            Quick Links on Trakt.tv
                        </h2>
                        {isLoadingPrefs ? (
                            <p>Loading preferences...</p>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    placeholder="Search sites..."
                                    className="w-full p-2 border border-(--color-border) rounded mb-4 bg-(--color-background) text-(--color-text-primary) focus:ring-2 focus:ring-(--color-accent-primary) focus:outline-none"
                                    value={siteSearchTerm}
                                    onChange={(e) =>
                                        setSiteSearchTerm(e.target.value)
                                    }
                                />
                                <ul className="space-y-2">
                                    {availableSitesForQuickLinks
                                        .filter((site) =>
                                            site.name
                                                .toLowerCase()
                                                .includes(
                                                    siteSearchTerm.toLowerCase()
                                                )
                                        )
                                        .sort(
                                            (a, b) =>
                                                (quickLinkPrefs[a.key]?.order ??
                                                    999) -
                                                (quickLinkPrefs[b.key]?.order ??
                                                    999)
                                        )
                                        .map((site, index, arr) => (
                                            <li
                                                key={site.key}
                                                className="flex items-center justify-between p-3 bg-(--color-surface-2) rounded-md shadow-sm"
                                            >
                                                <div className="flex items-center">
                                                    <img
                                                        src={site.logo}
                                                        alt={site.name}
                                                        className="w-5 h-5 mr-3 object-contain"
                                                    />
                                                    <span className="text-(--color-text-primary)">
                                                        {site.name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <button
                                                        onClick={() =>
                                                            handleMoveSite(
                                                                site.key,
                                                                'up'
                                                            )
                                                        }
                                                        disabled={
                                                            quickLinkPrefs[
                                                                site.key
                                                            ]?.order === 0
                                                        }
                                                        className="text-xs p-1 disabled:opacity-50"
                                                    >
                                                        ⬆️
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            handleMoveSite(
                                                                site.key,
                                                                'down'
                                                            )
                                                        }
                                                        disabled={
                                                            quickLinkPrefs[
                                                                site.key
                                                            ]?.order ===
                                                            arr.length - 1
                                                        }
                                                        className="text-xs p-1 disabled:opacity-50"
                                                    >
                                                        ⬇️
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            handleToggleSite(
                                                                site.key
                                                            )
                                                        }
                                                        className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out focus:outline-none
                                                    ${quickLinkPrefs[site.key]?.enabled ? 'bg-(--color-accent-primary)' : 'bg-(--color-surface-3)'}`}
                                                    >
                                                        <span
                                                            className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform duration-200 ease-in-out
                                                        ${quickLinkPrefs[site.key]?.enabled ? 'translate-x-6' : 'translate-x-0'}`}
                                                        />
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}
            </div>
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
