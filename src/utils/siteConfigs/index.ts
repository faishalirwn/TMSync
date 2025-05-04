import { SiteConfigBase } from './baseConfig';
import { cinebyConfig } from './cineby';
import { freekConfig } from './freek';
import { hexaWatchConfig } from './hexa';
import { hydraConfig } from './hydra';

export type SiteConfigMap = Record<string, SiteConfigBase>;

export const siteConfigs: SiteConfigMap = {
    'www.cineby.app': cinebyConfig,
    'freek.to': freekConfig,
    'hydrahd.me': hydraConfig,
    'hydrahd.ac': hydraConfig,
    'hexa.watch': hexaWatchConfig
};

export const getCurrentSiteConfig = (hostname: string) => {
    return siteConfigs[hostname] || null;
};
