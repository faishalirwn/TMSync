import { waitForElm } from '../content';
import { createSiteConfig } from './baseConfig';

export const hydraConfig = createSiteConfig({
    name: 'HydraHD',
    selectorType: 'css',
    urlPatterns: {
        moviePage: /\/movie\/.+/,
        showPage: /\/watchseries\/.+-online-free\/season\/.*\/episode\/.*/
    },
    selectors: {
        movie: {
            title: '#wdthcontrol > div.btn-group.btns-under-jumbo.center-block.col-lg-12 > div > div > div > div.row.diz-title > div.ploting > h1',
            year: '#wdthcontrol > div.btn-group.btns-under-jumbo.center-block.col-lg-12 > div > div > div > div.row.diz-title > span:nth-child(2) > span:nth-child(5)'
        },
        show: {
            title: '#wdthcontrol > div.btn-group.btns-under-jumbo.center-block.col-lg-12 > div > div:nth-child(3) > div > div.row.diz-title > div.ploting > h1',
            year: '#wdthcontrol > div.btn-group.btns-under-jumbo.center-block.col-lg-12 > div > div:nth-child(3) > div > div.row.diz-title > span:nth-child(2) > span:nth-child(5)'
        }
    }
});

hydraConfig.getTitle = async function (url: string) {
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

        if (this.isShowPage(url)) {
            return element?.textContent?.split('-')[0].trim() || null;
        }

        return element?.textContent?.trim() || null;
    } catch (error) {
        console.error(`Error getting title for ${url}:`, error);
        return null;
    }
};

// Override specific methods as needed
hydraConfig.getUrlIdentifier = function (url: string): string {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    if (this.isWatchPage(url)) {
        return urlObj.hostname + '/' + urlPath[1] + '/' + urlPath[2];
    }
    return '';
};

hydraConfig.getSeasonEpisodeObj = function (
    url: string
): { season: number; number: number } | null {
    if (!this.isShowPage(url)) return null;

    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    if (urlPath.length === 3) {
        return { season: 1, number: 1 };
    } else {
        return {
            season: Number(urlPath[4]),
            number: Number(urlPath[6])
        };
    }
};
