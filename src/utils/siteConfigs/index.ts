import { SiteConfigBase } from './baseConfig';
import { cinebyConfig } from './cineby';
import { freekConfig } from './freek';

export type SiteConfigMap = Record<string, SiteConfigBase>;

// Export all configs
export const siteConfigs: SiteConfigMap = {
    'www.cineby.app': cinebyConfig,
    'freek.to': freekConfig
};

// Helper to get config for current site
export const getCurrentSiteConfig = (hostname: string) => {
    return siteConfigs[hostname] || null;
};
