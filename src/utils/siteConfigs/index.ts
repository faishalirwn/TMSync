import { SiteConfigBase } from './baseConfig';
import { cinebyConfig } from './cineby';
import { freekConfig } from './freek';
import { hydraConfig } from './hydra';

export type SiteConfigMap = Record<string, SiteConfigBase>;

// Export all configs
export const siteConfigs: SiteConfigMap = {
    'www.cineby.app': cinebyConfig,
    'freek.to': freekConfig,
    'hydrahd.me': hydraConfig,
    'hydrahd.ac': hydraConfig
};

// Helper to get config for current site
export const getCurrentSiteConfig = (hostname: string) => {
    return siteConfigs[hostname] || null;
};
