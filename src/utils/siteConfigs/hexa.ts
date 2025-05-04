import { createSiteConfig, SiteConfigBase } from './baseConfig';

export const hexaWatchConfig: SiteConfigBase = createSiteConfig({
    name: 'Hexa Watch',
    selectorType: 'css',
    usesTmdbId: true,
    tmdbIdUrlPatterns: {
        movie: /^\/details\/movie\/\d+$/,
        show: /^\/details\/tv\/\d+$/
    },

    urlPatterns: {
        movie: /^\/(details|watch)\/movie\/\d+/,
        show: /^\/(details|watch)\/tv\/\d+/
    },
    selectors: {
        movie: { title: '', year: '' },
        show: { title: '', year: '' }
    }
});

hexaWatchConfig.getTmdbId = function (url: string): string | null {
    const match = url.match(/\/(?:details|watch)\/(?:movie|tv)\/(\d+)/);
    return match ? match[1] : null;
};

hexaWatchConfig.getSeasonEpisodeObj = function (
    url: string
): { season: number; number: number } | null {
    const match = url.match(/\/watch\/tv\/\d+\/(\d+)\/(\d+)/);

    if (match && match[1] && match[2]) {
        const season = parseInt(match[1], 10);
        const episode = parseInt(match[2], 10);

        if (!isNaN(season) && season > 0 && !isNaN(episode) && episode > 0) {
            return { season: season, number: episode };
        }
    }

    return null;
};
