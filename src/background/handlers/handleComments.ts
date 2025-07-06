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

    console.log(
        `🔄 Posting comment to ${commentServices.length} services:`,
        commentServices.map((s) => s.getCapabilities().serviceType)
    );

    // Post to all enabled services (multi-service approach)
    const results: ServiceComment[] = [];
    const errors: string[] = [];

    for (const service of commentServices) {
        try {
            console.log(
                `📝 Posting to ${service.getCapabilities().serviceType}...`
            );
            const result = await service.postComment(
                type,
                mediaInfo,
                comment,
                spoiler,
                episodeInfo
            );
            results.push(result);
            console.log(
                `✅ Successfully posted to ${service.getCapabilities().serviceType}`
            );
        } catch (error) {
            const serviceName = service.getCapabilities().serviceType;
            const errorMsg = `Failed to post comment on ${serviceName}: ${error}`;
            console.error(errorMsg);
            errors.push(errorMsg);
        }
    }

    if (results.length === 0) {
        throw new Error(
            `Failed to post comment to any service. Errors: ${errors.join(', ')}`
        );
    }

    console.log(
        `✅ Posted comment to ${results.length}/${commentServices.length} services`
    );

    // Return the first successful result (UI expects single ServiceComment)
    return results[0];
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
