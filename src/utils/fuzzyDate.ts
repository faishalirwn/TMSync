/**
 * Utilities for working with AniList's FuzzyDate format
 *
 * AniList uses FuzzyDate format: {year: number, month: number, day: number}
 * All fields are optional to support partial dates
 */

/**
 * AniList FuzzyDate input type
 */
export interface FuzzyDateInput {
    year?: number;
    month?: number;
    day?: number;
}

/**
 * AniList FuzzyDate output type (same as input)
 */
export interface FuzzyDate {
    year?: number;
    month?: number;
    day?: number;
}

/**
 * Convert a JavaScript Date to AniList FuzzyDate format
 * @param date - JavaScript Date object to convert
 * @returns FuzzyDateInput object for AniList API
 */
export function convertToFuzzyDate(
    date: Date | null | undefined
): FuzzyDateInput | null {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
        return null;
    }

    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1, // JavaScript months are 0-indexed, AniList expects 1-indexed
        day: date.getDate()
    };
}

/**
 * Convert AniList FuzzyDate to JavaScript Date
 * @param fuzzyDate - AniList FuzzyDate object
 * @returns JavaScript Date object or null if invalid
 */
export function convertFromFuzzyDate(
    fuzzyDate: FuzzyDate | null | undefined
): Date | null {
    if (!fuzzyDate) {
        return null;
    }

    // Need at least year to create a valid date
    if (!fuzzyDate.year) {
        return null;
    }

    // Default to January 1st if month/day not provided
    const year = fuzzyDate.year;
    const month = fuzzyDate.month || 1;
    const day = fuzzyDate.day || 1;

    // Validate the date components
    if (month < 1 || month > 12) {
        return null;
    }

    if (day < 1 || day > 31) {
        return null;
    }

    try {
        const jsDate = new Date(year, month - 1, day); // JavaScript months are 0-indexed

        // Check if the date is valid (e.g., not February 30th)
        if (
            jsDate.getFullYear() !== year ||
            jsDate.getMonth() !== month - 1 ||
            jsDate.getDate() !== day
        ) {
            return null;
        }

        return jsDate;
    } catch (error) {
        return null;
    }
}

/**
 * Get current date as FuzzyDate
 * @returns Current date in FuzzyDate format
 */
export function getCurrentFuzzyDate(): FuzzyDateInput {
    return convertToFuzzyDate(new Date())!;
}

/**
 * Check if a FuzzyDate is valid
 * @param fuzzyDate - FuzzyDate to validate
 * @returns true if valid, false otherwise
 */
export function isValidFuzzyDate(
    fuzzyDate: FuzzyDate | null | undefined
): boolean {
    if (!fuzzyDate) {
        return false;
    }

    // At least year is required
    if (!fuzzyDate.year) {
        return false;
    }

    // Validate month if provided
    if (
        fuzzyDate.month !== undefined &&
        (fuzzyDate.month < 1 || fuzzyDate.month > 12)
    ) {
        return false;
    }

    // Validate day if provided
    if (
        fuzzyDate.day !== undefined &&
        (fuzzyDate.day < 1 || fuzzyDate.day > 31)
    ) {
        return false;
    }

    // If we have all components, check if it's a valid date
    if (fuzzyDate.year && fuzzyDate.month && fuzzyDate.day) {
        const testDate = new Date(
            fuzzyDate.year,
            fuzzyDate.month - 1,
            fuzzyDate.day
        );
        return (
            testDate.getFullYear() === fuzzyDate.year &&
            testDate.getMonth() === fuzzyDate.month - 1 &&
            testDate.getDate() === fuzzyDate.day
        );
    }

    return true;
}

/**
 * Compare two FuzzyDates
 * @param date1 - First FuzzyDate
 * @param date2 - Second FuzzyDate
 * @returns -1 if date1 < date2, 0 if equal, 1 if date1 > date2, null if incomparable
 */
export function compareFuzzyDates(
    date1: FuzzyDate | null | undefined,
    date2: FuzzyDate | null | undefined
): number | null {
    if (!date1 && !date2) return 0;
    if (!date1) return -1;
    if (!date2) return 1;

    // Compare years
    if (date1.year !== date2.year) {
        if (!date1.year) return -1;
        if (!date2.year) return 1;
        return date1.year < date2.year ? -1 : 1;
    }

    // Years are equal, compare months
    const month1 = date1.month || 1;
    const month2 = date2.month || 1;
    if (month1 !== month2) {
        return month1 < month2 ? -1 : 1;
    }

    // Years and months are equal, compare days
    const day1 = date1.day || 1;
    const day2 = date2.day || 1;
    if (day1 !== day2) {
        return day1 < day2 ? -1 : 1;
    }

    return 0;
}

/**
 * Format FuzzyDate for display
 * @param fuzzyDate - FuzzyDate to format
 * @returns Formatted string
 */
export function formatFuzzyDate(
    fuzzyDate: FuzzyDate | null | undefined
): string {
    if (!fuzzyDate || !fuzzyDate.year) {
        return 'Unknown date';
    }

    if (fuzzyDate.year && fuzzyDate.month && fuzzyDate.day) {
        return `${fuzzyDate.year}-${fuzzyDate.month.toString().padStart(2, '0')}-${fuzzyDate.day.toString().padStart(2, '0')}`;
    }

    if (fuzzyDate.year && fuzzyDate.month) {
        return `${fuzzyDate.year}-${fuzzyDate.month.toString().padStart(2, '0')}`;
    }

    return fuzzyDate.year.toString();
}
