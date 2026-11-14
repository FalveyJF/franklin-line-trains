
import type {
  MatchedTrain
} from '#lib/api/mbta.ts';

import type {
  JourneyTimeWindow
} from '#lib/alert-timing.ts';

/**
 * Determine the scheduled time window for
 * a train traveling between our two
 * monitored stations.
 *
 * Unlike getJourneyTimeWindow(), this
 * function uses the departure and arrival
 * schedules already loaded by the main page.
 *
 * No additional MBTA API request is needed.
 */
export function getMatchedTrainJourneyWindow(
  train: MatchedTrain
): JourneyTimeWindow | null {
  const departureTime =
    train.departure.attributes.departure_time ??
    train.departure.attributes.arrival_time;

  const arrivalTime =
    train.arrival.attributes.arrival_time ??
    train.arrival.attributes.departure_time;

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

  return {
    start,
    end
  };
}
