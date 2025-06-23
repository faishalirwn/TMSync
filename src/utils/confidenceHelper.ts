import { MovieMediaInfo, ShowMediaInfo } from '../types/media';
import { isMovieMediaInfo, isShowMediaInfo } from './typeGuards';

export function getTitleSimilarity(
    queryTitle: string,
    resultTitle: string
): number {
    const q = queryTitle.toLowerCase().trim();
    const r = resultTitle.toLowerCase().trim();
    if (q === r) return 1.0;
    if (r.includes(q)) return 0.7;
    if (q.includes(r)) return 0.6;

    const queryWords = new Set(q.split(' '));
    const resultWords = r.split(' ');
    const overlap = resultWords.filter((word) => queryWords.has(word)).length;
    return (overlap / Math.max(queryWords.size, resultWords.length)) * 0.5;
}

export function calculateConfidence(
    result: MovieMediaInfo | ShowMediaInfo,
    queryTitle: string,
    queryYear: string | number | null
): number {
    let score = 0;
    let resultTitle = '';
    let resultYear = 0;
    if (isMovieMediaInfo(result)) {
        resultTitle = result.movie.title;
        resultYear = result.movie.year;
    } else if (isShowMediaInfo(result)) {
        resultTitle = result.show.title;
        resultYear = result.show.year;
    } else {
        console.warn(
            'calculateConfidence received unexpected media type:',
            result
        );
        return 0;
    }

    const titleSim = getTitleSimilarity(queryTitle, resultTitle);
    score += titleSim * 50;

    if (queryYear && resultYear && String(resultYear) === String(queryYear)) {
        score += 40;
    }

    score += Math.min(result.score / 100, 10);

    return Math.min(score, 100);
}
