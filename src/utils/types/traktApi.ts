export interface TraktShowWatchedProgress {
    aired: number;
    completed: number;
    last_watched_at: string;
    reset_at: string | null;
    seasons: TraktSeason[];
    hidden_seasons: TraktHiddenSeason[];
    next_episode: TraktEpisodeInfo | null;
    last_episode: TraktEpisodeInfo | null;
}

interface TraktSeason {
    number: number;
    title: string;
    aired: number;
    completed: number;
    episodes: TraktEpisode[];
}

interface TraktEpisode {
    number: number;
    completed: boolean;
    last_watched_at: string | null;
}

interface TraktHiddenSeason {
    number: number;
    ids: TraktIds;
}

interface TraktEpisodeInfo {
    season: number;
    number: number;
    title: string;
    ids: TraktEpisodeIds;
}

interface TraktIds {
    trakt: number;
    tvdb: number;
    tmdb: number;
}

interface TraktEpisodeIds {
    trakt: number;
    tvdb: number;
    imdb: string | null;
    tmdb: number | null;
}

/**
 * Parameters for the "Get show watched progress" endpoint
 */
interface TraktShowWatchedProgressParams {
    /**
     * Include hidden seasons in the response and adjust completion stats
     * @default false
     */
    hidden?: boolean;

    /**
     * Include specials (season 0) in the response
     * @default false
     */
    specials?: boolean;

    /**
     * Adjust stats to count specials (only relevant when specials=true)
     * @default true
     */
    count_specials?: boolean;

    /**
     * Method to determine last_episode and next_episode
     * "aired": Use the last aired episode the user watched (default)
     * "watched": Use the user's last watched episode regardless of air date
     * @default "aired"
     */
    last_activity?: 'aired' | 'watched';
}
