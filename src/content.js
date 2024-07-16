const url = window.location.href;
const urlObj = new URL(url);

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

if (
    urlObj.hostname === 'fmovies24.to' &&
    (urlObj.pathname.startsWith('/tv') || urlObj.pathname.startsWith('/movie'))
) {
    const title = document.querySelector('h1.name').textContent;
    const year = document.querySelector('span.year').textContent ?? undefined;

    const metaDiv = document.querySelector('div.meta');
    const runtimes =
        metaDiv.children[metaDiv.children.length - 1].textContent.split(
            ' '
        )[0] ?? undefined;

    // const genreSpan = document.querySelector(
    //     'div.detail > div:nth-child(3) > span'
    // ).textContent;
    // const genres =
    //     genreSpan.split(',').map((genre) => genre.trim().toLowerCase()) ??
    //     undefined;

    (async () => {
        const resp = await chrome.runtime.sendMessage({
            type: 'mediaInfo',
            payload: {
                type: getMediaType(url),
                query: title || undefined,
                years: year,
                runtimes,
            }
        });
        console.log(resp);
    })();
}