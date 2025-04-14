import React, { useEffect, useRef, useState } from 'react';
import { getCurrentSiteConfig } from '../utils/siteConfigs';
import { SiteConfigBase } from '../utils/siteConfigs/baseConfig';
import {
    MediaInfoRequest,
    MediaInfoResponse,
    MessageResponse,
    ScrobbleNotificationMediaType,
    ScrobbleRequest,
    ScrobbleResponse,
    UndoScrobbleRequest
} from '../utils/types';
import { ScrobbleNotification } from './ScrobbleNotification';

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

        if (siteConfig.isShowPage(url)) {
            const seasonEpisode = siteConfig.getSeasonEpisodeObj(url);
            if (seasonEpisode) {
                mediaInfo = {
                    ...mediaInfo,
                    ...seasonEpisode
                };
            }
        }

        return mediaInfo;
    } catch (error) {
        console.error('Error getMediaInfo', error);
        return null;
    }
}

function scrobbleMedia(
    progress?: number
): Promise<MessageResponse<ScrobbleResponse>> {
    return chrome.runtime
        .sendMessage<ScrobbleRequest, MessageResponse<ScrobbleResponse>>({
            action: 'scrobble',
            params: {
                progress: progress || 100
            }
        })
        .then((resp) => {
            if (!resp.success) {
                console.error('Error sending scrobble:', resp.error);
                return resp;
            }

            console.log('Scrobble response:', resp.data);
            if (!resp.data) return resp;

            return resp;
        })
        .catch((err: Error) => {
            console.error('Error sending scrobble:', err);
            return { success: false, error: err.message };
        });
}

function undoScrobbleMedia(
    historyId: number
): Promise<MessageResponse<unknown>> {
    return chrome.runtime
        .sendMessage<UndoScrobbleRequest, MessageResponse<unknown>>({
            action: 'undoScrobble',
            params: {
                historyId: historyId
            }
        })
        .then((resp: MessageResponse<unknown>) => {
            if (resp.success) {
                console.log('Undo scrobble response:', resp);
            } else {
                console.error('Error undoing scrobble:', resp.error);
            }
            return resp;
        })
        .catch((err: Error) => {
            console.error('Error undoing scrobble:', err);
            return { success: false, error: err.message };
        });
}

export const ScrobbleManager = () => {
    const [pageChanged, setPageChanged] = useState(false);
    const [mediaInfo, setMediaInfo] = useState<
        MediaInfoResponse | null | undefined
    >(null);
    const [isScrobbled, setIsScrobbled] = useState(false);

    const traktHistoryIdRef = useRef<number | null>(null);
    const oldTitle = useRef<string | null>(null);
    const undoPressed = useRef(false);

    const url = window.location.href;
    const urlObject = new URL(url);
    const hostname = urlObject.hostname;
    const siteConfig = getCurrentSiteConfig(hostname);
    const isWatchPage = siteConfig.isWatchPage(url);

    const handleScrobble = async () => {
        const scrobbleResponse = await scrobbleMedia();
        const traktHistoryId = scrobbleResponse.data?.traktHistoryId;
        if (traktHistoryId) {
            traktHistoryIdRef.current = traktHistoryId;
            setIsScrobbled(true);
        }
    };

    const handleUndoScrobble = async () => {
        if (!traktHistoryIdRef.current) return;
        const response = await undoScrobbleMedia(traktHistoryIdRef.current);
        if (response.success) {
            setIsScrobbled(false);
            traktHistoryIdRef.current = null;
            undoPressed.current = true;
        }
    };

    useEffect(() => {
        if (isScrobbled || undoPressed.current) return;

        const monitorVideoInterval = window.setInterval(() => {
            try {
                const video = document.querySelector('video');
                if (!video) return;

                const watchPercentage =
                    (video.currentTime / video.duration) * 100;

                if (watchPercentage >= 80) {
                    handleScrobble();
                    window.clearInterval(monitorVideoInterval);
                }
            } catch (error) {
                console.error('Error in video monitoring:', error);
            }
        }, 1000);

        return () => {
            window.clearInterval(monitorVideoInterval);
        };
    }, [isScrobbled, handleScrobble]);

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

            if (newMediaInfo) {
                if ('show' in newMediaInfo) {
                    oldTitle.current = newMediaInfo.show.title;
                } else if ('movie' in newMediaInfo) {
                    oldTitle.current = newMediaInfo.movie.title;
                }
            }

            setPageChanged(false);
        }

        if ((pageChanged && isWatchPage) || (isWatchPage && !mediaInfo)) {
            undoPressed.current = false;
            setIsScrobbled(false);

            if (hostname === 'www.cineby.app') {
                if (
                    document.title === 'Cineby' ||
                    document.title === oldTitle.current
                ) {
                    const waitCinebyTitleInterval = window.setInterval(() => {
                        if (document.title !== 'Cineby') {
                            clearInterval(waitCinebyTitleInterval);
                            changeMediaInfo();
                        }
                    }, 1000);
                    setTimeout(() => {
                        clearInterval(waitCinebyTitleInterval);
                    }, 5000);
                }

                if (siteConfig.isShowPage(url) && mediaInfo) {
                    const seasonEpisode = siteConfig.getSeasonEpisodeObj(url);
                    setMediaInfo({
                        ...mediaInfo,
                        ...seasonEpisode
                    });
                } else {
                    changeMediaInfo();
                }
            } else {
                changeMediaInfo();
            }
        }
    }, [pageChanged, isWatchPage]);

    useEffect(() => {
        function handleIframeScrobble(event: MessageEvent) {
            const data = event.data;
            if (data && data.type === 'TMSYNC_SCROBBLE_EVENT') {
                console.log('Received scrobble event from iframe:', data);

                if (!isScrobbled) {
                    handleScrobble();
                }
            }
        }

        window.addEventListener('message', handleIframeScrobble);
        return () =>
            window.removeEventListener('message', handleIframeScrobble);
    }, []);

    if (!isWatchPage) {
        return null;
    }

    if (mediaInfo) {
        return (
            <ScrobbleNotification
                mediaInfo={mediaInfo}
                isScrobbled={isScrobbled}
                traktHistoryId={traktHistoryIdRef.current}
                onScrobble={handleScrobble}
                onUndoScrobble={handleUndoScrobble}
            />
        );
    } else {
        return null;
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
