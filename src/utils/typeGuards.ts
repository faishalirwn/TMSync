import { MediaInfoResponse, MovieMediaInfo, ShowMediaInfo } from './types';

export function isMovieMediaInfo(
    media: MediaInfoResponse | null | undefined
): media is MovieMediaInfo {
    return (
        !!media && media.type === 'movie' && 'movie' in media && !!media.movie
    );
}

export function isShowMediaInfo(
    media: MediaInfoResponse | null | undefined
): media is ShowMediaInfo {
    return !!media && media.type === 'show' && 'show' in media && !!media.show;
}
