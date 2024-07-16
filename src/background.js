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
            try {
                const startResult = await callApi(`https://api.trakt.tv/scrobble/start`, 'POST', body, true);
                await new Promise(r => setTimeout(r, 1000));
                const stopResult = await callApi(`https://api.trakt.tv/scrobble/stop`, 'POST', body, true);
                sendResponse(stopResult);
            } catch(error) {
                sendResponse('fail scrobble dawg', error);
            }
        })();
    }

    if (request.type === 'mediaInfo') {
        (async () => {
            try {
                const result = await callApi(`https://api.trakt.tv/search/${request.payload.type}?` + new URLSearchParams(request.payload).toString(), 'GET', '', true);
                const mediaInfo = result[0]
                tabInfo[sender.tab.id] = {
                    ...mediaInfo,
                    type: request.payload.type
                };
                sendResponse(mediaInfo)
                
            } catch (error) {
                sendResponse('fail search dawg', error);
            }
        })()
        return true
    }
}
);