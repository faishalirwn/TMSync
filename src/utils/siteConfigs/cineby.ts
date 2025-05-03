import { createSiteConfig } from './baseConfig';

export const cinebyConfig = createSiteConfig({
    name: 'Cineby',
    selectorType: 'css',
    urlPatterns: {
        moviePage: /\/movie\/.+/,
        showPage: /\/tv\/.+/
    },
    selectors: {
        movie: {
            title: 'head > title',
            year: '#__next > div.relative.w-full.h-screen > div.z-\\[1\\].mx-0.max-w-screen-lg.px-4.pb-4.md\\:mx-4.lg\\:mx-auto.lg\\:pb-20.xl\\:px-0 > div.flex.items-center.justify-center.min-h-screen.gap-12.text-center > div > div.flex.items-center.gap-3.font-semibold > div:nth-child(1)'
        },
        show: {
            title: 'head > title',
            year: '#__next > div.relative.w-full.h-screen > div.z-\\[1\\].mx-0.max-w-screen-lg.px-4.pb-4.md\\:mx-4.lg\\:mx-auto.lg\\:pb-20.xl\\:px-0 > div.flex.items-center.justify-center.min-h-screen.gap-12.text-center > div > div.flex.items-center.gap-3.font-semibold > div:nth-child(1)'
        }
    }
});

// Override specific methods as needed
cinebyConfig.getUrlIdentifier = function (url: string): string {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    if (this.isWatchPage(url)) {
        return urlObj.hostname + '/' + urlPath[1] + '/' + urlPath[2];
    }
    return '';
};

cinebyConfig.getSeasonEpisodeObj = function (
    url: string
): { season: number; number: number } | null {
    if (!this.isShowPage(url)) return null;

    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    if (urlPath.length === 3) {
        return { season: 1, number: 1 };
    } else {
        return {
            season: Number(urlPath[3]),
            number: Number(urlPath[4])
        };
    }
};
