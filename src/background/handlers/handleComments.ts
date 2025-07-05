import {
    DeleteCommentParams,
    GetCommentsParams,
    PostCommentParams,
    UpdateCommentParams
} from '../../types/messaging';
import { ServiceComment } from '../../types/serviceTypes';
import { traktService } from '../../services/TraktService';

export async function handleGetComments(
    params: GetCommentsParams
): Promise<ServiceComment[]> {
    const { type, mediaInfo, episodeInfo } = params;
    return await traktService.getComments(type, mediaInfo, episodeInfo);
}

export async function handlePostComment(
    params: PostCommentParams
): Promise<ServiceComment> {
    const { type, mediaInfo, episodeInfo, comment, spoiler } = params;
    return await traktService.postComment(
        type,
        mediaInfo,
        comment,
        spoiler,
        episodeInfo
    );
}

export async function handleUpdateComment(
    params: UpdateCommentParams
): Promise<ServiceComment> {
    const { commentId, comment, spoiler } = params;
    return await traktService.updateComment(commentId, comment, spoiler);
}

export async function handleDeleteComment(
    params: DeleteCommentParams
): Promise<void> {
    await traktService.deleteComment(params.commentId);
}
