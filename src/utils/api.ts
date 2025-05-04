import { clientId, clientSecret, traktHeaders } from './config';

let isRefreshing = false;

let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
    refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
    refreshSubscribers.forEach((cb) => cb(token));

    refreshSubscribers = [];
}

async function refreshToken(): Promise<string | null> {
    console.log('Attempting token refresh...');
    isRefreshing = true;

    const tokenData = await chrome.storage.local.get(['traktRefreshToken']);
    const storedRefreshToken = tokenData.traktRefreshToken;

    if (!storedRefreshToken) {
        console.error('No refresh token found. Cannot refresh.');
        isRefreshing = false;

        await chrome.storage.local.remove([
            'traktAccessToken',
            'traktRefreshToken',
            'traktTokenExpiresAt'
        ]);
        return null;
    }

    let redirectUri: string | undefined;
    try {
        redirectUri = chrome.identity.getRedirectURL();
        if (!redirectUri)
            throw new Error('Could not get redirect URL for refresh.');
    } catch (error) {
        console.error('Error getting redirect URL during refresh:', error);
        isRefreshing = false;
        return null;
    }

    try {
        const response = await fetch('https://api.trakt.tv/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                refresh_token: storedRefreshToken,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'refresh_token'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Token refresh failed:', response.status, data);

            await chrome.storage.local.remove([
                'traktAccessToken',
                'traktRefreshToken',
                'traktTokenExpiresAt'
            ]);
            isRefreshing = false;
            onRefreshed('');
            return null;
        }

        console.log('Token refresh successful:', data);
        const newExpiresAt = Date.now() + data.expires_in * 1000;

        await chrome.storage.local.set({
            traktAccessToken: data.access_token,
            traktRefreshToken: data.refresh_token,
            traktTokenExpiresAt: newExpiresAt
        });

        isRefreshing = false;
        onRefreshed(data.access_token);
        return data.access_token;
    } catch (error) {
        console.error('Error during token refresh fetch:', error);
        isRefreshing = false;
        onRefreshed('');
        return null;
    }
}

export const callApi = async <T = any>(
    url: string,
    method: RequestInit['method'] = 'GET',
    body: BodyInit | object | null = null,
    isAuth: boolean = true
): Promise<T> => {
    let accessToken: string | null = null;

    if (isAuth) {
        const tokenData = await chrome.storage.local.get([
            'traktAccessToken',
            'traktTokenExpiresAt'
        ]);
        const expiresAt = tokenData.traktTokenExpiresAt || 0;
        const storedAccessToken = tokenData.traktAccessToken;

        if (!storedAccessToken || Date.now() >= expiresAt - 60000) {
            console.log('Access token missing or expired/expiring soon.');

            if (isRefreshing) {
                console.log('Waiting for ongoing token refresh...');
                return new Promise((resolve) => {
                    subscribeTokenRefresh(async (newToken) => {
                        if (!newToken) {
                            console.error('Refresh failed while waiting.');

                            throw new Error(
                                'Authentication failed during refresh.'
                            );
                        }

                        resolve(
                            callApiInternal(url, method, body, isAuth, newToken)
                        );
                    });
                });
            } else {
                accessToken = await refreshToken();
                if (!accessToken) {
                    console.error(
                        'Failed to refresh token. User needs to re-authenticate.'
                    );

                    await chrome.storage.local.remove([
                        'traktAccessToken',
                        'traktRefreshToken',
                        'traktTokenExpiresAt'
                    ]);
                    throw new Error(
                        'Authentication required. Please login via the extension popup.'
                    );
                }
            }
        } else {
            accessToken = storedAccessToken;
        }
    }

    return callApiInternal<T>(url, method, body, isAuth, accessToken);
};

async function callApiInternal<T = any>(
    url: string,
    method: RequestInit['method'],
    body: BodyInit | object | null,
    isAuth: boolean,
    token: string | null
): Promise<T> {
    const headers: HeadersInit = { ...traktHeaders };
    if (isAuth && token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    if (body && method !== 'GET' && method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
    } else {
        delete headers['Content-Type'];
    }

    const reqBody =
        body &&
        typeof body === 'object' &&
        method !== 'GET' &&
        method !== 'HEAD'
            ? JSON.stringify(body)
            : (body as BodyInit | null);

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: reqBody
        });

        if (!response.ok) {
            if (response.status === 401 && isAuth) {
                console.warn(
                    'Received 401 Unauthorized even after token check/refresh attempt.'
                );

                await chrome.storage.local.remove([
                    'traktAccessToken',
                    'traktRefreshToken',
                    'traktTokenExpiresAt'
                ]);
                throw new Error(
                    `Authentication failed (${response.status}). Please try logging in again.`
                );
            }

            const errorData = await response.text();
            console.error(
                `API call failed: ${response.status} ${response.statusText}`,
                errorData
            );
            throw new Error(
                `API Error: ${response.status} ${response.statusText}`
            );
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.indexOf('application/json') !== -1) {
            const json = await response.json();
            return json as T;
        } else if (response.status === 204) {
            return null as unknown as T;
        } else {
            const text = await response.text();

            throw new Error(`Unexpected response content type: ${contentType}`);
        }
    } catch (error) {
        console.error(
            `Network or fetch error during API call to ${url}:`,
            error
        );

        throw error;
    }
}
