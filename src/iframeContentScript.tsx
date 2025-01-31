// let isWatched = false;

// window.setInterval(function () {
//     const video = document.querySelector('video');
//     if (video) {
//         const watchPercentage = (video.currentTime / video.duration) * 100;
//         console.log(watchPercentage);

//         if (watchPercentage >= 80 && !isWatched) {
//             isWatched = true;

//             (async () => {
//                 const resp = await chrome.runtime.sendMessage({
//                     type: 'scrobble',
//                     payload: {
//                         progress: watchPercentage
//                     }
//                 });
//                 console.log(resp);
//             })();
//         }
//     }
// }, 1000);
