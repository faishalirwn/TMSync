import { waitForElm } from '../content';
import { SeasonEpisodeObj } from '../types';

interface MediaInfoSelectors {
    title: string;
    year: string;
}

export type MediaType = 'movie' | 'show' | null;

export interface SiteConfigBase {
    name: string;
    selectorType: 'css' | 'xpath';
    urlPatterns: {
        movie: RegExp;
        show: RegExp;
    };
    selectors: {
        movie: MediaInfoSelectors;
        show: MediaInfoSelectors;
    };

    usesTmdbId?: boolean;
    getTmdbId?(url: string): string | null;
    tmdbIdUrlPatterns?: {
        movie: RegExp;
        show: RegExp;
    };

    isWatchPage(url: string): boolean;
    isShowPage(url: string): boolean;
    getMediaType(url: string): MediaType;
    getUrlIdentifier(url: string): string;
    getSeasonEpisodeObj(url: string): SeasonEpisodeObj | null;

    getTitle(url: string): Promise<string | null>;
    getYear(url: string): Promise<string | null>;
}

export const createSiteConfig = (config: Partial<SiteConfigBase>) => {
    return {
        name: config.name || '',
        selectorType: config.selectorType || 'css',
        urlPatterns: config.urlPatterns || {
            movie: /^$/,
            show: /^$/
        },
        selectors: config.selectors || {
            movie: { title: '', year: '' },
            show: { title: '', year: '' }
        },
        usesTmdbId: config.usesTmdbId ?? false,
        tmdbIdUrlPatterns: config.tmdbIdUrlPatterns,
        getTmdbId(url: string): string | null {
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            if (this.tmdbIdUrlPatterns?.movie?.test(path)) {
                const match = path.match(/\/(\d+)$/);
                return match ? match[1] : null;
            }
            if (this.tmdbIdUrlPatterns?.show?.test(path)) {
                const match = path.match(/\/(\d+)/);
                return match ? match[1] : null;
            }
            return null;
        },
        getMediaType(url: string): MediaType {
            const urlObj = new URL(url);
            const path = urlObj.pathname;

            if (this.tmdbIdUrlPatterns?.movie?.test(path)) return 'movie';
            if (this.tmdbIdUrlPatterns?.show?.test(path)) return 'show';

            if (this.urlPatterns.movie.test(path)) return 'movie';
            if (this.urlPatterns.show.test(path)) return 'show';

            return null;
        },
        isWatchPage(url: string): boolean {
            return this.getMediaType(url) !== null;
        },
        isShowPage(url: string): boolean {
            return this.getMediaType(url) === 'show';
        },
        isMoviePage(url: string): boolean {
            return this.getMediaType(url) === 'movie';
        },
        getUrlIdentifier(url: string): string {
            const urlObj = new URL(url);
            if (this.isWatchPage(url)) {
                return `${urlObj.hostname}${urlObj.pathname}`;
            }
            return '';
        },
        getSeasonEpisodeObj(
            url: string
        ): { season: number; number: number } | null {
            // Default implementation - should be overridden
            return null;
        },
        // Default implementations for getTitle and getYear
        async getTitle(url: string): Promise<string | null> {
            if (!this.isWatchPage(url)) return null;

            let selector = '';

            if (this.isMoviePage(url)) {
                selector = this.selectors.movie.title;
            } else if (this.isShowPage(url)) {
                selector = this.selectors.show.title;
            }

            if (!selector) return null;

            try {
                const element = await waitForElm(
                    selector,
                    this.selectorType === 'xpath'
                );
                return element?.textContent?.trim() || null;
            } catch (error) {
                console.error(`Error getting title for ${url}:`, error);
                return null;
            }
        },

        async getYear(url: string): Promise<string | null> {
            if (!this.isWatchPage(url)) return null;

            let selector = '';

            if (this.isMoviePage(url)) {
                selector = this.selectors.movie.year;
            } else if (this.isShowPage(url)) {
                selector = this.selectors.show.year;
            }

            if (!selector) return null;

            try {
                const element = await waitForElm(
                    selector,
                    this.selectorType === 'xpath'
                );
                const text = element?.textContent?.trim();

                if (!text) return null;

                // Try to extract year from text
                const yearMatch = text.match(/\b(19|20)\d{2}\b/);
                return yearMatch ? yearMatch[0] : text;
            } catch (error) {
                console.error(`Error getting year for ${url}:`, error);
                return null;
            }
        }
    };
};
