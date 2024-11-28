import { traktHeaders } from './config';

export const callApi = async (
    url: string,
    method: string,
    body: BodyInit,
    isAuth: boolean
) => {
    // because we're using this chrome API, this whole function can only be called from content script, service worker, and other extension specific file
    const storageResult = await chrome.storage.sync.get(['access_token']);
    const accessToken = await storageResult.access_token;

    const response = await fetch(url, {
        method,
        headers: {
            ...traktHeaders,
            ...(isAuth && accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : {})
        },
        body: method === 'GET' ? undefined : JSON.stringify(body)
    });

    const json = await response.json();

    return json;
};
