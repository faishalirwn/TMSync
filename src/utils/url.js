export const getUrlIdentifier = (url) => {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    if (
        urlObj.hostname === 'binged.live' &&
        urlObj.pathname.startsWith('/watch')
    ) {
        return urlObj.hostname + '/' + urlObj.pathname;
    }

    if (
        urlObj.hostname === 'fmovies24.to' &&
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
        urlObj.hostname === 'binged.live' &&
        urlObj.pathname.startsWith('/watch')
    ) {
        return {
            season: urlObj.searchParams.get('season'),
            number: urlObj.searchParams.get('ep')
        };
    }

    if (
        urlObj.hostname === 'fmovies24.to' &&
        (urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie'))
    ) {
        const episodeArr = urlPath[urlPath.length - 1].split('-');
        return {
            season: episodeArr[0],
            number: episodeArr[1]
        };
    }
};
