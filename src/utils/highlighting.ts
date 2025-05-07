import {
    EpisodeListContextConfig,
    SiteConfigBase
} from './siteConfigs/baseConfig';

export type HighlightType =
    | 'first_watch_last'
    | 'rewatch_last'
    | 'watched_history';
interface HighlightInfo {
    season: number;
    episode: number;
    type: HighlightType;
}

const observers = new Map<string, MutationObserver>();
const HIGHLIGHT_STYLE_ATTRIBUTE = 'data-tmsync-highlight-style';

const highlightStyles: Record<HighlightType, Partial<CSSStyleDeclaration>> = {
    first_watch_last: {
        border: '2px solid #3b82f6',

        boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)'
    },
    rewatch_last: {
        border: '2px solid #ef4444',

        boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)'
    },
    watched_history: {
        opacity: '0.7'
    }
};

function applyHighlightStyle(element: HTMLElement, type: HighlightType) {
    if (element.dataset.tmsyncHighlightStyle === type) {
        return;
    }

    clearHighlightStyle(element);

    const styles = highlightStyles[type];
    if (styles) {
        Object.assign(element.style, styles);

        element.dataset.tmsyncHighlightStyle = type;
    }
}

function clearHighlightStyle(element: HTMLElement) {
    const previousStyleType = element.dataset.tmsyncHighlightStyle;
    if (
        previousStyleType &&
        highlightStyles[previousStyleType as HighlightType]
    ) {
        const stylesToRemove =
            highlightStyles[previousStyleType as HighlightType];
        for (const prop in stylesToRemove) {
            element.style.removeProperty(
                prop.replace(/([A-Z])/g, '-$1').toLowerCase()
            );
        }
    }

    delete element.dataset.tmsyncHighlightStyle;
}

function highlightSingleEpisodeElement(
    element: HTMLElement,
    expectedSeason: number,
    expectedEpisode: number,
    highlightInfo: HighlightInfo | null,
    watchedEpisodes?: { season: number; number: number }[]
) {
    clearHighlightStyle(element);
    if (
        watchedEpisodes?.some(
            (ep) =>
                ep.season === expectedSeason && ep.number === expectedEpisode
        )
    ) {
        if (
            !highlightInfo ||
            highlightInfo.season !== expectedSeason ||
            highlightInfo.episode !== expectedEpisode
        ) {
            applyHighlightStyle(element, 'watched_history');
        }
    }

    if (
        highlightInfo &&
        expectedSeason === highlightInfo.season &&
        expectedEpisode === highlightInfo.episode
    ) {
        applyHighlightStyle(element, highlightInfo.type);
    }
}

function processContainerWithConfig(
    containerElement: Element,
    contextConfig: EpisodeListContextConfig,
    highlightInfo: HighlightInfo | null,
    watchedEpisodes?: { season: number; number: number }[]
) {
    console.log(
        `Processing container with config for selector: ${contextConfig.itemSelector}`,
        containerElement
    );
    const items = containerElement.querySelectorAll(contextConfig.itemSelector);
    items.forEach((itemEl) => {
        const se = contextConfig.getSeasonEpisodeFromElement(
            itemEl,
            containerElement
        );
        if (se) {
            const elementToStyle = contextConfig.getElementToStyle(itemEl);
            if (elementToStyle) {
                highlightSingleEpisodeElement(
                    elementToStyle,
                    se.season,
                    se.episode,
                    highlightInfo,
                    watchedEpisodes
                );
            }
        }
    });
}

export function setupEpisodeHighlighting(
    siteConfig: SiteConfigBase,
    highlightInfo: HighlightInfo | null,
    watchedEpisodes?: { season: number; number: number }[]
) {
    if (
        !siteConfig.highlighting?.getCurrentHighlightContextKey ||
        !siteConfig.highlighting.contexts
    ) {
        console.warn(
            `Highlighting not fully configured for site: ${siteConfig.name}`
        );
        return;
    }

    const currentContextKey =
        siteConfig.highlighting.getCurrentHighlightContextKey(
            window.location.href
        );
    if (!currentContextKey) {
        console.log(
            `No active highlighting context for current URL on ${siteConfig.name}.`
        );

        clearHighlighting(siteConfig.name, null);
        return;
    }

    const contextConfig = siteConfig.highlighting.contexts[currentContextKey];
    if (!contextConfig) {
        console.warn(
            `Highlighting context '${currentContextKey}' not found in config for ${siteConfig.name}.`
        );
        return;
    }

    const observerKey = `${siteConfig.name}-hl-observer-${currentContextKey}`;

    if (observers.has(observerKey)) {
        observers.get(observerKey)?.disconnect();
    }

    const callback: MutationCallback = (mutationsList, observer) => {
        const containersToReProcess = new Set<Element>();

        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                if (
                    mutation.target instanceof Element &&
                    mutation.target.matches(contextConfig.containerSelector)
                ) {
                    containersToReProcess.add(mutation.target);
                }

                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const addedElement = node as Element;

                        if (addedElement.matches(contextConfig.itemSelector)) {
                            const parentContainer = addedElement.closest(
                                contextConfig.containerSelector
                            );
                            if (parentContainer) {
                                containersToReProcess.add(parentContainer);
                            } else {
                                console.warn(
                                    `Individual item '${contextConfig.itemSelector}' added, but its direct container ` +
                                        `'${contextConfig.containerSelector}' not found via .closest(). Skipping individual fallback highlight for this item.`
                                );
                            }
                        } else if (
                            addedElement.matches(
                                contextConfig.containerSelector
                            )
                        ) {
                            containersToReProcess.add(addedElement);
                        } else if (
                            addedElement.querySelector(
                                contextConfig.containerSelector
                            )
                        ) {
                            containersToReProcess.add(
                                addedElement.querySelector(
                                    contextConfig.containerSelector
                                )!
                            );
                        }
                    }
                }
            } else if (mutation.type === 'attributes') {
                if (mutation.target instanceof Element) {
                    const mutatedElement = mutation.target;

                    if (
                        mutatedElement.matches(contextConfig.containerSelector)
                    ) {
                        containersToReProcess.add(mutatedElement);
                    } else if (
                        mutatedElement.matches(contextConfig.itemSelector)
                    ) {
                        const parentContainer = mutatedElement.closest(
                            contextConfig.containerSelector
                        );
                        if (parentContainer) {
                            containersToReProcess.add(parentContainer);
                        }
                    }
                }
            }
        }

        if (containersToReProcess.size > 0) {
            containersToReProcess.forEach((container) => {
                processContainerWithConfig(
                    container,
                    contextConfig,
                    highlightInfo,
                    watchedEpisodes
                );
            });
        }
    };

    const obs = new MutationObserver(callback);
    obs.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });
    observers.set(observerKey, obs);
    console.log(
        `MutationObserver for ${siteConfig.name} (context: ${currentContextKey}) set up.`
    );

    const initialContainer = document.querySelector(
        contextConfig.containerSelector
    );
    if (initialContainer) {
        console.log(`Initial scan: Found container for ${currentContextKey}.`);
        processContainerWithConfig(
            initialContainer,
            contextConfig,
            highlightInfo,
            watchedEpisodes
        );
    }
}

export function clearHighlighting(siteName: string, contextKey: string | null) {
    const keyToClear = contextKey
        ? `${siteName}-hl-observer-${contextKey}`
        : null;

    if (keyToClear && observers.has(keyToClear)) {
        observers.get(keyToClear)?.disconnect();
        observers.delete(keyToClear);
        console.log(
            `Highlighting observer stopped for ${siteName} context ${contextKey}`
        );
    } else if (!contextKey) {
        observers.forEach((observer, key) => {
            if (key.startsWith(`${siteName}-hl-observer-`)) {
                observer.disconnect();
                observers.delete(key);
            }
        });
        console.log(`All highlighting observers stopped for ${siteName}`);
    }

    document
        .querySelectorAll(`[data-${HIGHLIGHT_STYLE_ATTRIBUTE.substring(5)}]`)
        .forEach((el) => clearHighlightStyle(el as HTMLElement));
}
