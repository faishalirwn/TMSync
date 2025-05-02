// src/popup.tsx
import { clientId, clientSecret, traktHeaders } from './utils/config';
import { useEffect, useState } from 'react'; // Assuming you might want React state later

let isLoggedin = false; // Simple flag, consider React state for dynamic UI updates

function updateLoginStatus(loggedIn: boolean) {
    isLoggedin = loggedIn;
    const p = document.querySelector('p');
    const button = document.querySelector('button');
    if (p) {
        p.textContent = loggedIn ? 'Logged in' : 'Not logged in';
    }
    if (button) {
        button.textContent = loggedIn
            ? 'Logged In (Click to Logout - WIP)'
            : 'Login with Trakt';
        button.disabled = loggedIn; // Disable button after login for simplicity, or change behavior
    }
}

async function checkLoggedIn() {
    // IMPORTANT: Use chrome.storage.local for tokens
    const result = await chrome.storage.local.get([
        'traktAccessToken',
        'traktTokenExpiresAt'
    ]);
    const loggedIn =
        !!result.traktAccessToken && Date.now() < result.traktTokenExpiresAt;
    updateLoginStatus(loggedIn);
}

// Run check when popup opens
checkLoggedIn();

const button = document.querySelector('button');

if (button) {
    button.addEventListener('click', async () => {
        // Make the listener async
        if (isLoggedin) {
            // Optional: Implement logout here (clear tokens from storage)
            // await chrome.storage.local.remove(['traktAccessToken', 'traktRefreshToken', 'traktTokenExpiresAt']);
            // updateLoginStatus(false);
            console.log('Logout functionality not fully implemented yet.');
            return;
        }

        // 1. Get the dynamic redirect URI
        let redirectUri: string | undefined;
        try {
            // NOTE: getRedirectURL() needs the manifest permission "identity"
            // It expects a path relative to the base URL it generates,
            // often just "/" or an empty string is sufficient. Let's try with undefined first.
            // If Trakt requires a path, you might use getRedirectURL("callback") -> https://<ID>.chromiumapp.org/callback
            redirectUri = chrome.identity.getRedirectURL();
            // If Trakt *strictly* requires no path and getRedirectURL adds one, manual construction might be needed,
            // but typically getRedirectURL() is the correct approach. Test what Trakt accepts.
            // const extensionId = chrome.runtime.id;
            // redirectUri = `https://${extensionId}.chromiumapp.org/`; // Manual alternative if needed

            if (!redirectUri) {
                console.error(
                    "Could not get redirect URL. Ensure 'identity' permission is set."
                );
                alert('Error: Could not configure authentication redirect.');
                return;
            }
            console.log('Using redirect URI:', redirectUri); // Log for debugging
        } catch (error) {
            console.error('Error getting redirect URL:', error);
            alert('Error: Could not configure authentication redirect.');
            return;
        }

        // 2. Construct the authorization URL
        const authUrl = `https://trakt.tv/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

        // 3. Launch the auth flow
        try {
            const redirectUrlResponse = await chrome.identity.launchWebAuthFlow(
                {
                    url: authUrl,
                    interactive: true
                }
            );

            if (chrome.runtime.lastError || !redirectUrlResponse) {
                console.error(
                    'OAuth flow failed:',
                    chrome.runtime.lastError?.message || 'No response URL'
                );
                alert(
                    `Login failed: ${chrome.runtime.lastError?.message || 'Authentication cancelled or failed.'}`
                );
                return;
            }

            console.log('OAuth Redirect URL:', redirectUrlResponse);
            const url = new URL(redirectUrlResponse);
            const code = url.searchParams.get('code');

            if (!code) {
                console.error(
                    'OAuth flow succeeded but no code found in redirect URL.'
                );
                alert(
                    'Login failed: Could not get authorization code from Trakt.'
                );
                return;
            }

            // 4. Exchange code for tokens
            console.log('Exchanging code for token...');
            const tokenResponse = await fetch(
                'https://api.trakt.tv/oauth/token',
                {
                    method: 'POST',
                    // Ensure traktHeaders includes 'Content-Type': 'application/json'
                    headers: traktHeaders,
                    body: JSON.stringify({
                        code: code,
                        client_id: clientId,
                        client_secret: clientSecret, // Ensure this is loaded correctly (e.g., from env vars via webpack)
                        redirect_uri: redirectUri, // Use the SAME dynamic redirect URI here
                        grant_type: 'authorization_code'
                    })
                }
            );

            if (!tokenResponse.ok) {
                const errorData = await tokenResponse.json();
                console.error(
                    'Token exchange failed:',
                    tokenResponse.status,
                    errorData
                );
                alert(
                    `Login failed: Could not exchange code for token. ${errorData.error_description || ''}`
                );
                return;
            }

            const tokenData = await tokenResponse.json();
            console.log('Token data received:', tokenData);

            // 5. Store tokens securely (access, refresh, expiry) in chrome.storage.local
            const expiresAt = Date.now() + tokenData.expires_in * 1000;
            await chrome.storage.local.set({
                traktAccessToken: tokenData.access_token,
                traktRefreshToken: tokenData.refresh_token,
                traktTokenExpiresAt: expiresAt
            });

            console.log('Tokens stored successfully.');
            updateLoginStatus(true); // Update UI to show logged-in state
        } catch (error) {
            // Catch errors from launchWebAuthFlow or fetch
            console.error('Error during OAuth process:', error);
            alert(
                `An error occurred during login: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    });
}

// Note: This popup script runs every time the popup is opened.
// State is not preserved between openings unless stored in chrome.storage.
// For more complex UI state, consider using React within the popup (as you might have intended with the .tsx extension).
