
/**
 * Known MBTA parent station and platform IDs.
 *
 * Add additional stations only after their
 * relationships have been verified.
 */
const STATION_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set([
    'place-sstat',
    'NEC-2287'
  ]),
  new Set([
    'place-FB-0148',
    'FB-0148-01',
    'FB-0148-02'
  ])
];

/**
 * Check whether two MBTA stop IDs identify
 * the same known station.
 *
 * An exact ID match always succeeds.
 *
 * For other IDs, only explicitly verified
 * station/platform relationships are accepted.
 */
export function areStopsEquivalent(
  firstStopId: string,
  secondStopId: string
): boolean {
  if (firstStopId === secondStopId) {
    return true;
  }

  return STATION_GROUPS.some(
    (group) =>
      group.has(firstStopId) &&
      group.has(secondStopId)
  );
}

/**
 * Check whether an alert stop matches
 * any stop in the scheduled journey,
 * including known parent/platform equivalents.
 */
export function matchesJourneyStop(
  alertStopId: string,
  journeyStopIds: ReadonlySet<string>
): boolean {
  for (const journeyStopId of journeyStopIds) {
    if (
      areStopsEquivalent(
        alertStopId,
        journeyStopId
      )
    ) {
      return true;
    }
  }

  return false;
}
