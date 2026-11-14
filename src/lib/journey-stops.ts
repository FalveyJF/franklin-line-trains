
import type {
  TripStop
} from '#lib/api/mbta.ts';

import type {
  StopStationInfo
} from '#lib/api/stops.ts';

/**
 * Known MBTA stop IDs for our commute endpoints.
 *
 * Include both the parent station IDs and
 * platform-specific stop IDs.
 */
const SOUTH_STATION_IDS = new Set([
  'place-sstat',
  'NEC-2287'
]);

const NORWOOD_CENTRAL_IDS = new Set([
  'place-FB-0148',
  'FB-0148-01',
  'FB-0148-02'
]);

/**
 * Extract the scheduled stops between
 * South Station and Norwood Central,
 * including both endpoints.
 *
 * Works for inbound and outbound trains.
 *
 * Returns an empty array if either
 * endpoint cannot be identified.
 */
export function getCommuteJourneyStops(
  tripStops: TripStop[]
): TripStop[] {
  const orderedStops = [...tripStops].sort(
    (a, b) => a.stopSequence - b.stopSequence
  );

  const southStationIndex = orderedStops.findIndex(
    (stop) => SOUTH_STATION_IDS.has(stop.stopId)
  );

  const norwoodCentralIndex = orderedStops.findIndex(
    (stop) => NORWOOD_CENTRAL_IDS.has(stop.stopId)
  );

  if (
    southStationIndex === -1 ||
    norwoodCentralIndex === -1 ||
    southStationIndex === norwoodCentralIndex
  ) {
    return [];
  }

  const startIndex = Math.min(
    southStationIndex,
    norwoodCentralIndex
  );

  const endIndex = Math.max(
    southStationIndex,
    norwoodCentralIndex
  );

  return orderedStops.slice(
    startIndex,
    endIndex + 1
  );
}

/**
 * Convert the selected journey stops
 * into a set of MBTA stop IDs.
 *
 * This can be passed to our existing
 * getMatchingJourneyStopIds() function.
 */
export function getCommuteJourneyStopIds(
  tripStops: TripStop[]
): ReadonlySet<string> {
  return new Set(
    getCommuteJourneyStops(tripStops).map(
      (stop) => stop.stopId
    )
  );
}

/**
 * Build a collection of journey stop IDs
 * including their MBTA parent station IDs.
 *
 * Only stops within the monitored commute
 * are included.
 *
 * Requires verified station information for
 * every scheduled stop in the journey.
 */
export function getCommuteJourneyStopIdsWithParents(
  tripStops: TripStop[],
  stationInfos: StopStationInfo[]
): ReadonlySet<string> {
  const journeyStops = getCommuteJourneyStops(
    tripStops
  );

  if (journeyStops.length === 0) {
    return new Set<string>();
  }

  // Find station information by its exact stop ID.
  const infoByStopId = new Map(
    stationInfos.map((info) => [
      info.stopId,
      info
    ])
  );

  const ids = new Set<string>();

  for (const stop of journeyStops) {
    const info = infoByStopId.get(stop.stopId);

    if (!info) {
      throw new Error(
        `Missing station information for ${stop.stopId}.`
      );
    }

    // Include the scheduled platform stop.
    ids.add(stop.stopId);

    // Also include the verified parent station.
    if (info.parentStationId) {
      ids.add(info.parentStationId);
    }
  }

  return ids;
}
