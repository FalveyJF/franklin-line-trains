
import type {
  MBTAAlert
} from '#lib/api/alerts.ts';

import type {
  AlertPresentationCategory
} from '#lib/alert-presentation.ts';

import {
  classifyAlertPresentation
} from '#lib/alert-presentation.ts';

import {
  assessAlertMatch
} from '#lib/service-disruptions.ts';

import {
  doesAlertOverlapJourney,
  type JourneyTimeWindow
} from '#lib/alert-timing.ts';

export interface TrainAlertSummary {
  alertId: string;
  effect: string;
  heading: string;
  description: string | null;
  category: AlertPresentationCategory;
  matchedStopIds: string[];
}

/**
 * Identify relevant alerts for one train's
 * monitored journey.
 *
 * The results are advisories, not proof
 * of cancellation, delay or bus replacement.
 */
export function getTrainAlertSummaries(
  alerts: MBTAAlert[],
  tripId: string,
  directionId: number,
  journeyStopIds: ReadonlySet<string>,
  journeyWindow: JourneyTimeWindow
): TrainAlertSummary[] {
  const summaries: TrainAlertSummary[] = [];

  for (const alert of alerts) {
    const timingOverlaps =
      doesAlertOverlapJourney(
        alert,
        journeyWindow
      );

    const assessment = assessAlertMatch(
      alert,
      tripId,
      directionId,
      journeyStopIds,
      timingOverlaps
    );

    const category = classifyAlertPresentation(
      alert,
      assessment
    );

    if (category === 'no-match') {
      continue;
    }

    summaries.push({
      alertId: alert.id,
      effect: alert.attributes.effect ?? 'UNKNOWN',
      heading:
        alert.attributes.header?.trim() ||
        alert.attributes.short_header?.trim() ||
        'MBTA service advisory',
      description:
        alert.attributes.description?.trim() || null,
      category,
      matchedStopIds: assessment.matchedStopIds
    });
  }

  return summaries;
}
