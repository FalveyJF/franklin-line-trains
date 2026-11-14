
import type {
  MBTAAlert
} from '#lib/api/alerts.ts';

import {
  isAlertActive
} from '#lib/alert-filtering.ts';

import {
  matchesJourneyStop
} from '#lib/station-matching.ts';

/**
 * Known MBTA parent station and platform IDs
 * for our two commute endpoints.
 */
const COMMUTE_STATION_STOPS = {
  'South Station': new Set([
    'place-sstat',
    'NEC-2287'
  ]),
  'Norwood Central': new Set([
    'place-FB-0148',
    'FB-0148-01',
    'FB-0148-02'
  ])
};

export type CommuteEndpoint =
  | 'South Station'
  | 'Norwood Central';

export interface UpcomingShuttleNotice {
  id: string;
  heading: string;
  description: string | null;
  startsAt: Date;
}

/**
 * Find the earliest future active-period start
 * for an alert.
 */
function getNextStart(
  alert: MBTAAlert,
  now: Date
): Date | null {
  const futureStarts = (
    alert.attributes.active_period ?? []
  )
    .filter((period) => period.start !== null)
    .map((period) => new Date(period.start!))
    .filter(
      (date) =>
        !Number.isNaN(date.getTime()) &&
        date.getTime() > now.getTime()
    )
    .sort((a, b) => a.getTime() - b.getTime());

  return futureStarts[0] ?? null;
}

/**
 * Return upcoming Franklin Line shuttle alerts
 * beginning within the next seven days.
 *
 * These are line-level advisories.
 * They must not automatically be treated
 * as disruptions to individual train trips.
 */
export function getUpcomingShuttleNotices(
  alerts: MBTAAlert[],
  now: Date = new Date()
): UpcomingShuttleNotice[] {
  const sevenDaysFromNow =
    now.getTime() + 7 * 24 * 60 * 60 * 1000;

  const notices: UpcomingShuttleNotice[] = [];

  for (const alert of alerts) {
    if (alert.attributes.effect !== 'SHUTTLE') {
      continue;
    }

    // An alert already active is not "upcoming".
    if (isAlertActive(alert, now)) {
      continue;
    }

    const startsAt = getNextStart(alert, now);

    if (!startsAt) {
      continue;
    }

    if (startsAt.getTime() > sevenDaysFromNow) {
      continue;
    }

    notices.push({
      id: alert.id,
      heading:
        alert.attributes.header?.trim() ||
        alert.attributes.short_header?.trim() ||
        'Upcoming shuttle service',
      description:
        alert.attributes.description?.trim() || null,
      startsAt
    });
  }

  return notices.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime()
  );
}

/**
 * Identify our commute endpoint stations explicitly
 * named in an alert's affected entities.
 *
 * This checks stop IDs only. It does not determine
 * whether a train is delayed, canceled, or replaced.
 */
export function getAffectedCommuteEndpoints(
  alert: MBTAAlert
): CommuteEndpoint[] {
  const affected = new Set<CommuteEndpoint>();

  const entities =
    alert.attributes.informed_entity ?? [];

  for (const entity of entities) {
    const stopId = entity.stop;

    if (!stopId) {
      continue;
    }

    if (COMMUTE_STATION_STOPS['South Station'].has(stopId)) {
      affected.add('South Station');
    }

    if (COMMUTE_STATION_STOPS['Norwood Central'].has(stopId)) {
      affected.add('Norwood Central');
    }
  }

  return Array.from(affected);
}


/**
 * Check whether an MBTA alert explicitly
 * identifies a particular trip ID.
 *
 * A false result does NOT mean the train
 * is unaffected. The alert might instead
 * identify a route, station, or direction.
 */
export function hasExplicitTripMatch(
  alert: MBTAAlert,
  tripId: string
): boolean {
  const entities =
    alert.attributes.informed_entity ?? [];

  return entities.some(
    (entity) => entity.trip === tripId
  );
}

/**
 * List the individual trip IDs explicitly
 * mentioned by an alert.
 *
 * Duplicate IDs are removed.
 */
export function getExplicitAlertTripIds(
  alert: MBTAAlert
): string[] {
  const tripIds = new Set<string>();

  for (
    const entity of
    alert.attributes.informed_entity ?? []
  ) {
    if (entity.trip) {
      tripIds.add(entity.trip);
    }
  }

  return Array.from(tripIds);
}

/**
 * Check whether an alert entity's route,
 * direction and trip restrictions are
 * compatible with a given Franklin Line train.
 *
 * A missing restriction means that the entity
 * does not limit matching by that field.
 *
 * This function does NOT check affected stops,
 * service dates or alert activities.
 */
export function isAlertEntityCompatibleWithTrain(
  entity: {
    route?: string | null;
    direction_id?: number | null;
    trip?: string | null;
  },
  tripId: string,
  directionId: number
): boolean {
  // This application only handles the Franklin Line.
  if (
    entity.route != null &&
    entity.route !== 'CR-Franklin'
  ) {
    return false;
  }

  // An explicit direction must match.
  if (
    entity.direction_id != null &&
    entity.direction_id !== directionId
  ) {
    return false;
  }

  // An explicitly named trip must match.
  if (
    entity.trip != null &&
    entity.trip !== tripId
  ) {
    return false;
  }

  return true;
}

/**
 * Return alert entities compatible with the
 * train's route, direction and trip ID.
 *
 * A returned entity is only a candidate.
 * It may refer to a stop outside the journey,
 * or an inactive alert.
 */
export function getCompatibleAlertEntities(
  alert: MBTAAlert,
  tripId: string,
  directionId: number
) {
  return (
    alert.attributes.informed_entity ?? []
  ).filter((entity) =>
    isAlertEntityCompatibleWithTrain(
      entity,
      tripId,
      directionId
    )
  );
}

/**
 * Check whether an alert explicitly identifies
 * a stop in the supplied set of journey stops.
 *
 * The route, direction and trip restrictions
 * must also be compatible with the train.
 *
 * This function does NOT check active periods
 * or classify the effect as a cancellation,
 * delay or shuttle replacement.
 */
export function getMatchingJourneyStopIds(
  alert: MBTAAlert,
  tripId: string,
  directionId: number,
  journeyStopIds: ReadonlySet<string>
): string[] {
  const matchedStops = new Set<string>();

  const entities = getCompatibleAlertEntities(
    alert,
    tripId,
    directionId
  );

  for (const entity of entities) {
    const stopId = entity.stop;


if (
  stopId != null &&
  matchesJourneyStop(stopId, journeyStopIds)
) {
  matchedStops.add(stopId);
}

  }

  return Array.from(matchedStops);
}

/**
 * A general Franklin Line schedule advisory.
 *
 * This does not imply that every train
 * on the line is affected.
 */
export interface LineScheduleAdvisory {
  id: string;
  heading: string;
  description: string | null;
  effect: string;
}

/**
 * Retrieve current schedule-change advisories.
 *
 * These are general line notices, not
 * confirmed disruptions to specific trains.
 */
export function getActiveLineScheduleAdvisories(
  alerts: MBTAAlert[],
  now: Date = new Date()
): LineScheduleAdvisory[] {
  const advisories: LineScheduleAdvisory[] = [];

  for (const alert of alerts) {
    if (
      alert.attributes.effect !== 'SCHEDULE_CHANGE'
    ) {
      continue;
    }

    if (!isAlertActive(alert, now)) {
      continue;
    }

    advisories.push({
      id: alert.id,
      heading:
        alert.attributes.header?.trim() ||
        alert.attributes.short_header?.trim() ||
        'Franklin Line schedule change',
      description:
        alert.attributes.description?.trim() || null,
      effect: alert.attributes.effect
    });
  }

  return advisories;
}

export type AlertMatchCategory =
  | 'explicit-trip'
  | 'journey-stop'
  | 'route-wide'
  | 'no-match';

export interface AlertMatchAssessment {
  category: AlertMatchCategory;
  matchedStopIds: string[];
  timingOverlaps: boolean;
}

/**
 * Assess how an alert matches a train journey.
 *
 * This does not determine whether the train
 * is delayed, canceled or replaced by a bus.
 */
export function assessAlertMatch(
  alert: MBTAAlert,
  tripId: string,
  directionId: number,
  journeyStopIds: ReadonlySet<string>,
  timingOverlaps: boolean
): AlertMatchAssessment {
  if (!timingOverlaps) {
    return {
      category: 'no-match',
      matchedStopIds: [],
      timingOverlaps: false
    };
  }

  const entities = getCompatibleAlertEntities(
    alert,
    tripId,
    directionId
  );

  if (entities.length === 0) {
    return {
      category: 'no-match',
      matchedStopIds: [],
      timingOverlaps: true
    };
  }

  // Trip-specific entities have priority.
  if (
    entities.some(
      (entity) => entity.trip === tripId
    )
  ) {
    return {
      category: 'explicit-trip',
      matchedStopIds: [],
      timingOverlaps: true
    };
  }

  const matchedStopIds =
    getMatchingJourneyStopIds(
      alert,
      tripId,
      directionId,
      journeyStopIds
    );

  if (matchedStopIds.length > 0) {
    return {
      category: 'journey-stop',
      matchedStopIds,
      timingOverlaps: true
    };
  }

  if (
    entities.some(
      (entity) => entity.stop == null
    )
  ) {
    return {
      category: 'route-wide',
      matchedStopIds: [],
      timingOverlaps: true
    };
  }

  return {
    category: 'no-match',
    matchedStopIds: [],
    timingOverlaps: true
  };
}
