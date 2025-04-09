import React, { useEffect, useRef, useState } from 'react';
import { getCurrentSiteConfig } from '../utils/siteConfigs';
import { SiteConfigBase } from '../utils/siteConfigs/baseConfig';
import {
    MediaInfoRequest,
    MediaInfoResponse,
    MessageResponse,
    ScrobbleNotificationMediaType
} from '../utils/types';

async function getMediaInfo(siteConfig: SiteConfigBase, url: string) {
    const urlIdentifier = siteConfig.getUrlIdentifier(url);

    async function fetchMediaInfo() {
        try {
            const title = await siteConfig.getTitle(url);
            const year = await siteConfig.getYear(url);
            const mediaType = siteConfig.getMediaType(url);

            if (!title || !year || !mediaType) {
                console.error('Title, year, or media type not found');
                return null;
            }

            return chrome.runtime
                .sendMessage<
                    MediaInfoRequest,
                    MessageResponse<MediaInfoResponse>
                >({
                    action: 'mediaInfo',
                    params: {
                        type: mediaType,
                        query: title,
                        years: year
                    }
                })
                .then((resp) => {
                    if (resp.success) {
                        console.log('Media info response:', resp.data);
                        return resp.data;
                    } else {
                        console.error('Error sending media info:', resp.error);
                        return null;
                    }
                });
        } catch (error) {
            console.error('Error getting media info:', error);
            return null;
        }
    }

    let mediaInfo: ScrobbleNotificationMediaType | null | undefined = null;

    try {
        const mediaInfoGet = await chrome.storage.local.get(urlIdentifier);
        if (urlIdentifier && mediaInfoGet[urlIdentifier]) {
            console.log(
                'Media info already stored:',
                mediaInfoGet[urlIdentifier]
            );
            mediaInfo = mediaInfoGet[urlIdentifier] as MediaInfoResponse;
        } else {
            mediaInfo = await fetchMediaInfo();
        }

        if (!mediaInfo) {
            return;
        }

        const seasonEpisode = siteConfig.getSeasonEpisodeObj(url);
        if (seasonEpisode) {
            mediaInfo = {
                ...mediaInfo,
                ...seasonEpisode
            };
        }

        return mediaInfo;
    } catch (error) {
        console.error('Error getMediaInfo', error);
        return null;
    }
}

export const ScrobbleManager = () => {
    const [pageChanged, setPageChanged] = useState(false);
    const [mediaInfo, setMediaInfo] = useState<
        MediaInfoResponse | null | undefined
    >(null);

    const url = window.location.href;
    const hostname = new URL(url).hostname;
    const siteConfig = getCurrentSiteConfig(hostname);
    const isWatchPage = siteConfig.isWatchPage(url);

    useEffect(() => {
        let lastHref = window.location.href;

        const interval = setInterval(() => {
            const currentHref = window.location.href;
            if (currentHref !== lastHref) {
                lastHref = currentHref;
                setPageChanged(true);
            } else {
                setPageChanged(false);
            }
        }, 500);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        async function changeMediaInfo() {
            const newMediaInfo = await getMediaInfo(siteConfig, url);
            setMediaInfo(newMediaInfo);
            setPageChanged(false);
        }

        if ((pageChanged && isWatchPage) || (isWatchPage && !mediaInfo)) {
            if (hostname === 'www.cineby.app' && document.title === 'Cineby') {
                const waitCinebyTitleInterval = window.setInterval(() => {
                    if (document.title !== 'Cineby') {
                        clearInterval(waitCinebyTitleInterval);
                        changeMediaInfo();
                    }
                }, 1000);
            } else {
                changeMediaInfo();
            }
        }
    }, [pageChanged, isWatchPage]);

    if (!isWatchPage) {
        return <h1>get out</h1>;
    } else {
        return <h1>{JSON.stringify(mediaInfo)}</h1>;
    }
};

/*
what will you be brother?
i see that i'm going to manage everything:
- page change
- bringing all sort of stuff to scrobblenotif:
    - the mediainfo itself
        - that means the everchanging mediainfo i'll to manage that state
    - the handler for scrobble button
    - determine if you are hidden or not -> from if mediainfo is null and shit. and mediainfo will be null every page change because of reinit.
    - manage by this component himself:
        - for undo: trakt history id and isscrobbled. undo scrobble button handler
- for the upcoming components:
    - manual search prompt / wrong entry prompt
        - what he'll manage himself:
            - searchbar and search value state.
        - mediainfo, shared state with scrobblenotif. or rather mediainfo will be handled here first just in case mediainfo is not accurate

takeaways:
- it's all about shared state. yes every component could just handle page change themselves but what does that page change joutai essentially is for? to fetch mediainfo, and mediainfo is going to be used in multiple components and they need to be in sync so it's better we delegate that function to a parent component.
*/
