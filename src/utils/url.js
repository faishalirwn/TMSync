export const getUrlIdentifier = (url) => {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    if (
        urlObj.hostname === 'www.cineby.ru' &&
        (urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie'))
    ) {
        return urlObj.hostname + '/' + urlPath[1] + '/' + urlPath[2];
    }
};

export const getEpisode = (url) => {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    if (
        urlObj.hostname === 'www.cineby.ru' &&
        (urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie'))
    ) {
        if (urlPath.length === 3) {
            return {
                season: 1,
                number: 1
            };
        } else {
            return {
                season: urlPath[3],
                number: urlPath[4]
            };
        }
    }
};
