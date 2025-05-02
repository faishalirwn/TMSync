// src/utils/api.ts
import { clientId, clientSecret, traktHeaders } from './config';

// Flag to prevent multiple refresh attempts concurrently
let isRefreshing = false;
// Queue for API calls waiting for token refresh
let refreshSubscribers: ((token: string) => void)[] = [];

// Function to add calls to the queue
function subscribeTokenRefresh(cb: (token: string) => void) {
    refreshSubscribers.push(cb);
}

// Function to process the queue after refresh
function onRefreshed(token: string) {
    refreshSubscribers.forEach((cb) => cb(token));
    // Clear the queue
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
        // Clear potentially stale access token info if refresh token is missing
        await chrome.storage.local.remove([
            'traktAccessToken',
            'traktRefreshToken',
            'traktTokenExpiresAt'
        ]);
        return null; // Indicate failure
    }

    let redirectUri: string | undefined;
    try {
        // We need the same redirect URI used for login
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
                // Use base traktHeaders, specifically Content-Type
                'Content-Type': 'application/json'
                // No Authorization header needed for token endpoint
            },
            body: JSON.stringify({
                refresh_token: storedRefreshToken,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri, // Must match original auth
                grant_type: 'refresh_token'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Token refresh failed:', response.status, data);
            // If refresh fails (e.g., invalid token), log user out
            await chrome.storage.local.remove([
                'traktAccessToken',
                'traktRefreshToken',
                'traktTokenExpiresAt'
            ]);
            isRefreshing = false;
            onRefreshed(''); // Notify subscribers of failure (empty token)
            return null; // Indicate failure
        }

        console.log('Token refresh successful:', data);
        const newExpiresAt = Date.now() + data.expires_in * 1000;

        // Store the new tokens
        await chrome.storage.local.set({
            traktAccessToken: data.access_token,
            traktRefreshToken: data.refresh_token, // Trakt might issue a new refresh token
            traktTokenExpiresAt: newExpiresAt
        });

        isRefreshing = false;
        onRefreshed(data.access_token); // Notify subscribers with the new token
        return data.access_token;
    } catch (error) {
        console.error('Error during token refresh fetch:', error);
        isRefreshing = false;
        onRefreshed(''); // Notify subscribers of failure
        return null; // Indicate failure
    }
}

// Modified callApi function
export const callApi = async (
    url: string,
    method: RequestInit['method'] = 'GET', // Default to GET if not specified
    body: BodyInit | object | null = null, // Allow objects for body
    isAuth: boolean = true // Assume most calls need auth
): Promise<any> => {
    // Return type might need adjustment based on usage

    let accessToken: string | null = null;

    if (isAuth) {
        const tokenData = await chrome.storage.local.get([
            'traktAccessToken',
            'traktTokenExpiresAt'
        ]);
        const expiresAt = tokenData.traktTokenExpiresAt || 0;
        const storedAccessToken = tokenData.traktAccessToken;

        // Check expiry (add a small buffer, e.g., 60 seconds)
        if (!storedAccessToken || Date.now() >= expiresAt - 60000) {
            console.log('Access token missing or expired/expiring soon.');

            if (isRefreshing) {
                // If a refresh is already in progress, wait for it
                console.log('Waiting for ongoing token refresh...');
                return new Promise((resolve) => {
                    subscribeTokenRefresh(async (newToken) => {
                        if (!newToken) {
                            console.error('Refresh failed while waiting.');
                            // Handle failure - perhaps throw an error or return a specific object
                            throw new Error(
                                'Authentication failed during refresh.'
                            );
                        }
                        // Retry the call with the new token
                        resolve(
                            callApiInternal(url, method, body, isAuth, newToken)
                        );
                    });
                });
            } else {
                // Attempt refresh
                accessToken = await refreshToken();
                if (!accessToken) {
                    console.error(
                        'Failed to refresh token. User needs to re-authenticate.'
                    );
                    // Handle failure - maybe clear storage and throw an error
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
            // Token is valid
            accessToken = storedAccessToken;
        }
    }

    // Perform the actual API call
    return callApiInternal(url, method, body, isAuth, accessToken);
};

// Internal function to perform the fetch call
async function callApiInternal(
    url: string,
    method: RequestInit['method'],
    body: BodyInit | object | null,
    isAuth: boolean,
    token: string | null
): Promise<any> {
    const headers: HeadersInit = { ...traktHeaders }; // Start with base headers
    if (isAuth && token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    // Don't add Content-Type if body is null or method is GET/HEAD
    if (body && method !== 'GET' && method !== 'HEAD') {
        headers['Content-Type'] = 'application/json';
    } else {
        // Remove Content-Type if it was in traktHeaders but isn't needed
        delete headers['Content-Type'];
    }

    // Stringify body if it's an object and method allows a body
    const reqBody =
        body &&
        typeof body === 'object' &&
        method !== 'GET' &&
        method !== 'HEAD'
            ? JSON.stringify(body)
            : (body as BodyInit | null); // Keep as is if already string or other BodyInit

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: reqBody // Use the potentially stringified body
        });

        // Handle non-OK responses (including potential 401 if refresh logic somehow failed)
        if (!response.ok) {
            // Check for 401 again - might happen if token became invalid *between* check and call
            if (response.status === 401 && isAuth) {
                console.warn(
                    'Received 401 Unauthorized even after token check/refresh attempt.'
                );
                // Could trigger another refresh attempt, but might lead to loops.
                // For simplicity, we'll just throw an error here.
                await chrome.storage.local.remove([
                    'traktAccessToken',
                    'traktRefreshToken',
                    'traktTokenExpiresAt'
                ]);
                throw new Error(
                    `Authentication failed (${response.status}). Please try logging in again.`
                );
            }
            // Handle other errors
            const errorData = await response.text(); // Get text response for more info
            console.error(
                `API call failed: ${response.status} ${response.statusText}`,
                errorData
            );
            throw new Error(
                `API Error: ${response.status} ${response.statusText}`
            );
        }

        // Handle different response types
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.indexOf('application/json') !== -1) {
            return await response.json(); // Parse JSON if applicable
        } else if (response.status === 204) {
            return null; // Handle No Content response
        } else {
            return await response.text(); // Return text for other types
        }
    } catch (error) {
        console.error(
            `Network or fetch error during API call to ${url}:`,
            error
        );
        // Re-throw the error so the caller can handle it
        throw error;
    }
}

// Helper (already present in your old code, kept for consistency)
// function isJsonString(str: string): boolean {
//     try {
//         JSON.parse(str);
//         return true;
//     } catch (e) {
//         return false;
//     }
// }
