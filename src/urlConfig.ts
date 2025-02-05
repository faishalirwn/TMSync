import { waitForElm } from './utils/content';
import { ConfigsType, MediaInfoConfig } from './utils/types';

function getMediaType(
    url: string,
    pos: number,
    keywords: { movie: string; show: string }
) {
    let type = '';
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    console.log(urlPath[pos]);

    if (urlPath[pos] === keywords.movie) {
        type = 'movie';
    } else if (urlPath[pos] === keywords.show) {
        type = 'show';
    }

    return type;
}

const cinebyConfig: MediaInfoConfig = {
    async getTitle() {
        const titleElement = await waitForElm('head > title');
        const title = titleElement?.textContent;

        if (title) {
            return title;
        } else {
            return null;
        }
    },
    async getYear() {
        const yearElement = await waitForElm(
            '#__next > div.relative.w-full.h-screen > div.z-\\[1\\].mx-0.max-w-screen-lg.px-4.pb-4.md\\:mx-4.lg\\:mx-auto.lg\\:pb-20.xl\\:px-0 > div.flex.items-center.justify-center.min-h-screen.gap-12.text-center > div > div.flex.items-center.gap-3.font-semibold > div:nth-child(1)'
        );
        const date = yearElement?.textContent;
        // TODO: in play page, year is not found

        if (date) {
            return date.split('/')[2].replace(' ', '');
        } else {
            return null;
        }
    },
    // TODO: primary method: use tmdb id extracted from dom wherever.
    hostname: 'www.cineby.app',
    isWatchpage(url: string) {
        const urlObj = new URL(url);

        return (
            urlObj.pathname.startsWith('/tv') ||
            urlObj.pathname.startsWith('/movie')
        );
    },
    urlMediaPath: {
        pos: 1,
        keywords: {
            movie: 'movie',
            show: 'tv'
        }
    },
    getMediaType(url: string) {
        return getMediaType(
            url,
            this.urlMediaPath.pos,
            this.urlMediaPath.keywords
        );
    }
};

const freekConfig: MediaInfoConfig = {
    async getTitle(url: string) {
        let titleElement;

        const urlObj = new URL(url);

        if (urlObj.pathname.startsWith('/watch/tv')) {
            titleElement = await waitForElm(
                '//*[@id="right-header"]/div[1]',
                true
            );
        } else if (urlObj.pathname.startsWith('/watch/movie')) {
            titleElement = await waitForElm(
                '//*[@id="root"]/div/div[2]/div/div[5]/div/div[2]/div/div[2]/div/span',
                true
            );
        }

        const title = titleElement?.textContent;

        if (title) {
            return title;
        } else {
            return null;
        }
    },
    async getYear(url: string) {
        let yearElement;

        const urlObj = new URL(url);

        if (urlObj.pathname.startsWith('/watch/tv')) {
            yearElement = await waitForElm(
                '//*[@id="root"]/div/div[2]/div/div[5]/div/div[2]/div[3]/div[1]/div[2]/div[3]/span[2]',
                true
            );
        } else if (urlObj.pathname.startsWith('/watch/movie')) {
            yearElement = await waitForElm(
                '//*[@id="root"]/div/div[2]/div/div[5]/div/div[2]/div/div[1]/div[2]/div[3]/span[2]',
                true
            );
        }

        const date = yearElement?.textContent;

        if (date) {
            return date.split(',')[1].replace(' ', '');
        } else {
            return null;
        }
    },
    hostname: 'freek.to',
    isWatchpage(url: string) {
        const urlObj = new URL(url);

        return (
            urlObj.pathname.startsWith('/watch/tv') ||
            urlObj.pathname.startsWith('/watch/movie')
        );
    },
    urlMediaPath: {
        pos: 2,
        keywords: {
            movie: 'movie',
            show: 'tv'
        }
    },
    getMediaType(url: string) {
        return getMediaType(
            url,
            this.urlMediaPath.pos,
            this.urlMediaPath.keywords
        );
    }
};

export const configs: ConfigsType = {
    'www.cineby.app': cinebyConfig,
    'freek.to': freekConfig
};
