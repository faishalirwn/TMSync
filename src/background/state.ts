import { ActiveScrobbleState } from '../utils/types';

const initialState: ActiveScrobbleState = {
    tabId: null,
    mediaInfo: null,
    episodeInfo: undefined,
    currentProgress: 0,
    status: 'idle',
    traktMediaType: null,
    lastUpdateTime: 0,
    previousScrobbledUrl: ''
};

export const scrobbleState = {
    current: { ...initialState }
};

export function resetActiveScrobbleState() {
    scrobbleState.current = { ...initialState };
    console.log('Active scrobble state reset.');
}
