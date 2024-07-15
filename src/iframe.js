let isWatched = false;

const intervalId = window.setInterval(function () {
    const video = document.querySelector("video")
    const watchPercentage = (video.currentTime / video.duration) * 100;

    if (watchPercentage >= 80 && !isWatched) {

        isWatched = true;

        chrome.runtime.sendMessage({
            type: 'scrobble',
            payload: {
                progress: watchPercentage
            }
        });

    }
}, 1000);