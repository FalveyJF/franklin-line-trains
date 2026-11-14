
/**
 * Utilities for comparing MBTA scheduled and
 * predicted arrival/departure times.
 */

export type DelayStatus =
  | 'late'
  | 'early'
  | 'on-time'
  | 'unavailable';

export interface DelayInfo {
  status: DelayStatus;

  // Signed difference in seconds.
  // Positive = late, negative = early.
  differenceSeconds: number | null;

  // Absolute difference rounded to the nearest minute.
  minutes: number | null;

  // Human-readable description.
  label: string;
}

/**
 * Compare a scheduled timestamp with an MBTA
 * predicted timestamp.
 *
 * A missing prediction is NOT considered on time.
 */
export function calculateDelay(
  scheduledTime: string | null,
  predictedTime: string | null
): DelayInfo {

  if (!scheduledTime || !predictedTime) {
    return {
      status: 'unavailable',
      differenceSeconds: null,
      minutes: null,
      label: 'Prediction unavailable'
    };
  }

  const scheduled = new Date(scheduledTime).getTime();
  const predicted = new Date(predictedTime).getTime();

  // Reject invalid timestamps.
  if (
    !Number.isFinite(scheduled) ||
    !Number.isFinite(predicted)
  ) {
    return {
      status: 'unavailable',
      differenceSeconds: null,
      minutes: null,
      label: 'Prediction unavailable'
    };
  }

  const differenceSeconds = Math.round(
    (predicted - scheduled) / 1000
  );

  const absoluteSeconds = Math.abs(differenceSeconds);
  const minutes = Math.round(absoluteSeconds / 60);

  // Less than 60 seconds difference is treated
  // as effectively on schedule for this display.
  if (absoluteSeconds < 60) {
    return {
      status: 'on-time',
      differenceSeconds,
      minutes: 0,
      label: 'Within 1 minute of schedule'
    };
  }

  if (differenceSeconds > 0) {
    return {
      status: 'late',
      differenceSeconds,
      minutes,
      label: `${minutes} min late`
    };
  }

  return {
    status: 'early',
    differenceSeconds,
    minutes,
    label: `${minutes} min early`
  };
}
