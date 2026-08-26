/**
 * Date utility functions
 */

/**
 * Generate date range between start and end dates
 * Equivalent to Python's date_range helper
 */
export function* dateRange(startDate: Date, endDate: Date): Generator<Date> {
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    yield new Date(current);
    current.setDate(current.getDate() + 1);
  }
}

/**
 * Get array of dates in range
 */
export function getDateArray(startDate: Date, endDate: Date): Date[] {
  return Array.from(dateRange(startDate, endDate));
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format date to ISO 8601 with time
 */
export function formatDateTime(date: Date, endOfDay = false): string {
  const dateStr = formatDate(date);
  const time = endOfDay ? 'T23:59:59Z' : 'T00:00:00Z';
  return dateStr + time;
}

/**
 * Parse date string to Date object
 */
export function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return date;
}

/**
 * Get today's date at midnight
 */
export function today(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Subtract days from a date
 */
export function subtractDays(date: Date, days: number): Date {
  return addDays(date, -days);
}

/**
 * Add years to a date
 */
export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Get the number of days between two dates
 */
export function daysBetween(startDate: Date, endDate: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay);
}
