
/**
 * Eastern Time utilities for the Franklin Line application.
 */

const EASTERN_TIME_ZONE = 'America/New_York';

// Configure the automatic direction switching time here.
// 12 means noon Eastern Time.
export const DIRECTION_SWITCH_HOUR = 12;

// The two directions supported by our application.
export type CommuteDirection = 'inbound' | 'outbound';

/**
 * Return the Eastern Time calendar date in YYYY-MM-DD format.
 */
export function getEasternServiceDate(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = formatter.formatToParts(new Date());

  const year = parts.find(
    (part) => part.type === 'year'
  )?.value;

  const month = parts.find(
    (part) => part.type === 'month'
  )?.value;

  const day = parts.find(
    (part) => part.type === 'day'
  )?.value;

  if (!year || !month || !day) {
    throw new Error('Unable to determine Eastern Time date.');
  }

  return `${year}-${month}-${day}`;
}

/**
 * Format a service date for display.
 */
export function formatServiceDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);

  const utcDate = new Date(
    Date.UTC(year, month - 1, day)
  );

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(utcDate);
}

/**
 * Determine the current hour in Eastern Time.
 *
 * Returns a number from 0 through 23.
 */
export function getEasternHour(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    hour: 'numeric',
    hourCycle: 'h23'
  });

  return Number(formatter.format(new Date()));
}

/**
 * Choose the default commute direction.
 *
 * Before noon: inbound
 * Noon or later: outbound
 */
export function getDefaultDirection(): CommuteDirection {
  const hour = getEasternHour();

  return hour < DIRECTION_SWITCH_HOUR
    ? 'inbound'
    : 'outbound';
}
