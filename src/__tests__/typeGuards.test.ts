import { describe, it, expect } from 'vitest';
import { isMovieMediaInfo, isShowMediaInfo } from '../typeGuards';
import { createMockMediaInfo } from '../../test/utils';

describe('typeGuards', () => {
    describe('isMovieMediaInfo', () => {
        it('should return true for movie media info', () => {
            const movieInfo = createMockMediaInfo('movie');
            expect(isMovieMediaInfo(movieInfo)).toBe(true);
        });

        it('should return false for show media info', () => {
            const showInfo = createMockMediaInfo('show');
            expect(isMovieMediaInfo(showInfo)).toBe(false);
        });

        it('should return false for null', () => {
            expect(isMovieMediaInfo(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isMovieMediaInfo(undefined)).toBe(false);
        });
    });

    describe('isShowMediaInfo', () => {
        it('should return true for show media info', () => {
            const showInfo = createMockMediaInfo('show');
            expect(isShowMediaInfo(showInfo)).toBe(true);
        });

        it('should return false for movie media info', () => {
            const movieInfo = createMockMediaInfo('movie');
            expect(isShowMediaInfo(movieInfo)).toBe(false);
        });

        it('should return false for null', () => {
            expect(isShowMediaInfo(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(isShowMediaInfo(undefined)).toBe(false);
        });
    });
});
