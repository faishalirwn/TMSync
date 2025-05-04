// src/utils/siteConfigs/xprimeTv.ts (Example)
import { createSiteConfig, SiteConfigBase } from './baseConfig';

export const xprimeTvConfig: SiteConfigBase = createSiteConfig({
    name: 'XPrimeTV',
    selectorType: 'css', // For potential fallback or other elements
    usesTmdbId: true, // Crucial: Assume IDs are TMDB

    // --- Option A: Define specific patterns if possible ---
    tmdbIdUrlPatterns: {
        // If you *can* differentiate, use this (preferred)
        movie: /\/watch\/\d+$/, // Movie has only ID
        show: /\/watch\/\d+\/\d+\/\d+$/ // Show has ID/S/E
    },
    urlPatterns: {
        // Must match all relevant watch pages
        movie: /\/watch\/\d+$/,
        show: /\/watch\/\d+\/\d+\/\d+$/
    },
    // --- Option B: Use a generic watch pattern if differentiation isn't possible here ---
    // urlPatterns: {
    //     movie: /^\/watch\/\d+/, // Generic pattern covering both
    //     show: /^\/watch\/\d+/   // Same pattern
    // },

    selectors: {
        movie: { title: '', year: '' }, // Fallback selectors (likely empty)
        show: { title: '', year: '' }
    }

    // No getTitle/getYear overrides needed if relying on TMDB ID
});

// getMediaType: Let the base implementation handle based on patterns above.
// If using Option B patterns, getMediaType will return 'movie' or 'show' somewhat arbitrarily,
// but the background script will fix it using the TMDB lookup.
xprimeTvConfig.getTmdbId = function (url: string): string | null {
    // Extracts the first number after /watch/
    const match = url.match(/\/watch\/(\d+)/);
    console.log(url, match);
    return match ? match[1] : null;
};

xprimeTvConfig.getSeasonEpisodeObj = function (
    url: string
): { season: number; number: number } | null {
    // Extracts S/E if present (only for shows)
    const match = url.match(/^\/watch\/\d+\/(\d+)\/(\d+)/);
    if (match && match[1] && match[2]) {
        const season = parseInt(match[1], 10);
        const episode = parseInt(match[2], 10);
        if (!isNaN(season) && season >= 0 && !isNaN(episode) && episode >= 0) {
            // Allow season 0
            return { season: season, number: episode };
        }
    }
    return null; // Return null if movie or S/E not found
};
