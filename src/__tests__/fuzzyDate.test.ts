import {
    convertToFuzzyDate,
    convertFromFuzzyDate,
    getCurrentFuzzyDate,
    isValidFuzzyDate,
    compareFuzzyDates,
    formatFuzzyDate,
    type FuzzyDateInput,
    type FuzzyDate
} from '../fuzzyDate';

describe('FuzzyDate Utilities', () => {
    describe('convertToFuzzyDate', () => {
        it('should convert a valid Date to FuzzyDate', () => {
            const date = new Date(2024, 11, 25); // December 25, 2024
            const result = convertToFuzzyDate(date);

            expect(result).toEqual({
                year: 2024,
                month: 12,
                day: 25
            });
        });

        it('should return null for null input', () => {
            expect(convertToFuzzyDate(null)).toBeNull();
            expect(convertToFuzzyDate(undefined)).toBeNull();
        });

        it('should return null for invalid Date', () => {
            const invalidDate = new Date('invalid');
            expect(convertToFuzzyDate(invalidDate)).toBeNull();
        });
    });

    describe('convertFromFuzzyDate', () => {
        it('should convert a complete FuzzyDate to JavaScript Date', () => {
            const fuzzyDate: FuzzyDate = {
                year: 2024,
                month: 12,
                day: 25
            };
            const result = convertFromFuzzyDate(fuzzyDate);

            expect(result).toEqual(new Date(2024, 11, 25));
        });

        it('should handle partial FuzzyDate with year and month', () => {
            const fuzzyDate: FuzzyDate = {
                year: 2024,
                month: 12
            };
            const result = convertFromFuzzyDate(fuzzyDate);

            expect(result).toEqual(new Date(2024, 11, 1)); // Defaults to 1st day
        });

        it('should handle partial FuzzyDate with only year', () => {
            const fuzzyDate: FuzzyDate = {
                year: 2024
            };
            const result = convertFromFuzzyDate(fuzzyDate);

            expect(result).toEqual(new Date(2024, 0, 1)); // January 1st
        });

        it('should return null for invalid FuzzyDate', () => {
            expect(convertFromFuzzyDate(null)).toBeNull();
            expect(convertFromFuzzyDate(undefined)).toBeNull();
            expect(convertFromFuzzyDate({})).toBeNull();
            expect(convertFromFuzzyDate({ month: 12, day: 25 })).toBeNull(); // No year
        });

        it('should return null for invalid date components', () => {
            expect(
                convertFromFuzzyDate({ year: 2024, month: 13, day: 1 })
            ).toBeNull(); // Invalid month
            expect(
                convertFromFuzzyDate({ year: 2024, month: 1, day: 32 })
            ).toBeNull(); // Invalid day
            expect(
                convertFromFuzzyDate({ year: 2024, month: 2, day: 30 })
            ).toBeNull(); // February 30th
        });
    });

    describe('getCurrentFuzzyDate', () => {
        it('should return current date as FuzzyDate', () => {
            const now = new Date();
            const result = getCurrentFuzzyDate();

            expect(result.year).toBe(now.getFullYear());
            expect(result.month).toBe(now.getMonth() + 1);
            expect(result.day).toBe(now.getDate());
        });
    });

    describe('isValidFuzzyDate', () => {
        it('should return true for valid FuzzyDates', () => {
            expect(isValidFuzzyDate({ year: 2024, month: 12, day: 25 })).toBe(
                true
            );
            expect(isValidFuzzyDate({ year: 2024, month: 12 })).toBe(true);
            expect(isValidFuzzyDate({ year: 2024 })).toBe(true);
        });

        it('should return false for invalid FuzzyDates', () => {
            expect(isValidFuzzyDate(null)).toBe(false);
            expect(isValidFuzzyDate(undefined)).toBe(false);
            expect(isValidFuzzyDate({})).toBe(false);
            expect(isValidFuzzyDate({ month: 12, day: 25 })).toBe(false); // No year
            expect(isValidFuzzyDate({ year: 2024, month: 13 })).toBe(false); // Invalid month
            expect(isValidFuzzyDate({ year: 2024, month: 1, day: 32 })).toBe(
                false
            ); // Invalid day
            expect(isValidFuzzyDate({ year: 2024, month: 2, day: 30 })).toBe(
                false
            ); // February 30th
        });
    });

    describe('compareFuzzyDates', () => {
        it('should compare dates correctly', () => {
            const date1: FuzzyDate = { year: 2024, month: 1, day: 1 };
            const date2: FuzzyDate = { year: 2024, month: 1, day: 2 };
            const date3: FuzzyDate = { year: 2024, month: 2, day: 1 };
            const date4: FuzzyDate = { year: 2025, month: 1, day: 1 };

            expect(compareFuzzyDates(date1, date2)).toBe(-1); // date1 < date2
            expect(compareFuzzyDates(date2, date1)).toBe(1); // date2 > date1
            expect(compareFuzzyDates(date1, date1)).toBe(0); // date1 == date1
            expect(compareFuzzyDates(date1, date3)).toBe(-1); // date1 < date3
            expect(compareFuzzyDates(date1, date4)).toBe(-1); // date1 < date4
        });

        it('should handle null dates', () => {
            const date1: FuzzyDate = { year: 2024, month: 1, day: 1 };

            expect(compareFuzzyDates(null, null)).toBe(0);
            expect(compareFuzzyDates(null, date1)).toBe(-1);
            expect(compareFuzzyDates(date1, null)).toBe(1);
        });

        it('should handle partial dates', () => {
            const date1: FuzzyDate = { year: 2024 };
            const date2: FuzzyDate = { year: 2024, month: 1 };

            expect(compareFuzzyDates(date1, date2)).toBe(0); // Both default to Jan 1
        });
    });

    describe('formatFuzzyDate', () => {
        it('should format complete dates', () => {
            const fuzzyDate: FuzzyDate = { year: 2024, month: 12, day: 25 };
            expect(formatFuzzyDate(fuzzyDate)).toBe('2024-12-25');
        });

        it('should format partial dates', () => {
            expect(formatFuzzyDate({ year: 2024, month: 12 })).toBe('2024-12');
            expect(formatFuzzyDate({ year: 2024 })).toBe('2024');
        });

        it('should handle invalid dates', () => {
            expect(formatFuzzyDate(null)).toBe('Unknown date');
            expect(formatFuzzyDate(undefined)).toBe('Unknown date');
            expect(formatFuzzyDate({})).toBe('Unknown date');
        });

        it('should pad single-digit months and days', () => {
            const fuzzyDate: FuzzyDate = { year: 2024, month: 1, day: 5 };
            expect(formatFuzzyDate(fuzzyDate)).toBe('2024-01-05');
        });
    });
});
