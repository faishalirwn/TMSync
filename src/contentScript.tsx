// Set up URL monitoring using different methods to ensure we catch navigation changes
let lastUrl = location.href;

// Method 1: Use MutationObserver to watch for URL changes
const observer = new MutationObserver(function (mutations) {
    if (location.href !== lastUrl) {
        console.log('URL changed from', lastUrl, 'to', location.href);
        lastUrl = location.href;

        // First run the cleanup from the previous page
        if (typeof cleanup === 'function') {
            cleanup();
        }

        // Then run main() for the new page and store its cleanup function
        cleanup = main();
    }
});

observer.observe(document, {
    subtree: true,
    childList: true
});

// Method 2: Regular interval check as a fallback
setInterval(() => {
    if (location.href !== lastUrl) {
        console.log('URL changed from', lastUrl, 'to', location.href);
        lastUrl = location.href;

        // First run the cleanup from the previous page
        if (typeof cleanup === 'function') {
            cleanup();
        }

        // Then run main() for the new page and store its cleanup function
        cleanup = main();
    }
}, 1000);

// Main function to handle media content
function main() {
    const url = window.location.href;
    const urlObj = new URL(url);
    console.log('Main function executing for:', url);

    if (
        urlObj.hostname === 'www.cineby.ru' &&
        (urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie'))
    ) {
        const getMediaType = (url: string) => {
            let type;
            const urlObj = new URL(url);
            const urlPath = urlObj.pathname.split('/');

            if (urlPath[1] === 'movie') {
                type = 'movie';
            } else if (urlPath[1] === 'tv') {
                type = 'show';
            }
            return type;
        };

        // Store interval IDs for cleanup
        const intervals = new Set<NodeJS.Timeout>();

        // Media info detection
        const mediaInfoInterval = setInterval(() => {
            try {
                const titleElement = document.querySelector('head > title');
                const yearElement = document.querySelector(
                    '#__next > div.relative.w-full.h-screen > div.z-\\[1\\].mx-0.max-w-screen-lg.px-4.pb-4.md\\:mx-4.lg\\:mx-auto.lg\\:pb-20.xl\\:px-0 > div.flex.items-center.justify-center.min-h-screen.gap-12.text-center > div > div.flex.items-center.gap-3.font-semibold > div:nth-child(1)'
                );

                if (titleElement && yearElement) {
                    clearInterval(mediaInfoInterval);
                    intervals.delete(mediaInfoInterval);

                    const title = titleElement.textContent;
                    const year = yearElement.textContent
                        ? yearElement.textContent.split('/')[0]
                        : undefined;

                    chrome.runtime
                        .sendMessage({
                            type: 'mediaInfo',
                            payload: {
                                type: getMediaType(url),
                                query: title || undefined,
                                years: year
                            }
                        })
                        .then((resp) => {
                            console.log('Media info response:', resp);
                        })
                        .catch((err) => {
                            console.error('Error sending media info:', err);
                        });
                }
            } catch (error) {
                console.error('Error in media info detection:', error);
            }
        }, 500);
        intervals.add(mediaInfoInterval);

        // Cleanup media info interval after timeout
        setTimeout(() => {
            clearInterval(mediaInfoInterval);
            intervals.delete(mediaInfoInterval);
        }, 10000);

        let isWatched = false;

        // Video progress monitoring
        console.log('Initiate Video progress monitoring');
        const watchInterval = setInterval(() => {
            try {
                const video = document.querySelector('video');
                if (video) {
                    const watchPercentage =
                        (video.currentTime / video.duration) * 100;

                    if (watchPercentage >= 80 && !isWatched) {
                        console.log('Watch percentage:', watchPercentage);
                        isWatched = true;

                        chrome.runtime
                            .sendMessage({
                                type: 'scrobble',
                                payload: {
                                    progress: watchPercentage
                                }
                            })
                            .then((resp) => {
                                console.log('Scrobble response:', resp);
                            })
                            .catch((err) => {
                                console.error('Error sending scrobble:', err);
                            });
                    }
                }
            } catch (error) {
                console.error('Error in video monitoring:', error);
            }
        }, 1000);
        intervals.add(watchInterval);

        // Return cleanup function
        return function cleanup() {
            console.log('Cleaning up intervals...');
            for (const interval of intervals) {
                clearInterval(interval);
            }
            intervals.clear();
        };
    }

    // Return empty cleanup function if URL doesn't match
    return function cleanup() {};
}

// Initial call
let cleanup = main();
