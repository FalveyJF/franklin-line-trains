
import type {
  MBTAAlert,
  MBTAAlertPeriod
} from '#lib/api/alerts.ts';

/**
 * Stop IDs relevant to the two commuter stations.
 *
 * Parent station IDs and platform IDs are different.
 * Additional platform IDs can be added after verification.
 */
const SOUTH_STATION_STOPS = new Set([
  'place-sstat',
  'NEC-2287'
]);

const NORWOOD_CENTRAL_STOPS = new Set([
  'place-FB-0148',
  'FB-0148-01',
  'FB-0148-02'
]);

export type CommuteStation =
  | 'South Station'
  | 'Norwood Central';

export interface StationNotice {
  id: string;
  station: CommuteStation;
  heading: string;
  description: string | null;
  effect: string;
}

/**
 * Determine whether an alert period includes
 * a particular moment.
 *
 * A missing start or end is treated as
 * an open-ended boundary.
 */
function periodContainsTime(
  period: MBTAAlertPeriod,
  now: number
): boolean {
  const start = period.start
    ? new Date(period.start).getTime()
    : Number.NEGATIVE_INFINITY;

  const end = period.end
    ? new Date(period.end).getTime()
    : Number.POSITIVE_INFINITY;

  return (
    !Number.isNaN(start) &&
    !Number.isNaN(end) &&
    start <= now &&
    now < end
  );
}

/**
 * Check whether an alert is active at a
 * particular time.
 */
export function isAlertActive(
  alert: MBTAAlert,
  now: Date = new Date()
): boolean {
  return (alert.attributes.active_period ?? []).some(
    (period) => periodContainsTime(period, now.getTime())
  );
}

/**
 * Return station facilities notices that are
 * currently active and explicitly identify
 * one of our commute stations.
 *
 * This function does NOT classify train delays
 * or cancellations.
 */
export function getActiveStationNotices(
  alerts: MBTAAlert[],
  now: Date = new Date()
): StationNotice[] {
  const notices: StationNotice[] = [];

  for (const alert of alerts) {
    if (alert.attributes.effect !== 'STATION_ISSUE') {
      continue;
    }

    if (!isAlertActive(alert, now)) {
      continue;
    }

    const entities = alert.attributes.informed_entity ?? [];

    const affectedStations = new Set<CommuteStation>();

    for (const entity of entities) {
      const stopId = entity.stop;

      if (!stopId) {
        continue;
      }

      if (SOUTH_STATION_STOPS.has(stopId)) {
        affectedStations.add('South Station');
      }

      if (NORWOOD_CENTRAL_STOPS.has(stopId)) {
        affectedStations.add('Norwood Central');
      }
    }

    for (const station of affectedStations) {
      notices.push({
        id: alert.id,
        station,
        
heading:
  alert.attributes.header?.trim() ||
  alert.attributes.short_header?.trim() ||
  'Station facilities notice',
description:
  alert.attributes.description?.trim() || null,

        effect: alert.attributes.effect
      });
    }
  }

  return notices;
}
