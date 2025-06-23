import { useState, useEffect, useMemo } from 'react';
import { siteConfigs } from '../utils/siteConfigs';

export interface SiteQuickLinkPreference {
    enabled: boolean;
    order: number;
}
export interface UserQuickLinkPrefs {
    [siteKey: string]: SiteQuickLinkPreference;
}

const availableSitesForQuickLinks = Object.entries(siteConfigs)
    .filter(([, config]) => !!config.generateWatchLink)
    .map(([key, config]) => ({
        key: key,
        name: config.name,
        logo: chrome.runtime.getURL(`images/logos/${key.toLowerCase()}.png`)
    }));

export function useQuickLinkPreferences(isLoggedIn: boolean) {
    const [prefs, setPrefs] = useState<UserQuickLinkPrefs>({});
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (!isLoggedIn) {
            setPrefs({});
            setIsLoading(false);
            return;
        }

        const loadPreferences = async () => {
            setIsLoading(true);
            const data = await chrome.storage.sync.get([
                'quickLinkPreferences'
            ]);
            const loadedPrefs = (data.quickLinkPreferences ||
                {}) as UserQuickLinkPrefs;
            let maxOrder = -1;

            Object.values(loadedPrefs).forEach((p) => {
                if (p && typeof p.order === 'number' && p.order > maxOrder) {
                    maxOrder = p.order;
                }
            });

            const initialPrefs: UserQuickLinkPrefs = {};
            availableSitesForQuickLinks.forEach((site, index) => {
                initialPrefs[site.key] = loadedPrefs[site.key] || {
                    enabled: true,
                    order: maxOrder + 1 + index
                };
            });
            setPrefs(initialPrefs);
            setIsLoading(false);
        };

        loadPreferences();
    }, [isLoggedIn]);

    const updatePreferences = (newPrefs: UserQuickLinkPrefs) => {
        setPrefs(newPrefs);
        chrome.storage.sync.set({ quickLinkPreferences: newPrefs });
    };

    const toggleSite = (siteKey: string) => {
        const newPrefs = {
            ...prefs,
            [siteKey]: {
                ...prefs[siteKey],
                enabled: !prefs[siteKey]?.enabled
            }
        };
        updatePreferences(newPrefs);
    };

    const moveSite = (siteKey: string, direction: 'up' | 'down') => {
        const orderedSites = availableSitesForQuickLinks
            .map((s) => ({ ...s, ...prefs[s.key] }))
            .sort((a, b) => a.order - b.order);

        const currentIndex = orderedSites.findIndex((s) => s.key === siteKey);
        if (currentIndex === -1) return;

        let newIndex = currentIndex;
        if (direction === 'up' && currentIndex > 0) newIndex = currentIndex - 1;
        if (direction === 'down' && currentIndex < orderedSites.length - 1)
            newIndex = currentIndex + 1;

        if (newIndex !== currentIndex) {
            const [movedSite] = orderedSites.splice(currentIndex, 1);
            orderedSites.splice(newIndex, 0, movedSite);

            const newPrefs: UserQuickLinkPrefs = {};
            orderedSites.forEach((site, index) => {
                newPrefs[site.key] = {
                    ...(prefs[site.key] || { enabled: true }),
                    order: index
                };
            });
            updatePreferences(newPrefs);
        }
    };

    const filteredSites = useMemo(() => {
        return availableSitesForQuickLinks
            .filter((site) =>
                site.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort(
                (a, b) =>
                    (prefs[a.key]?.order ?? 999) - (prefs[b.key]?.order ?? 999)
            );
    }, [searchTerm, prefs]);

    return {
        prefs,
        isLoading,
        searchTerm,
        setSearchTerm,
        filteredSites,
        toggleSite,
        moveSite
    };
}
