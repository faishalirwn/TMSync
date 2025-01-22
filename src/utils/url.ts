import { SeasonAndEpisode } from './types';

export const getUrlIdentifier = (url: string): string => {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    if (
        urlObj.hostname === 'www.cineby.app' &&
        (urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie'))
    ) {
        return urlObj.hostname + '/' + urlPath[1] + '/' + urlPath[2];
    } else {
        return '';
    }
};

export const getSeasonEpisodeObj = (url: string): SeasonAndEpisode | null => {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

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

    return null;
};
