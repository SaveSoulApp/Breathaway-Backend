import {
  toSmartTitleCase,
  normalizeDocumentNumber,
} from '../string.extensions';

describe('String Extensions', () => {
  describe('toSmartTitleCase', () => {
    it('should capitalize the first letter of each word', () => {
      expect(toSmartTitleCase('hello world')).toBe('Hello World');
    });

    it('should keep small words in the middle lowercase', () => {
      expect(toSmartTitleCase('the lord of the rings')).toBe(
        'The Lord of the Rings',
      );
      expect(toSmartTitleCase('war and peace')).toBe('War and Peace');
    });

    it('should capitalize small words at the beginning or end', () => {
      expect(toSmartTitleCase('the end')).toBe('The End');
      expect(toSmartTitleCase('a new hope')).toBe('A New Hope');
    });

    it('should handle extra spacing and trim the string', () => {
      expect(toSmartTitleCase('  leading and trailing spaces  ')).toBe(
        'Leading and Trailing Spaces',
      );
      expect(toSmartTitleCase('multiple   spaces')).toBe('Multiple Spaces');
    });

    it('should handle an empty string', () => {
      expect(toSmartTitleCase('')).toBe('');
    });

    it('should handle a single-word string', () => {
      expect(toSmartTitleCase('superman')).toBe('Superman');
    });

    it('should not change a string that is already in title case', () => {
      expect(toSmartTitleCase('The Quick Brown Fox')).toBe(
        'The Quick Brown Fox',
      );
    });
  });

  describe('normalizeDocumentNumber', () => {
    it('should convert to uppercase and remove spaces', () => {
      expect(normalizeDocumentNumber(' doc 123 xyz ')).toBe('DOC123XYZ');
    });

    it('should handle multiple internal spaces', () => {
      expect(normalizeDocumentNumber('invoice  456')).toBe('INVOICE456');
    });

    it('should return non-string values as-is', () => {
      expect(normalizeDocumentNumber(123)).toBe(123);
      expect(normalizeDocumentNumber(null)).toBe(null);
      expect(normalizeDocumentNumber(undefined)).toBe(undefined);
      const obj = { a: 1 };
      expect(normalizeDocumentNumber(obj)).toBe(obj);
    });

    it('should handle an empty string', () => {
      expect(normalizeDocumentNumber('')).toBe('');
    });

    it('should not alter a string that is already normalized', () => {
      expect(normalizeDocumentNumber('ABC123XYZ')).toBe('ABC123XYZ');
    });

    it('should preserve hyphens and other special characters', () => {
      expect(normalizeDocumentNumber('inv-2024-001')).toBe('INV-2024-001');
    });
  });
});
