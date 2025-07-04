import {
    RequestManualAddToHistoryParams,
    ScrobbleResponse
} from '../../types/messaging';
import { traktService } from '../../services/TraktService';

export async function handleManualAddToHistory(
    params: RequestManualAddToHistoryParams
): Promise<ScrobbleResponse> {
    const result = await traktService.addToHistory(
        params.mediaInfo,
        params.episodeInfo || null
    );
    return { traktHistoryId: result.traktHistoryId! };
}

export async function handleUndoScrobble(params: {
    historyId: number;
}): Promise<void> {
    await traktService.removeFromHistory(params.historyId);
}
