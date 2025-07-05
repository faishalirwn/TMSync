/**
 * Authentication Handler - Background Script
 *
 * Handles OAuth token exchanges that require unrestricted fetch access
 * for AniList and other services that need background script context.
 */

interface AuthTokenExchangeRequest {
    action: 'authTokenExchange';
    service: 'anilist';
    code: string;
    redirectUri: string;
    clientId: string;
    clientSecret?: string;
}

interface AuthTokenExchangeResponse {
    success: boolean;
    accessToken?: string;
    expiresIn?: number;
    error?: string;
}

/**
 * Handle OAuth token exchange for services that require background script context
 */
export async function handleAuthTokenExchange(
    request: AuthTokenExchangeRequest
): Promise<AuthTokenExchangeResponse> {
    try {
        if (request.service === 'anilist') {
            return await handleAniListTokenExchange(request);
        }

        return {
            success: false,
            error: `Unsupported service: ${request.service}`
        };
    } catch (error) {
        console.error('Token exchange error:', error);
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'Unknown error during token exchange'
        };
    }
}

/**
 * Handle AniList OAuth token exchange
 */
async function handleAniListTokenExchange(
    request: AuthTokenExchangeRequest
): Promise<AuthTokenExchangeResponse> {
    const tokenResponse = await fetch('https://anilist.co/api/v2/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: request.clientId,
            client_secret: request.clientSecret || '', // AniList doesn't require client secret
            redirect_uri: request.redirectUri,
            code: request.code
        })
    });

    if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        throw new Error(
            `Token exchange failed: ${errorData.error_description || tokenResponse.statusText}`
        );
    }

    const tokenData = await tokenResponse.json();

    return {
        success: true,
        accessToken: tokenData.access_token,
        expiresIn: tokenData.expires_in
    };
}
