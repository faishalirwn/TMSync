import { getUrlIdentifier, getMediaType } from "./utils/url";

let isWatched = false;
const intervalId = window.setInterval(function () {
    const video = document.querySelector("video")
    const watchPercentage = (video.currentTime / video.duration) * 100;
    console.log(watchPercentage);

    // if (watchPercentage >= 80 && !isWatched) {
    if (watchPercentage >= 80) {

        isWatched = true;

        console.log(getMediaType())
        const episodeObj = getMediaType() === 'show' ? getEpisode() : undefined;

        (async () => {
            const mediaObjectResp = await chrome.storage.sync.get([getUrlIdentifier()]);
            const mediaObject = await mediaObjectResp[getUrlIdentifier()];
            console.log({
                [getMediaType()]: mediaObject,
                ...episodeObj
            });
            // const response = await chrome.runtime.sendMessage({
            //     type: 'Scrobble',
            //     payload: {
            //         [getMediaType()]: mediaObject,
            //         progress: watchPercentage,
            //         ...episodeObj
            //     }
            // });
            // console.log(response)
        })();
    }
}, 1000);