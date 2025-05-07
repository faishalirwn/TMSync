import { TraktPageInfo } from '../../traktContentScript';
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
    },
    highlighting: {
        getCurrentHighlightContextKey: (url: string): string | null => {
            const path = new URL(url).pathname;
            if (/\/watch\/\d+(\/\d+\/\d+)?/.test(path))
                return 'watchPageMenuEpisodes';
            return null;
        },
        contexts: {
            watchPageMenuEpisodes: {
                containerSelector: 'div.episodes-box.visible',
                itemSelector: 'button.episodebox-item',
                getSeasonEpisodeFromElement: (
                    itemElement: Element,
                    containerElement: Element
                ): { season: number; episode: number } | null => {
                    const button = itemElement as HTMLButtonElement;
                    const episodeNumberText = button
                        .querySelector('.episode-number')
                        ?.textContent?.trim();

                    if (!episodeNumberText) return null;
                    const episode = parseInt(episodeNumberText, 10);
                    if (isNaN(episode)) return null;

                    let season: number | null = null;

                    const seasonHeader = containerElement.querySelector(
                        '.episodesbox-header > h3'
                    );
                    if (seasonHeader && seasonHeader.textContent) {
                        const seasonMatch =
                            seasonHeader.textContent.match(/Season\s*(\d+)/i);
                        if (seasonMatch && seasonMatch[1]) {
                            season = parseInt(seasonMatch[1], 10);
                        }
                    }

                    if (season === null || isNaN(season)) {
                        console.warn(
                            'Could not parse season number from container:',
                            containerElement
                        );
                        return null;
                    }

                    return { season, episode };
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
                return `https://hexa.watch/watch/${pageInfo.tmdbId}/${pageInfo.season}/${pageInfo.episode}`;
            }
            return `https://hexa.watch/watch/${pageInfo.tmdbId}`;
        } else if (pageInfo.type === 'movie') {
            return `https://hexa.watch/watch/${pageInfo.tmdbId}`;
        }
        return null;
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
    const match = url.match(/\/watch\/\d+\/(\d+)\/(\d+)/);
    if (match && match[1] && match[2]) {
        const season = parseInt(match[1], 10);
        const episode = parseInt(match[2], 10);
        if (!isNaN(season) && season >= 0 && !isNaN(episode) && episode >= 0) {
            return { season: season, number: episode };
        }
    }
    return null;
};
