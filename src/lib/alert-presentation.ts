
import type {
  MBTAAlert
} from '#lib/api/alerts.ts';

import type {
  AlertMatchAssessment
} from '#lib/service-disruptions.ts';

export type AlertPresentationCategory =
  | 'station-notice'
  | 'general-advisory'
  | 'potential-disruption'
  | 'no-match';

/**
 * Decide how an MBTA alert should be presented
 * based on its effect and journey matching.
 *
 * This function does not confirm that a train
 * is delayed, canceled, or replaced by a bus.
 */
export function classifyAlertPresentation(
  alert: MBTAAlert,
  assessment: AlertMatchAssessment
): AlertPresentationCategory {
  if (assessment.category === 'no-match') {
    return 'no-match';
  }

  const effect = alert.attributes.effect;

  // Facilities and station construction notices
  // must not be displayed as train delays.
  if (effect === 'STATION_ISSUE') {
    return 'station-notice';
  }

  // A schedule change may describe broad
  // construction plans and specific operating
  // hours not encoded in the active period.
  if (effect === 'SCHEDULE_CHANGE') {
    return 'general-advisory';
  }

  // A route-wide disruption alert alone does not
  // establish that this individual train is
  // delayed, canceled, or replaced.
  if (assessment.category === 'route-wide') {
    return 'general-advisory';
  }

  // Explicit trip or journey-stop matches for
  // operational disruptions merit closer review.
  if (
    effect === 'DELAY' ||
    effect === 'CANCELLATION' ||
    effect === 'SHUTTLE'
  ) {
    return 'potential-disruption';
  }

  // Other matched effects remain general advisories
  // until we establish their operational meaning.
  return 'general-advisory';
}
