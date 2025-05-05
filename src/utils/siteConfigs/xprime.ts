import { createSiteConfig, SiteConfigBase } from './baseConfig';

export const xprimeTvConfig: SiteConfigBase = createSiteConfig({
    name: 'XPrimeTV',
    selectorType: 'css',
    usesTmdbId: true,

    tmdbIdUrlPatterns: {
        movie: /\/watch\/\d+$/,
        show: /\/watch\/\d+\/\d+\/\d+$/
    },
    urlPatterns: {
        movie: /\/watch\/\d+$/,
        show: /\/watch\/\d+\/\d+\/\d+$/
    },

    selectors: {
        movie: { title: '', year: '' },
        show: { title: '', year: '' }
    }
});

xprimeTvConfig.getTmdbId = function (url: string): string | null {
    const match = url.match(/\/watch\/(\d+)/);
    console.log(url, match);
    return match ? match[1] : null;
};

xprimeTvConfig.getSeasonEpisodeObj = function (
    url: string
): { season: number; number: number } | null {
    const match = url.match(/^\/watch\/\d+\/(\d+)\/(\d+)/);
    if (match && match[1] && match[2]) {
        const season = parseInt(match[1], 10);
        const episode = parseInt(match[2], 10);
        if (!isNaN(season) && season >= 0 && !isNaN(episode) && episode >= 0) {
            return { season: season, number: episode };
        }
    }
    return null;
};
