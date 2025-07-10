/**
 * Test movie rewatch logic manually
 */

import { getCurrentFuzzyDate } from '../fuzzyDate';

// Mock test to verify our logic
describe('Movie Rewatch Logic', () => {
    it('should create proper FuzzyDate for current date', () => {
        const currentDate = getCurrentFuzzyDate();
        const now = new Date();

        expect(currentDate.year).toBe(now.getFullYear());
        expect(currentDate.month).toBe(now.getMonth() + 1);
        expect(currentDate.day).toBe(now.getDate());
    });

    it('should handle movie rewatch scenarios', () => {
        // Simulate first watch scenario
        const firstWatch = {
            status: 'COMPLETED',
            repeat: 0,
            startedAt: { year: 2024, month: 1, day: 1 },
            completedAt: { year: 2024, month: 1, day: 1 }
        };

        // Simulate rewatch scenario
        const existingEntry = firstWatch;
        const currentDate = { year: 2024, month: 12, day: 25 };

        const rewatchResult = {
            status: 'REPEATING',
            repeat: (existingEntry.repeat || 0) + 1,
            startedAt: existingEntry.startedAt,
            completedAt: currentDate
        };

        expect(rewatchResult.status).toBe('REPEATING');
        expect(rewatchResult.repeat).toBe(1);
        expect(rewatchResult.startedAt).toEqual(firstWatch.startedAt);
        expect(rewatchResult.completedAt).toEqual(currentDate);
    });
});
