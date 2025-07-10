import {
    DeleteCommentParams,
    GetCommentsParams,
    PostCommentParams,
    UpdateCommentParams
} from '../../types/messaging';
import { ServiceComment } from '../../types/serviceTypes';
import { executeCommentOperation } from '../utils/serviceOperations';
import { getActiveServicesForCapability } from '../utils/serviceHelpers';

export async function handleGetComments(
    params: GetCommentsParams
): Promise<ServiceComment[]> {
    const { type, mediaInfo, episodeInfo } = params;

    const commentServices =
        await getActiveServicesForCapability('supportsComments');

    // Get comments from ALL services in parallel
    const commentPromises = commentServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            const comments = await service.getComments(
                type,
                mediaInfo,
                episodeInfo
            );
            console.log(`✅ Successfully fetched comments from ${serviceType}`);
            return comments;
        } catch (error) {
            console.error(
                `❌ Failed to get comments from ${serviceType}:`,
                error
            );
            return [];
        }
    });

    const results = await Promise.allSettled(commentPromises);
    const allComments: ServiceComment[] = [];

    results.forEach((result) => {
        if (result.status === 'fulfilled') {
            allComments.push(...result.value);
        }
    });

    return allComments;
}

export async function handlePostComment(
    params: PostCommentParams
): Promise<ServiceComment> {
    const { type, mediaInfo, episodeInfo, comment, spoiler } = params;

    const commentServices =
        await getActiveServicesForCapability('supportsComments');

    console.log(
        `🔄 Posting comment to ${commentServices.length} services:`,
        commentServices.map((s) => s.getCapabilities().serviceType)
    );

    // Post to ALL enabled services in parallel
    const postPromises = commentServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            console.log(`📝 Posting to ${serviceType}...`);
            const result = await service.postComment(
                type,
                mediaInfo,
                comment,
                spoiler,
                episodeInfo
            );
            console.log(`✅ Successfully posted to ${serviceType}`);
            return { success: true, result, serviceType };
        } catch (error) {
            const errorMsg = `Failed to post comment on ${serviceType}: ${error}`;
            console.error(`❌ ${errorMsg}`);
            return { success: false, error: errorMsg, serviceType };
        }
    });

    const postResults = await Promise.allSettled(postPromises);
    const results: ServiceComment[] = [];
    const errors: string[] = [];

    postResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
            if (result.value.success && result.value.result) {
                results.push(result.value.result);
            } else if (!result.value.success && result.value.error) {
                errors.push(result.value.error);
            }
        }
    });

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

    const commentServices =
        await getActiveServicesForCapability('supportsComments');

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
    await executeCommentOperation(
        (service, p) => service.deleteComment(p.commentId),
        params,
        'deleted comment'
    );
}
