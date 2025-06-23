import {
    DeleteCommentParams,
    GetCommentsParams,
    PostCommentParams,
    UpdateCommentParams
} from '../../types/messaging';
import { TraktComment } from '../../types/trakt';
import { callApi } from '../../utils/api';
import { isMovieMediaInfo, isShowMediaInfo } from '../../utils/typeGuards';

let cachedUsername: string | null = null;
async function getUsername(): Promise<string> {
    if (cachedUsername) return cachedUsername;
    const data = await chrome.storage.local.get('traktUsername');
    if (data.traktUsername) {
        cachedUsername = data.traktUsername;
        return data.traktUsername;
    }
    const settings = await callApi<any>('https://api.trakt.tv/users/settings');
    const username = settings?.user?.username;
    if (username) {
        cachedUsername = username;
        await chrome.storage.local.set({ traktUsername: username });
        return username;
    }
    throw new Error('Could not determine Trakt username.');
}

export async function handleGetComments(
    params: GetCommentsParams
): Promise<TraktComment[]> {
    const { type, mediaInfo, episodeInfo } = params;
    const username = await getUsername();
    const url = `https://api.trakt.tv/users/${username}/comments/${type}s/all`;
    const allComments = await callApi<any[]>(url);

    if (type === 'movie' && isMovieMediaInfo(mediaInfo)) {
        const id = mediaInfo.movie.ids.trakt;
        return allComments
            .filter((c) => c.movie?.ids?.trakt === id)
            .map((c) => c.comment);
    }
    if (type === 'show' && isShowMediaInfo(mediaInfo)) {
        const id = mediaInfo.show.ids.trakt;
        return allComments
            .filter((c) => c.show?.ids?.trakt === id)
            .map((c) => c.comment);
    }
    if (type === 'season' && isShowMediaInfo(mediaInfo) && episodeInfo) {
        const id = mediaInfo.show.ids.trakt;
        return allComments
            .filter(
                (c) =>
                    c.show?.ids?.trakt === id &&
                    c.season?.number === episodeInfo.season
            )
            .map((c) => c.comment);
    }
    if (type === 'episode' && isShowMediaInfo(mediaInfo) && episodeInfo) {
        const id = mediaInfo.show.ids.trakt;
        return allComments
            .filter(
                (c) =>
                    c.show?.ids?.trakt === id &&
                    c.episode?.season === episodeInfo.season &&
                    c.episode?.number === episodeInfo.number
            )
            .map((c) => c.comment);
    }
    return [];
}

export async function handlePostComment(
    params: PostCommentParams
): Promise<TraktComment> {
    const { type, mediaInfo, episodeInfo, comment, spoiler } = params;
    const body: any = { comment, spoiler };

    if (type === 'movie' && isMovieMediaInfo(mediaInfo)) {
        body.movie = { ids: mediaInfo.movie.ids };
    } else if (type === 'show' && isShowMediaInfo(mediaInfo)) {
        body.show = { ids: mediaInfo.show.ids };
    } else if (type === 'season' && isShowMediaInfo(mediaInfo) && episodeInfo) {
        const seasons = await callApi<any[]>(
            `https://api.trakt.tv/shows/${mediaInfo.show.ids.trakt}/seasons`
        );
        const seasonId = seasons.find((s) => s.number === episodeInfo.season)
            ?.ids?.trakt;
        if (!seasonId)
            throw new Error('Could not find Trakt ID for the season.');
        body.season = { ids: { trakt: seasonId } };
    } else if (
        type === 'episode' &&
        isShowMediaInfo(mediaInfo) &&
        episodeInfo
    ) {
        const epDetails = await callApi<any>(
            `https://api.trakt.tv/shows/${mediaInfo.show.ids.trakt}/seasons/${episodeInfo.season}/episodes/${episodeInfo.number}`
        );
        const episodeId = epDetails?.ids?.trakt;
        if (!episodeId)
            throw new Error('Could not find Trakt ID for the episode.');
        body.episode = { ids: { trakt: episodeId } };
    } else {
        throw new Error('Invalid media type for posting comment.');
    }
    return await callApi<TraktComment>(
        'https://api.trakt.tv/comments',
        'POST',
        body
    );
}

export async function handleUpdateComment(
    params: UpdateCommentParams
): Promise<TraktComment> {
    const { commentId, comment, spoiler } = params;
    return await callApi<TraktComment>(
        `https://api.trakt.tv/comments/${commentId}`,
        'PUT',
        { comment, spoiler }
    );
}

export async function handleDeleteComment(
    params: DeleteCommentParams
): Promise<void> {
    await callApi<void>(
        `https://api.trakt.tv/comments/${params.commentId}`,
        'DELETE'
    );
}
