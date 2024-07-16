import { callApi } from './utils/api';
import { getEpisode, getUrlIdentifier } from './utils/url';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'scrobble') {
        (async () => {
            const tabUrl = getUrlIdentifier(sender.tab.url);
            const mediaInfoGet = await chrome.storage.local.get(tabUrl);
            const mediaInfo = mediaInfoGet[tabUrl];
            const body = {
                [mediaInfo.type]: mediaInfo[mediaInfo.type],
                progress: request.payload.progress
            };
            if (mediaInfo.type === 'show') {
                body['episode'] = getEpisode(sender.tab.url);
            }
            console.log(body);

            try {
                await callApi(
                    `https://api.trakt.tv/scrobble/start`,
                    'POST',
                    body,
                    true
                );
                await new Promise((r) => setTimeout(r, 1000));
                const stopResult = await callApi(
                    `https://api.trakt.tv/scrobble/stop`,
                    'POST',
                    body,
                    true
                );
                sendResponse(stopResult);
            } catch (error) {
                sendResponse('fail scrobble dawg', error);
            }
        })();
    }

    if (request.type === 'mediaInfo') {
        (async () => {
            try {
                const result = await callApi(
                    `https://api.trakt.tv/search/${request.payload.type}?` +
                        new URLSearchParams(request.payload).toString(),
                    'GET',
                    '',
                    true
                );
                const mediaInfo = result[0];
                chrome.storage.local.set({
                    [getUrlIdentifier(sender.tab.url)]: {
                        ...mediaInfo,
                        type: request.payload.type
                    }
                });
                sendResponse(mediaInfo);
            } catch (error) {
                sendResponse('fail search dawg', error);
            }
        })();
        return true;
    }
});
