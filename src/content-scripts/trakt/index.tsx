import React, { useEffect, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import '../../styles/index.css';
import { siteConfigs } from '../../utils/siteConfigs';
import { SiteConfigBase } from '../../utils/siteConfigs/baseConfig';
import { UserQuickLinkPrefs } from '../../options';

export interface TraktPageInfo {
    type: 'movie' | 'show';
    traktSlug?: string;
    tmdbId?: string;
    traktId?: number;
    title?: string;
    year?: number;
    season?: number;
    episode?: number;
}

interface QuickLinkConfig {
    siteKey: string;
    name: string;
    logoUrl?: string;
    enabled: boolean;
    order: number;
    generateLink: (
        info: TraktPageInfo,
        siteSpecificConfig: SiteConfigBase
    ) => string | null;
}

function getTraktPageInfo(): TraktPageInfo | null {
    const path = window.location.pathname.split('/');
    let info: Partial<TraktPageInfo> = {};

    const tmdbLinkElement = document.getElementById(
        'external-link-tmdb'
    ) as HTMLAnchorElement;
    if (tmdbLinkElement && tmdbLinkElement.href) {
        const tmdbUrl = new URL(tmdbLinkElement.href);
        const tmdbPathParts = tmdbUrl.pathname.split('/');
        if (tmdbPathParts.length >= 3) {
            info.tmdbId = tmdbPathParts[2];
        }
    }

    const titleElement = document.querySelector('h1[itemprop="name"]');
    if (titleElement) {
        info.title = titleElement.textContent?.trim() || undefined;
        const yearElement = titleElement.querySelector('span.year');
        if (yearElement?.textContent) {
            info.year = parseInt(yearElement.textContent, 10) || undefined;
        }
    }

    if (path[1] === 'shows') {
        info.type = 'show';
        info.traktSlug = path[2];
        if (path[3] === 'seasons' && path[4]) {
            info.season = parseInt(path[4], 10);
            if (path[5] === 'episodes' && path[6]) {
                info.episode = parseInt(path[6], 10);
            }
        }
    } else if (path[1] === 'movies') {
        info.type = 'movie';
        info.traktSlug = path[2];
    } else {
        return null;
    }

    if (!info.type || (!info.tmdbId && !info.traktSlug)) return null;

    return info as TraktPageInfo;
}

function generateSiteLink(
    pageInfo: TraktPageInfo,
    siteKey: string,
    config: SiteConfigBase
): string | null {
    if (config.generateWatchLink) {
        return config.generateWatchLink(pageInfo);
    }

    return null;
}

const QuickLinksInjector: React.FC<{
    pageInfo: TraktPageInfo;
    storedLinkPrefs: UserQuickLinkPrefs | null;
}> = ({ pageInfo, storedLinkPrefs }) => {
    const [quickLinks, setQuickLinks] = useState<QuickLinkConfig[]>([]);

    useEffect(() => {
        const enabledLinks: QuickLinkConfig[] = [];
        const defaultOrder = Object.keys(siteConfigs).length;

        for (const siteKey in siteConfigs) {
            const config = siteConfigs[siteKey];
            const userPref = storedLinkPrefs?.[siteKey];

            if (userPref?.enabled ?? true) {
                const link = generateSiteLink(pageInfo, siteKey, config);
                if (link) {
                    enabledLinks.push({
                        siteKey: siteKey,
                        name: config.name,

                        logoUrl: chrome.runtime.getURL(
                            `images/logos/${siteKey.toLowerCase()}.png`
                        ),
                        enabled: true,
                        order: userPref?.order ?? defaultOrder,
                        generateLink: (info, cfg) =>
                            generateSiteLink(info, siteKey, cfg)
                    });
                }
            }
        }
        enabledLinks.sort((a, b) => a.order - b.order);
        setQuickLinks(enabledLinks);
    }, [pageInfo, storedLinkPrefs]);

    if (quickLinks.length === 0) {
        return null;
    }

    return (
        <div className="tmsync-quicklinks-container mt-2 flex flex-wrap gap-2 items-center border-t border-gray-700 pt-2">
            {quickLinks.map((linkConfig) => (
                <a
                    key={linkConfig.siteKey}
                    href={
                        linkConfig.generateLink(
                            pageInfo,
                            siteConfigs[linkConfig.siteKey]
                        )!
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Watch on ${linkConfig.name}`}
                    className="flex items-center justify-center h-15 w-15 p-1 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors overflow-hidden group"
                >
                    <img
                        src={linkConfig.logoUrl}
                        alt={`${linkConfig.name} logo`}
                        className="block max-h-full max-w-full object-contain transition-transform duration-200 group-hover:scale-110"
                        onError={(e) => {
                            (e.target as HTMLImageElement).classList.add(
                                'hidden'
                            );
                        }}
                    />
                </a>
            ))}
        </div>
    );
};

async function injectQuickLinks() {
    const watchNowButton = document.querySelector('a.btn-watch-now');
    const sidebar = document.querySelector('div.sidebar.posters');
    let injectionTarget: Element | null = null;
    let injectionMethod: 'after' | 'prepend' = 'after';

    if (watchNowButton) {
        injectionTarget = watchNowButton;
        injectionMethod = 'after';
    } else if (sidebar) {
        injectionTarget = sidebar;
        injectionMethod = 'prepend';
    } else {
        console.error('TMSync: Could not find injection point.');
        return;
    }

    const pageInfo = getTraktPageInfo();
    if (!pageInfo) return;
    const prefs = await chrome.storage.sync.get(['quickLinkPreferences']);
    const storedLinkPrefs =
        prefs.quickLinkPreferences as UserQuickLinkPrefs | null;

    const injectorId = 'tmsync-quicklinks-injector';
    let injectorHost = document.getElementById(
        injectorId
    ) as HTMLElement | null;
    let shadowRoot: ShadowRoot | null = null;
    let reactRoot: Root | null = null;

    if (!injectorHost) {
        console.log('TMSync: Creating injector host and shadow root.');
        injectorHost = document.createElement('div');
        injectorHost.id = injectorId;
        injectorHost.className = 'tmsync-quicklinks-host mt-3 mb-3';

        shadowRoot = injectorHost.attachShadow({ mode: 'open' });

        if (injectionMethod === 'after' && injectionTarget?.parentNode) {
            injectionTarget.parentNode.insertBefore(
                injectorHost,
                injectionTarget.nextSibling
            );
        } else if (injectionMethod === 'prepend' && injectionTarget) {
            injectionTarget.insertBefore(
                injectorHost,
                injectionTarget.firstChild
            );
        } else {
            console.error('TMSync: Could not inject host element.');
            return;
        }

        try {
            const cssUrl = chrome.runtime.getURL('css/styles.css');
            console.log('TMSync: Loading CSS:', cssUrl);
            const response = await fetch(cssUrl);
            if (!response.ok)
                throw new Error(`CSS fetch failed: ${response.statusText}`);
            const cssText = await response.text();
            const sheet = new CSSStyleSheet();
            await sheet.replace(cssText);
            shadowRoot.adoptedStyleSheets = [sheet];
            console.log('TMSync: CSS loaded into Shadow DOM.');
        } catch (error) {
            console.error('TMSync: Failed to load CSS into Shadow DOM:', error);
        }

        const reactContainer = document.createElement('div');
        reactContainer.id = 'react-root';
        shadowRoot.appendChild(reactContainer);
        reactRoot = createRoot(reactContainer);
    } else {
        shadowRoot = injectorHost.shadowRoot;
        const reactContainer = shadowRoot?.getElementById('react-root');
        if (reactContainer) {
            reactRoot = createRoot(reactContainer);
        } else {
            console.error(
                "TMSync: Found host but couldn't find react-root inside shadowRoot."
            );
            return;
        }
        console.log('TMSync: Injector host already exists.');
    }

    if (reactRoot) {
        reactRoot.render(
            <QuickLinksInjector
                pageInfo={pageInfo}
                storedLinkPrefs={storedLinkPrefs}
            />
        );
        console.log('TMSync: Quick links component rendered into Shadow DOM.');
    } else {
        console.error('TMSync: Failed to obtain React root instance.');
    }
}

const observer = new MutationObserver((mutations, obs) => {
    const watchNowButton = document.querySelector('a.btn-watch-now');
    const sidebar = document.querySelector('div.sidebar.posters');
    const tmdbLink = document.getElementById('external-link-tmdb');

    if ((watchNowButton || sidebar) && tmdbLink) {
        console.log('TMSync: Required elements found, injecting quick links.');
        injectQuickLinks();
        obs.disconnect();
    }
});

observer.observe(document.body, { childList: true, subtree: true });

const initialWatchNowButton = document.querySelector('a.btn-watch-now');
const initialSidebar = document.querySelector('div.sidebar.posters');
const initialTmdbLink = document.getElementById('external-link-tmdb');
if ((initialWatchNowButton || initialSidebar) && initialTmdbLink) {
    injectQuickLinks();
    observer.disconnect();
}
