import { waitForElm } from '../content';
import { SeasonEpisodeObj } from '../types';

interface MediaInfoSelectors {
    title: string;
    year: string;
}

type MediaType = 'movie' | 'show' | null;

export interface SiteConfigBase {
    name: string;
    selectorType: 'css' | 'xpath';
    urlPatterns: {
        moviePage: RegExp;
        showPage: RegExp;
    };
    selectors: {
        movie: MediaInfoSelectors;
        show: MediaInfoSelectors;
    };
    // Default methods shared by all sites
    isWatchPage(url: string): boolean;
    isShowPage(url: string): boolean;
    getMediaType(url: string): MediaType;
    getUrlIdentifier(url: string): string;
    getSeasonEpisodeObj(url: string): SeasonEpisodeObj | null;
    // Methods to extract title and year
    getTitle(url: string): Promise<string | null>;
    getYear(url: string): Promise<string | null>;
}

export const createSiteConfig = (config: Partial<SiteConfigBase>) => {
    return {
        name: config.name || '',
        selectorType: config.selectorType || 'css',
        urlPatterns: config.urlPatterns || {
            moviePage: /^$/,
            showPage: /^$/
        },
        selectors: config.selectors || {
            movie: { title: '', year: '' },
            show: { title: '', year: '' }
        },
        getMediaType(url: string): MediaType {
            const urlObj = new URL(url);
            if (this.urlPatterns.moviePage.test(urlObj.pathname)) {
                return 'movie';
            } else if (this.urlPatterns.showPage.test(urlObj.pathname)) {
                return 'show';
            } else {
                return null;
            }
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
