import { configs } from '../urlConfig';
import { HostnameType } from './types';

export const getUrlIdentifier = (url: string): string => {
    const urlObj = new URL(url);
    const urlHostname = urlObj.hostname as HostnameType;
    const urlPath = urlObj.pathname.split('/');

    if (!(urlHostname in configs)) {
        console.error('Hostname not supported:', urlHostname);
        return '';
    }

    const config = configs[urlHostname];

    if (config.isWatchpage(url)) {
        return config.getUrlIdentifier(url);
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
