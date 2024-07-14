import { traktHeaders } from "./config"

export const callApi = async (url, method, body, isAuth) => {
    // because we're using this chrome API, this whole function can only be called from content script, service worker, and other extension specific file
    const storageResult = await chrome.storage.sync.get(['access_token'])
    const accessToken = await storageResult.access_token

    console.log(body)

    const response = await fetch(url, {
        method,
        headers: {
            ...traktHeaders,
            Authorization: isAuth ? `Bearer ${accessToken}` : undefined
        },
        body
    });

    const json = await response.json();

    return json;
}