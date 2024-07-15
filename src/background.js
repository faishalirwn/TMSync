import { callApi } from "./utils/api";

let tabInfo = {}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'scrobble') {
        const mediaType = tabInfo[sender.tab.id]["type"];
        (async () => {
            const body = {
                [mediaType]: tabInfo[sender.tab.id][mediaType],
                progress: request.payload.progress
            }
            const startResult = await callApi(`https://api.trakt.tv/scrobble/start`, 'POST', body, true);
            await new Promise(r => setTimeout(r, 1000));
            const stopResult = await callApi(`https://api.trakt.tv/scrobble/stop`, 'POST', body, true);
            sendResponse(stopResult);
        })();
    }

    if (request.type === 'mediaInfo') {
        (async () => {
            const result = await callApi(`https://api.trakt.tv/search/${request.payload.type}?` + new URLSearchParams(request.payload).toString(), 'GET', '', true);
            tabInfo[sender.tab.id] = {
                ...result[0],
                type: request.payload.type
            };
        })()
    }
}
);