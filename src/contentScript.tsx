import './styles/index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from 'react-dom/client';
import { ScrobbleManager } from './components/ScrobbleManager';

let url = location.href;
let urlObj = new URL(url);
let hostname = urlObj.hostname;

const isIframe = window.self !== window.top;
let reactRoot: Root | null = null;

function startVideoMonitoring(): number {
    let isWatched = false;
    console.log('Initiate Video progress monitoring', hostname);

    const monitorVideoInterval = window.setInterval(() => {
        try {
            const video = document.querySelector('video');
            if (!video) {
                return;
            }

            const watchPercentage = (video.currentTime / video.duration) * 100;

            if (watchPercentage >= 80 && !isWatched) {
                console.log('Watch percentage:', watchPercentage);
                isWatched = true;

                window.clearInterval(monitorVideoInterval);

                window.top?.postMessage(
                    {
                        type: 'TMSYNC_SCROBBLE_EVENT'
                    },
                    '*'
                );
            }
        } catch (error) {
            console.error('Error in video monitoring:', error);
        }
    }, 1000);

    return monitorVideoInterval;
}

function injectReactApp(): void {
    // Create container if it doesn't exist
    let container = document.getElementById('tmsync-container');
    let shadow = container?.shadowRoot;

    if (!container) {
        const body = document.querySelector('body');
        container = document.createElement('div');
        container.id = 'tmsync-container';

        shadow = container.attachShadow({
            mode: 'open'
        });

        // Setup the style
        container.style.all = 'initial'; // Reset all inherited styles

        async function createStyle() {
            try {
                const cssUrl = chrome.runtime.getURL('css/styles.css');

                const response = await fetch(cssUrl);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const mainCSS = await response.text();

                const sheet = new CSSStyleSheet();
                sheet.replaceSync(mainCSS);

                if (shadow) {
                    shadow.adoptedStyleSheets = [sheet];
                }
            } catch (error) {
                console.error('Failed to load CSS:', error);
            }
        }

        createStyle();

        if (body) {
            body.append(container);
        }
    }

    if (!reactRoot && shadow) {
        reactRoot = createRoot(shadow);
    }

    if (reactRoot) {
        reactRoot.render(<ScrobbleManager />);
    }
}

async function initialize() {
    if (isIframe) {
        startVideoMonitoring();
    } else {
        injectReactApp();
    }
}

initialize();
