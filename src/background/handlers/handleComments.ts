import {
    DeleteCommentParams,
    GetCommentsParams,
    PostCommentParams,
    UpdateCommentParams
} from '../../types/messaging';
import { ServiceComment } from '../../types/serviceTypes';
import { serviceRegistry } from '../../services/ServiceRegistry';
import { filterEnabledAuthenticatedServices } from '../../utils/serviceFiltering';

export async function handleGetComments(
    params: GetCommentsParams
): Promise<ServiceComment[]> {
    const { type, mediaInfo, episodeInfo } = params;

    const allCommentServices =
        serviceRegistry.getServicesWithCapability('supportsComments');
    const commentServices =
        await filterEnabledAuthenticatedServices(allCommentServices);

    const allComments: ServiceComment[] = [];

    for (const service of commentServices) {
        try {
            const comments = await service.getComments(
                type,
                mediaInfo,
                episodeInfo
            );
            allComments.push(...comments);
        } catch (error) {
            console.error(
                `Failed to get comments from ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }

    return allComments;
}

export async function handlePostComment(
    params: PostCommentParams
): Promise<ServiceComment> {
    const { type, mediaInfo, episodeInfo, comment, spoiler } = params;

    const allCommentServices =
        serviceRegistry.getServicesWithCapability('supportsComments');
    const commentServices =
        await filterEnabledAuthenticatedServices(allCommentServices);

    // Use primary service for comment posting (return the first successful result)
    for (const service of commentServices) {
        try {
            return await service.postComment(
                type,
                mediaInfo,
                comment,
                spoiler,
                episodeInfo
            );
        } catch (error) {
            console.error(
                `Failed to post comment on ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }

    throw new Error('No available services to post comment');
}

export async function handleUpdateComment(
    params: UpdateCommentParams
): Promise<ServiceComment> {
    const { commentId, comment, spoiler } = params;

    const allCommentServices =
        serviceRegistry.getServicesWithCapability('supportsComments');
    const commentServices =
        await filterEnabledAuthenticatedServices(allCommentServices);

    // Use primary service for comment updating (return the first successful result)
    for (const service of commentServices) {
        try {
            return await service.updateComment(commentId, comment, spoiler);
        } catch (error) {
            console.error(
                `Failed to update comment on ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }

    throw new Error('No available services to update comment');
}

export async function handleDeleteComment(
    params: DeleteCommentParams
): Promise<void> {
    const allCommentServices =
        serviceRegistry.getServicesWithCapability('supportsComments');
    const commentServices =
        await filterEnabledAuthenticatedServices(allCommentServices);

    for (const service of commentServices) {
        try {
            await service.deleteComment(params.commentId);
        } catch (error) {
            console.error(
                `Failed to delete comment on ${service.getCapabilities().serviceType}:`,
                error
            );
        }
    }
}
