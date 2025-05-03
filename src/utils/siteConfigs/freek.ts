import { createSiteConfig } from './baseConfig';

export const freekConfig = createSiteConfig({
    name: 'Freek',
    selectorType: 'xpath',
    urlPatterns: {
        moviePage: /\/watch\/movie\/.+/,
        showPage: /\/watch\/tv\/.+/
    },
    selectors: {
        movie: {
            title: '//*[@id="root"]/div/div[2]/div/div[5]/div/div[2]/div/div[2]/div/span',
            year: '//*[@id="root"]/div/div[2]/div/div[5]/div/div[2]/div/div[1]/div[2]/div[3]/span[2]'
        },
        show: {
            title: '//*[@id="right-header"]/div[1]',
            year: '//*[@id="root"]/div/div[2]/div/div[5]/div/div[2]/div[3]/div[1]/div[2]/div[3]/span[2]'
        }
    }
});

// Override specific methods as needed
freekConfig.getUrlIdentifier = function (url: string): string {
    const urlObj = new URL(url);
    const urlPath = urlObj.pathname.split('/');

    if (urlObj.hostname === 'freek.to' && this.isWatchPage(url)) {
        return (
            urlObj.hostname +
            '/' +
            urlPath[1] +
            '/' +
            urlPath[2] +
            '/' +
            urlPath[3]
        );
    }
    return '';
};

freekConfig.getSeasonEpisodeObj = function (
    url: string
): { season: number; number: number } | null {
    if (!this.isShowPage(url)) return null;

    const urlObj = new URL(url);
    const urlQueryParams = urlObj.searchParams;

    if (urlQueryParams.has('season') && urlQueryParams.has('ep')) {
        return {
            season: Number(urlQueryParams.get('season')),
            number: Number(urlQueryParams.get('ep'))
        };
    } else if (urlQueryParams.has('ep')) {
        return {
            season: 1,
            number: Number(urlQueryParams.get('ep'))
        };
    } else if (urlQueryParams.has('season')) {
        return {
            season: Number(urlQueryParams.get('season')),
            number: 1
        };
    }
    return { season: 1, number: 1 };
};
