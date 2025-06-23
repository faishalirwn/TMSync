import { TraktPageInfo } from '../../content-scripts/trakt';
import { createSiteConfig, SiteConfigBase } from './baseConfig';

export const hexaWatchConfig: SiteConfigBase = createSiteConfig({
    name: 'Hexa Watch',
    selectorType: 'css',
    usesTmdbId: true,
    tmdbIdUrlPatterns: {
        movie: /\/(details|watch)\/movie\/\d+$/,
        show: /\/(details|watch)\/tv\/\d+$/
    },

    urlPatterns: {
        movie: /\/(details|watch)\/movie\/\d+/,
        show: /\/(details|watch)\/tv\/\d+/
    },
    selectors: {
        movie: { title: '', year: '' },
        show: { title: '', year: '' }
    },
    highlighting: {
        getCurrentHighlightContextKey: (url: string): string | null => {
            const path = new URL(url).pathname;
            if (/\/details\/tv\/\d+/.test(path)) return 'detailPageEpisodes';
            if (/\/watch\/tv\/\d+(\/\d+\/\d+)?/.test(path))
                return 'watchPageMenuEpisodes';
            return null;
        },
        contexts: {
            detailPageEpisodes: {
                containerSelector: 'div',
                itemSelector: 'a[href*="/watch/tv/"]',
                getSeasonEpisodeFromElement: (
                    itemElement: Element
                ): { season: number; episode: number } | null => {
                    const anchor = itemElement as HTMLAnchorElement;
                    const hrefMatch = anchor.href.match(
                        /\/watch\/tv\/\d+\/(\d+)\/(\d+)/
                    );
                    if (hrefMatch) {
                        return {
                            season: parseInt(hrefMatch[1], 10),
                            episode: parseInt(hrefMatch[2], 10)
                        };
                    }
                    return null;
                },
                getElementToStyle: (
                    itemElement: Element
                ): HTMLElement | null => {
                    return itemElement.closest(
                        'div.group'
                    ) as HTMLElement | null;
                }
            },
            watchPageMenuEpisodes: {
                containerSelector:
                    'div.absolute.bottom-full div[class*="bg-[#0A0A0A]/95"]',
                itemSelector: 'button[data-episode-id]',
                getSeasonEpisodeFromElement: (
                    itemElement: Element
                ): { season: number; episode: number } | null => {
                    const button = itemElement as HTMLButtonElement;
                    const episodeId = button.dataset.episodeId;
                    const match = episodeId?.match(/s(\d+)e(\d+)/);
                    if (match) {
                        return {
                            season: parseInt(match[1], 10),
                            episode: parseInt(match[2], 10)
                        };
                    }
                    return null;
                },
                getElementToStyle: (
                    itemElement: Element
                ): HTMLElement | null => {
                    return itemElement as HTMLElement;
                }
            }
        }
    },
    generateWatchLink: (pageInfo: TraktPageInfo): string | null => {
        if (!pageInfo.tmdbId) return null;
        if (pageInfo.type === 'show') {
            if (
                pageInfo.season !== undefined &&
                pageInfo.episode !== undefined
            ) {
                return `https://hexa.watch/watch/tv/${pageInfo.tmdbId}/${pageInfo.season}/${pageInfo.episode}`;
            }
            return `https://hexa.watch/details/tv/${pageInfo.tmdbId}`;
        } else if (pageInfo.type === 'movie') {
            return `https://hexa.watch/watch/movie/${pageInfo.tmdbId}`;
        }
        return null;
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
    console.log('match', url, match);

    if (match && match[1] && match[2]) {
        const season = parseInt(match[1], 10);
        const episode = parseInt(match[2], 10);

        if (!isNaN(season) && season > 0 && !isNaN(episode) && episode > 0) {
            return { season: season, number: episode };
        }
    }

    return null;
};
