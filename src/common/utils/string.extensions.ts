/**
 * Converts a string to smart title case following common title capitalization rules.
 *
 * Capitalizes the first letter of each word except for specified small words (articles,
 * conjunctions, prepositions) unless they appear as the first or last word in the title.
 *
 * @param str - The input string to convert to title case
 * @returns The title-cased string with proper small word handling
 *
 * @example
 * // Basic usage
 * toSmartTitleCase('the quick brown fox') // 'The Quick Brown Fox'
 *
 * @example
 * // Small words in middle remain lowercase
 * toSmartTitleCase('war and peace') // 'War and Peace'
 *
 * @example
 * // First and last words are always capitalized
 * toSmartTitleCase('the end of time') // 'The End of Time'
 * toSmartTitleCase('time of the end') // 'Time of the End'
 *
 * @example
 * // Handles multiple spaces and trimming
 * toSmartTitleCase('  hello   world  ') // 'Hello World'
 *
 * @example
 * // Common title examples
 * toSmartTitleCase('the lord of the rings') // 'The Lord of the Rings'
 * toSmartTitleCase('gone with the wind') // 'Gone with the Wind'
 * toSmartTitleCase('to kill a mockingbird') // 'To Kill a Mockingbird'
 */
export function toSmartTitleCase(str: string): string {
  const smallWords = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'but',
    'by',
    'for',
    'in',
    'nor',
    'of',
    'on',
    'or',
    'per',
    'the',
    'to',
    'vs',
    'via',
  ]);

  const words = str.toLowerCase().trim().split(/\s+/);

  return words
    .map((word, index) => {
      if (smallWords.has(word) && index !== 0 && index !== words.length - 1) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Normalizes document numbers by converting to uppercase, trimming whitespace,
 * and removing all internal spaces. Useful for standardizing identifiers like
 * invoice numbers, license numbers, or reference codes.
 *
 * @param value - The value to normalize. If not a string, returns the original value unchanged.
 * @returns The normalized document number string in uppercase without spaces,
 *          or the original value if input is not a string.
 *
 * @example
 * // Basic normalization
 * normalizeDocumentNumber(' abc 123 ') // 'ABC123'
 *
 * @example
 * // Removes internal spaces
 * normalizeDocumentNumber('DOC 123 XYZ') // 'DOC123XYZ'
 *
 * @example
 * // Handles multiple spaces
 * normalizeDocumentNumber('  INVOICE  456  ') // 'INVOICE456'
 *
 * @example
 * // Non-string inputs returned as-is
 * normalizeDocumentNumber(123) // 123
 * normalizeDocumentNumber(null) // null
 * normalizeDocumentNumber(undefined) // undefined
 *
 * @example
 * // Common use cases
 * normalizeDocumentNumber('inv-2024-001') // 'INV-2024-001' (note: hyphens preserved)
 * normalizeDocumentNumber('license num 456') // 'LICENSENUM456'
 */
export function normalizeDocumentNumber<T>(
  value: T,
): T extends string ? string : T {
  if (typeof value !== 'string') {
    return value as unknown as T extends string ? string : T;
  }
  return value
    .toUpperCase()
    .trim()
    .replace(/\s+/g, '') as unknown as T extends string ? string : T;
}
