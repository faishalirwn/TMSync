import React, { useRef, useState } from 'react';

// async function getMediaInfo(): Promise<MediaInfoResponse | null | undefined> {
async function getMediaInfo() {
    // if (!siteConfig) return null;

    // try {
    //     const title = await siteConfig.getTitle(url);
    //     const year = await siteConfig.getYear(url);
    //     const mediaType = siteConfig.getMediaType(url);

    //     if (!title || !year || !mediaType) {
    //         console.error('Title, year, or media type not found');
    //         return null;
    //     }

    //     return chrome.runtime
    //         .sendMessage<MediaInfoRequest, MessageResponse<MediaInfoResponse>>({
    //             action: 'mediaInfo',
    //             params: {
    //                 type: mediaType,
    //                 query: title,
    //                 years: year
    //             }
    //         })
    //         .then((resp) => {
    //             if (resp.success) {
    //                 console.log('Media info response:', resp.data);
    //                 return resp.data;
    //             } else {
    //                 console.error('Error sending media info:', resp.error);
    //                 return null;
    //             }
    //         });
    // } catch (error) {
    //     console.error('Error getting media info:', error);
    //     return null;
    // }
    return {
        lol: 'waw'
    };
}

export const ScrobbleManager = () => {
    const [pageChanged, setPageChanged] = useState(false);
    const [mediaInfo, setMediaInfo] = useState({});

    const isWatchPage = true;

    const pageUrl = useRef(window.location.href);
    if (window.location.href !== pageUrl.current) {
        alert('wow');
        setPageChanged(true);
    }

    if (pageChanged || isWatchPage) {
        const mediaInfo = getMediaInfo();
        setMediaInfo(mediaInfo);
    }

    if (!mediaInfo) {
        return null;
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
