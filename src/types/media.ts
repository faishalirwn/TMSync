// Defines the core media-related types used throughout the application.

export interface MovieMediaInfo {
    type: 'movie';
    score: number;
    movie: {
        title: string;
        year: number;
        ids: {
            trakt: number;
            slug: string;
            imdb: string;
            tmdb: number;
        };
    };
}

export interface ShowMediaInfo {
    type: 'show';
    score: number;
    show: {
        title: string;
        year: number;
        ids: {
            trakt: number;
            slug: string;
            tvdb: number;
            imdb: string;
            tmdb: number;
        };
    };
}

export type MediaInfoResponse = MovieMediaInfo | ShowMediaInfo;

export type ScoredMediaInfo = MediaInfoResponse & {
    confidenceScore: number;
};

export interface IndividualRating {
    userRating: number | null;
    ratedAt?: string;
}

export interface MediaRatings {
    show?: IndividualRating;
    season?: IndividualRating;
    episode?: IndividualRating;
}

export interface SeasonEpisodeObj {
    season: number;
    number: number;
}

export type CommentableType = 'movie' | 'show' | 'season' | 'episode';
