
import type {
  MBTAAlert
} from '#lib/api/alerts.ts';

import type {
  TripStop
} from '#lib/api/mbta.ts';

import {
  getCommuteJourneyStops
} from '#lib/journey-stops.ts';

export interface JourneyTimeWindow {
  start: Date;
  end: Date;
}

/**
 * Get the scheduled departure and arrival
 * times for the monitored portion of a trip.
 *
 * Returns null when the required times or
 * commute endpoints are unavailable.
 */
export function getJourneyTimeWindow(
  tripStops: TripStop[]
): JourneyTimeWindow | null {
  const journeyStops =
    getCommuteJourneyStops(tripStops);

  if (journeyStops.length < 2) {
    return null;
  }

  const first = journeyStops[0];
  const last = journeyStops[journeyStops.length - 1];

  const departureTime =
    first.departureTime ?? first.arrivalTime;

  const arrivalTime =
    last.arrivalTime ?? last.departureTime;

  if (!departureTime || !arrivalTime) {
    return null;
  }

  const start = new Date(departureTime);
  const end = new Date(arrivalTime);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    return null;
  }

  return { start, end };
}

/**
 * Determine whether at least one alert active
 * period overlaps the scheduled journey.
 *
 * Missing start or end boundaries are
 * treated as open-ended.
 *
 * This does not decide whether the alert
 * actually affects the train.
 */
export function doesAlertOverlapJourney(
  alert: MBTAAlert,
  journey: JourneyTimeWindow
): boolean {
  return (
    alert.attributes.active_period ?? []
  ).some((period) => {
    const start = period.start
      ? new Date(period.start).getTime()
      : Number.NEGATIVE_INFINITY;

    const end = period.end
      ? new Date(period.end).getTime()
      : Number.POSITIVE_INFINITY;

    if (
      Number.isNaN(start) ||
      Number.isNaN(end)
    ) {
      return false;
    }

    return (
      start < journey.end.getTime() &&
      end > journey.start.getTime()
    );
  });
}
