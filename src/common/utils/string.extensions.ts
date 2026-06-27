/**
 * Converts strings into structurally aware title case for professional UI display.
 *
 * Avoids aggressive capitalization by maintaining lowercase for common conjunctions
 * and prepositions (e.g., 'and', 'or', 'the') unless they begin or end the title.
 *
 * @param str - The raw input string to transform.
 * @returns The properly capitalized title string.
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
 * Normalizes unstructured document codes (e.g., invoices, licenses) into a canonical searchable format.
 *
 * Strips all internal whitespace and normalizes to uppercase to prevent duplicate entries
 * or failed lookups caused by user formatting inconsistencies.
 *
 * @param value - The raw input value. If not a string, it passes through untouched.
 * @returns The canonical, space-free uppercase identifier.
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
