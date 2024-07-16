export const clientId = process.env.TRAKT_CLIENT_ID
export const clientSecret = process.env.TRAKT_CLIENT_SECRET

export const traktHeaders = {
    "Content-Type": "application/json",
    "trakt-api-key": clientId,
    "trakt-api-version": "2",
}