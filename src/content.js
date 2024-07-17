const url = window.location.href;
const urlObj = new URL(url);

if (
    urlObj.hostname === 'fmovies24.to' &&
    (urlObj.pathname.startsWith('/tv') || urlObj.pathname.startsWith('/movie'))
) {
    const getMediaType = (url) => {
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

    const title = document.querySelector('h1.name').textContent;
    const year = document.querySelector('span.year').textContent ?? undefined;

    const metaDiv = document.querySelector('div.meta');
    const runtimes =
        metaDiv.children[metaDiv.children.length - 1].textContent.split(
            ' '
        )[0] ?? undefined;

    (async () => {
        const resp = await chrome.runtime.sendMessage({
            type: 'mediaInfo',
            payload: {
                type: getMediaType(url),
                query: title || undefined,
                years: year,
                runtimes
            }
        });
        console.log(resp);
    })();
}

function waitForElm(selector) {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        // If you get "parameter 1 is not of type 'Node'" error, see https://stackoverflow.com/a/77855838/492336
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}

if (urlObj.hostname === 'binged.live' && urlObj.pathname.startsWith('/watch')) {
    const getMediaType = (url) => {
        let type;
        const urlObj = new URL(url);
        const urlPath = urlObj.pathname.split('/');

        if (urlPath[2] === 'movie') {
            type = 'movie';
        } else if (urlPath[2] === 'tv') {
            type = 'show';
        }
        return type;
    };

    (async () => {
        let title;
        let year;
        if (getMediaType(url) === 'movie') {
            const titleEl = await waitForElm(
                // prettier-ignore
                // eslint-disable-next-line no-useless-escape
                '#root > div.min-h-screen.overflow-auto > div:nth-child(2) > div.w-full.max-w-7xl.mx-auto.px-2.sm\\:px-3 > div > div.flex.w-full.lg\\:w-\\[70\\%\\].md\\:w-\\[80\\%\\].flex-col.gap-2 > span'
            );
            title = titleEl.textContent;

            const yearEl = await waitForElm(
                // prettier-ignore
                // eslint-disable-next-line no-useless-escape
                'div.min-h-screen.overflow-auto > div:nth-child(2) > div.w-full.max-w-7xl.mx-auto.px-2.sm\\:px-3 > div > div.flex.w-full.lg\\:w-\\[70\\%\\].md\\:w-\\[80\\%\\].flex-col.gap-2 > div.flex.flex-col.flex-wrap.gap-\\[\\.6rem\\].lg\\:gap-\\[\\.4rem\\].tracking-wide > div:nth-child(1) > span'
            );
            year = yearEl.textContent.split('/')[0] ?? undefined;
        }

        if (getMediaType(url) === 'show') {
            const titleEl = await waitForElm(
                // prettier-ignore
                // eslint-disable-next-line no-useless-escape
                '#root > div:nth-child(7) > div > div.flex.w-full.lg\\:w-\\[70\\%\\].md\\:w-\\[80\\%\\].flex-col.gap-2 > span'
            );
            title = titleEl.textContent;

            const yearEl = await waitForElm(
                // prettier-ignore
                // eslint-disable-next-line no-useless-escape
                '#root > div:nth-child(7) > div > div.flex.w-full.lg\\:w-\\[70\\%\\].md\\:w-\\[80\\%\\].flex-col.gap-2 > div.flex.flex-col.flex-wrap.gap-\\[\\.6rem\\].lg\\:gap-\\[\\.4rem\\].tracking-wide > div:nth-child(1) > span'
            );
            year = yearEl.textContent.split('/')[0] ?? undefined;
        }

        const resp = await chrome.runtime.sendMessage({
            type: 'mediaInfo',
            payload: {
                type: getMediaType(url),
                query: title || undefined,
                years: year
            }
        });
        console.log(resp);
    })();
}
