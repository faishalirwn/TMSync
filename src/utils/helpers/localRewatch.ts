const REWATCH_STORAGE_KEY = 'tmsync_rewatch_progress';

export type LocalRewatchInfo = {
    lastWatched: { season: number; number: number; timestamp: number };

    nextExpected?: { season: number; number: number } | null;
};
export type LocalRewatchProgressStorage = {
    [traktShowId: number]: LocalRewatchInfo;
};

export async function getLocalRewatchInfo(
    showId: number
): Promise<LocalRewatchInfo | null> {
    try {
        const data = await chrome.storage.local.get(REWATCH_STORAGE_KEY);
        const allProgress: LocalRewatchProgressStorage =
            data[REWATCH_STORAGE_KEY] || {};
        return allProgress[showId] || null;
    } catch (error) {
        console.error('Error getting local rewatch info:', error);
        return null;
    }
}

export async function saveLocalRewatchInfo(
    showId: number,
    watchedSeason: number,
    watchedEpisode: number
): Promise<void> {
    try {
        const data = await chrome.storage.local.get(REWATCH_STORAGE_KEY);
        const allProgress: LocalRewatchProgressStorage =
            data[REWATCH_STORAGE_KEY] || {};

        let nextExpected: { season: number; number: number } | null = {
            season: watchedSeason,
            number: watchedEpisode + 1
        };

        allProgress[showId] = {
            lastWatched: {
                season: watchedSeason,
                number: watchedEpisode,
                timestamp: Date.now()
            },
            nextExpected: nextExpected
        };
        await chrome.storage.local.set({ [REWATCH_STORAGE_KEY]: allProgress });
        console.log(
            `Saved local rewatch info for ${showId}: Last S${watchedSeason}E${watchedEpisode}, Next S${nextExpected.season}E${nextExpected.number}`
        );
    } catch (error) {
        console.error('Error saving local rewatch info:', error);
    }
}
