import { TraktCooldownError } from '../../types/serviceTypes';

/**
 * Detects if an error from a service represents a conflict/duplicate operation
 * that should be treated as a successful operation (e.g., content already scrobbled)
 */
export function isServiceConflictError(
    error: any,
    serviceType: string
): boolean {
    // Trakt 409 conflicts
    if (error instanceof TraktCooldownError) {
        return true;
    }

    // AniList conflicts (example patterns)
    if (serviceType === 'anilist') {
        // Check for AniList-specific conflict patterns
        if (
            error?.message?.includes('already exists') ||
            error?.message?.includes('duplicate') ||
            error?.status === 409
        ) {
            return true;
        }
    }

    // MAL conflicts (example patterns)
    if (serviceType === 'mal') {
        // Check for MAL-specific conflict patterns
        if (
            error?.message?.includes('already in list') ||
            error?.status === 409
        ) {
            return true;
        }
    }

    // Generic conflict detection
    if (
        error?.status === 409 ||
        error?.message?.toLowerCase().includes('conflict') ||
        error?.message?.toLowerCase().includes('duplicate')
    ) {
        return true;
    }

    return false;
}

/**
 * Creates a standard conflict response for services that have conflicts
 */
export function createConflictResponse(serviceType: string) {
    return {
        action: 'watched' as const,
        historyId: -1, // Special ID for conflicts
        serviceType: serviceType as any
    };
}
