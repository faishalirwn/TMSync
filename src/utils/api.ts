import { traktHeaders } from './config';

export const callApi = async (
    url: string,
    method: RequestInit['method'] = '',
    body: BodyInit | string = '',
    isAuth: boolean = true
) => {
    // because we're using this chrome API, this whole function can only be called from content script, service worker, and other extension specific file
    const storageResult = await chrome.storage.sync.get(['access_token']);
    const accessToken = await storageResult.access_token;

    const reqBody = isJsonString(body as string) ? body : JSON.stringify(body);

    const response = await fetch(url, {
        method,
        headers: {
            ...traktHeaders,
            ...(isAuth && accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : {})
        },
        body: method === 'GET' ? undefined : reqBody
    });

    const json = await response.json();

    return json;
};

function isJsonString(str: string) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}
