export const getUrlIdentifier = (url: string): string => {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    // TODO: use config here, that means either the config is going to be a standalone file or we need to import it from the content script
    if (
        urlObj.hostname === 'www.cineby.app' &&
        (urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie'))
    ) {
        return urlObj.hostname + '/' + urlPath[1] + '/' + urlPath[2];
    } else if (
        urlObj.hostname === 'freek.to' &&
        (urlObj.pathname.startsWith('/watch/tv') ||
            urlObj.pathname.startsWith('/watch/movie'))
    ) {
        return (
            urlObj.hostname +
            '/' +
            urlPath[1] +
            '/' +
            urlPath[2] +
            '/' +
            urlPath[3]
        );
    } else {
        return '';
    }
};

export const getSeasonEpisodeObj = (url: string) => {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    // TODO: freek ep and season parsing
    if (
        urlObj.hostname === 'www.cineby.app' &&
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
                season: Number(urlPath[3]),
                number: Number(urlPath[4])
            };
        }
    }
};
