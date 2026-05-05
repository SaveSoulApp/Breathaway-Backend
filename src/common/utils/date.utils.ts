/**
 * Formats a date string or Date object into a human-readable string.
 * Format: "Month Day, Year" (e.g., "November 27, 2025")
 *
 * @param date - The date string or Date object to format
 * @returns The formatted date string
 */
export const formatDate = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Formats a date string or Date object into a short date string.
 * Format: "Mon DD, YYYY" (e.g., "Nov 27, 2025")
 *
 * @param date - The date string or Date object to format
 * @returns The formatted date string
 */
export const formatDateShort = (date: string | Date): string => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};
