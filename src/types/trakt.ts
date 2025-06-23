// Contains types that directly map to Trakt API request/response bodies.

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

export interface TraktSeason {
    number: number;
    title: string;
    aired: number;
    completed: number;
    episodes: TraktEpisode[];
}

export interface TraktEpisode {
    number: number;
    completed: boolean;
    last_watched_at: string | null;
}

export interface TraktHiddenSeason {
    number: number;
    ids: TraktIds;
}

export interface TraktEpisodeInfo {
    season: number;
    number: number;
    title: string;
    ids: TraktEpisodeIds;
}

export interface TraktIds {
    trakt: number;
    tvdb: number;
    tmdb: number;
}

export interface TraktEpisodeIds {
    trakt: number;
    tvdb: number;
    imdb: string | null;
    tmdb: number | null;
}

export interface ScrobbleBody {
    movie?: any;
    show?: any;
    episode?: any;
    progress: number;
}

export interface HistoryBody {
    movies?: any[];
    shows?: any[];
    seasons?: any[];
    episodes?: any[];
}

export interface TraktRating {
    rated_at: string;
    rating: number;
    type: 'movie' | 'show' | 'season' | 'episode';
}

export interface TraktComment {
    id: number;
    parent_id: number;
    created_at: string;
    updated_at: string;
    comment: string;
    spoiler: boolean;
    review: boolean;
    replies: number;
    likes: number;
    user_stats: {
        rating: number | null;
        play_count: number;
        completed_count: number;
    };
    user: {
        username: string;
        private: boolean;
        name: string;
        vip: boolean;
        vip_ep: boolean;
        ids: { slug: string };
    };
}
