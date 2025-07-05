import { MediaInfoResponse, SeasonEpisodeObj } from '../types/media';

/**
 * Manages scrobble operations to prevent conflicts and race conditions
 */
class ScrobbleOperationManager {
    private activeOperations: Map<string, Promise<any>> = new Map();

    /**
     * Generate a unique key for a scrobble operation
     */
    private generateOperationKey(
        operation: 'stop' | 'pause',
        mediaInfo: MediaInfoResponse,
        episodeInfo?: SeasonEpisodeObj | null
    ): string {
        const mediaKey =
            mediaInfo.type === 'movie'
                ? `movie-${mediaInfo.movie.ids.trakt}`
                : `show-${mediaInfo.show.ids.trakt}-${episodeInfo?.season || 0}-${episodeInfo?.number || 0}`;

        return `${operation}-${mediaKey}`;
    }

    /**
     * Execute a scrobble operation with deduplication and retry logic
     */
    async executeOperation<T>(
        operation: 'stop' | 'pause',
        mediaInfo: MediaInfoResponse,
        episodeInfo: SeasonEpisodeObj | null,
        executor: () => Promise<T>
    ): Promise<T> {
        const operationKey = this.generateOperationKey(
            operation,
            mediaInfo,
            episodeInfo
        );

        // If operation is already in progress, return the existing promise
        if (this.activeOperations.has(operationKey)) {
            console.log(
                `⚠️ Deduplicating ${operation} operation for ${operationKey}`
            );
            return this.activeOperations.get(operationKey)!;
        }

        console.log(`🔄 Starting ${operation} operation for ${operationKey}`);

        // Create and store the operation promise with retry logic
        const operationPromise = this.executeWithRetry(
            executor,
            operation,
            operationKey
        ).finally(() => {
            // Clean up after operation completes
            this.activeOperations.delete(operationKey);
            console.log(
                `✅ Completed ${operation} operation for ${operationKey}`
            );
        });

        this.activeOperations.set(operationKey, operationPromise);

        return operationPromise;
    }

    /**
     * Execute operation with retry logic for rate limits
     */
    private async executeWithRetry<T>(
        executor: () => Promise<T>,
        operation: string,
        operationKey: string,
        attempt: number = 1
    ): Promise<T> {
        try {
            return await executor();
        } catch (error: any) {
            // Retry on rate limit (429) or network errors, up to 3 attempts
            if (
                attempt < 3 &&
                (error?.status === 429 ||
                    error?.message?.includes('429') ||
                    error?.message?.includes('network') ||
                    error?.message?.includes('fetch'))
            ) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                console.log(
                    `⏱️ Rate limit hit for ${operation} (${operationKey}), retrying in ${delay}ms (attempt ${attempt}/3)`
                );

                await new Promise((resolve) => setTimeout(resolve, delay));
                return this.executeWithRetry(
                    executor,
                    operation,
                    operationKey,
                    attempt + 1
                );
            }

            // Re-throw if not retryable or max attempts reached
            console.error(
                `❌ ${operation} operation failed for ${operationKey} after ${attempt} attempts:`,
                error
            );
            throw error;
        }
    }

    /**
     * Check if an operation is currently in progress
     */
    isOperationInProgress(
        operation: 'stop' | 'pause',
        mediaInfo: MediaInfoResponse,
        episodeInfo?: SeasonEpisodeObj | null
    ): boolean {
        const operationKey = this.generateOperationKey(
            operation,
            mediaInfo,
            episodeInfo
        );
        return this.activeOperations.has(operationKey);
    }

    /**
     * Clear all active operations (for cleanup)
     */
    clearOperations(): void {
        this.activeOperations.clear();
    }

    /**
     * Get count of active operations (for debugging)
     */
    getActiveOperationCount(): number {
        return this.activeOperations.size;
    }
}

export const scrobbleOperationManager = new ScrobbleOperationManager();
