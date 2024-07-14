const { callApi } = require("./utils/api");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'Search') {
        (async () => {
            const result = await callApi(`https://api.trakt.tv/search/${request.payload.type}?` + new URLSearchParams(request.payload).toString(), 'GET', '', true);
            sendResponse(result);
        })();
    
        return true;
    }

    if (request.type === 'Scrobble') {
        (async () => {
            const startResult = await callApi(`https://api.trakt.tv/scrobble/start`, 'POST', request.payload, true);
            const stopResult = await callApi(`https://api.trakt.tv/scrobble/stop`, 'POST', request.payload, true);
            sendResponse(stopResult);
        })();
    
        return true;
    }
}
);