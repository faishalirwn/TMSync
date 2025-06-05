import './styles/index.css';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ScrobbleManager } from './components/ScrobbleManager';

const isIframe = window.self !== window.top;
let reactRoot: Root | null = null;
let videoMonitorIntervalId: number | null = null;
let iframeVideoEl: HTMLVideoElement | null = null;
let iframeTimeUpdateThrottleTimer: number | null = null;

const IFRAME_VIDEO_PROGRESS_UPDATE_THROTTLE_MS = 2000;

function handleIframePlay(event: Event) {
    const video = event.target as HTMLVideoElement;
    if (!video || isNaN(video.duration) || video.duration === 0) return;
    console.log('TMSync Iframe: Play event', {
        currentTime: video.currentTime,
        duration: video.duration
    });
    window.top?.postMessage(
        {
            type: 'TMSYNC_IFRAME_PLAY',
            currentTime: video.currentTime,
            duration: video.duration,
            sourceId: 'tmsync-iframe-player'
        },
        '*'
    );
}

function handleIframePause(event: Event) {
    const video = event.target as HTMLVideoElement;
    if (!video || isNaN(video.duration) || video.duration === 0) return;
    console.log('TMSync Iframe: Pause event', {
        currentTime: video.currentTime,
        duration: video.duration
    });
    window.top?.postMessage(
        {
            type: 'TMSYNC_IFRAME_PAUSE',
            currentTime: video.currentTime,
            duration: video.duration,
            sourceId: 'tmsync-iframe-player'
        },
        '*'
    );
}

function handleIframeEnded(event: Event) {
    const video = event.target as HTMLVideoElement;
    if (!video || isNaN(video.duration) || video.duration === 0) return;
    console.log('TMSync Iframe: Ended event', {
        currentTime: video.currentTime,
        duration: video.duration
    });
    window.top?.postMessage(
        {
            type: 'TMSYNC_IFRAME_ENDED',
            currentTime: video.duration,
            duration: video.duration,
            sourceId: 'tmsync-iframe-player'
        },
        '*'
    );
}

function handleIframeTimeUpdate(event: Event) {
    const video = event.target as HTMLVideoElement;
    if (!video || video.paused || isNaN(video.duration) || video.duration === 0)
        return;

    if (iframeTimeUpdateThrottleTimer) {
        clearTimeout(iframeTimeUpdateThrottleTimer);
    }

    iframeTimeUpdateThrottleTimer = window.setTimeout(() => {
        if (
            !video ||
            video.paused ||
            isNaN(video.duration) ||
            video.duration === 0
        )
            return;
        console.log('TMSync Iframe: TimeUpdate event (throttled)', {
            currentTime: video.currentTime,
            duration: video.duration
        });
        window.top?.postMessage(
            {
                type: 'TMSYNC_IFRAME_TIMEUPDATE',
                currentTime: video.currentTime,
                duration: video.duration,
                sourceId: 'tmsync-iframe-player'
            },
            '*'
        );
    }, IFRAME_VIDEO_PROGRESS_UPDATE_THROTTLE_MS);
}

function attachIframeVideoListeners(videoElement: HTMLVideoElement) {
    iframeVideoEl = videoElement;
    console.log(
        'TMSync Iframe: Attaching listeners to video element:',
        videoElement
    );
    videoElement.addEventListener('play', handleIframePlay);
    videoElement.addEventListener('pause', handleIframePause);
    videoElement.addEventListener('ended', handleIframeEnded);
    videoElement.addEventListener('timeupdate', handleIframeTimeUpdate);

    if (
        !videoElement.paused &&
        videoElement.duration > 0 &&
        videoElement.currentTime > 0
    ) {
        console.log(
            'TMSync Iframe: Video already playing, sending initial play event.'
        );

        window.top?.postMessage(
            {
                type: 'TMSYNC_IFRAME_PLAY',
                currentTime: videoElement.currentTime,
                duration: videoElement.duration,
                sourceId: 'tmsync-iframe-player'
            },
            '*'
        );
    }
}

function detachIframeVideoListeners() {
    if (iframeVideoEl) {
        console.log('TMSync Iframe: Detaching listeners from video element.');
        iframeVideoEl.removeEventListener('play', handleIframePlay);
        iframeVideoEl.removeEventListener('pause', handleIframePause);
        iframeVideoEl.removeEventListener('ended', handleIframeEnded);
        iframeVideoEl.removeEventListener('timeupdate', handleIframeTimeUpdate);
        if (iframeTimeUpdateThrottleTimer) {
            clearTimeout(iframeTimeUpdateThrottleTimer);
        }
        iframeVideoEl = null;
    }
}

function startIframeVideoMonitoring() {
    const videoElement = document.querySelector('video');
    if (videoElement) {
        attachIframeVideoListeners(videoElement);
    } else {
        let attempts = 0;
        const findVideoInterval = setInterval(() => {
            attempts++;
            const vEl = document.querySelector('video');
            if (vEl) {
                clearInterval(findVideoInterval);
                attachIframeVideoListeners(vEl);
            } else if (attempts > 20) {
                clearInterval(findVideoInterval);
                console.warn(
                    'TMSync Iframe: Video element not found after multiple attempts.'
                );
            }
        }, 500);
    }

    window.addEventListener('beforeunload', () => {
        console.log('TMSync Iframe: beforeunload, detaching listeners.');
        detachIframeVideoListeners();
    });
}

function injectReactApp(): void {
    let container = document.getElementById('tmsync-container');
    let shadowRootElement: ShadowRoot | null = null;

    if (!container) {
        container = document.createElement('div');
        container.id = 'tmsync-container';

        shadowRootElement = container.attachShadow({ mode: 'open' });

        const reactAppContainer = document.createElement('div');
        reactAppContainer.id = 'tmsync-react-app-root';

        shadowRootElement.appendChild(reactAppContainer);

        const tailwindCssUrl = chrome.runtime.getURL('css/styles.css');
        fetch(tailwindCssUrl)
            .then((response) => response.text())
            .then((cssText) => {
                if (shadowRootElement) {
                    const styleEl = document.createElement('style');
                    styleEl.textContent = cssText;
                    shadowRootElement.appendChild(styleEl);
                }
            })
            .catch((err) =>
                console.error('Failed to load styles into shadow DOM', err)
            );

        document.body.appendChild(container);
    } else {
        shadowRootElement = container.shadowRoot;
    }

    const reactAppRootElement = shadowRootElement?.getElementById(
        'tmsync-react-app-root'
    );

    if (reactAppRootElement) {
        if (!reactRoot) {
            reactRoot = createRoot(reactAppRootElement);
        }
        reactRoot.render(<ScrobbleManager />);
    } else {
        console.error('TMSync: React root within shadow DOM not found!');
    }
}

async function initialize() {
    if (isIframe) {
        console.log(
            'TMSync: Running in iframe context. Initializing video event posting.'
        );

        if (videoMonitorIntervalId) {
            clearInterval(videoMonitorIntervalId);
            videoMonitorIntervalId = null;
        }
        startIframeVideoMonitoring();
    } else {
        console.log(
            'TMSync: Running in main frame context. Injecting React app.'
        );
        injectReactApp();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
