
import type {
    MBTAAlert
} from '#lib/api/alerts.ts';

import type {
    MatchedTrain
} from '#lib/api/mbta.ts';

import type {
    TrainAlertSummary
} from '#lib/train-alerts.ts';

import {
    getMatchedTrainJourneyWindow
} from '#lib/train-journey-time.ts';

import {
    doesAlertOverlapJourney
} from '#lib/alert-timing.ts';

import {
    assessAlertMatch
} from '#lib/service-disruptions.ts';

import {
    classifyAlertPresentation
} from '#lib/alert-presentation.ts';

/**
 * Build conservative alert summaries using
 * only the train schedules already loaded.
 *
 * Station-specific matching is intentionally
 * excluded until we have the train's complete
 * journey-stop information.
 */
export function getScheduleBasedAlertSummaries(
    alerts: MBTAAlert[],
    train: MatchedTrain
): TrainAlertSummary[] {
    const window =
        getMatchedTrainJourneyWindow(train);

    if (!window) {
        return [];
    }

    const directionId =
        train.departure.attributes.direction_id;

    const summaries: TrainAlertSummary[] = [];

    for (const alert of alerts) {
        const timingOverlaps =
            doesAlertOverlapJourney(alert, window);

        if (!timingOverlaps) {
            continue;
        }

        const assessment = assessAlertMatch(
            alert,
            train.tripId,
            directionId,
            new Set<string>(),
            timingOverlaps
        );

        // Without journey stops, accept only
        // explicit-trip and route-wide matches.
        if (
            assessment.category !== 'explicit-trip' &&
            assessment.category !== 'route-wide'
        ) {
            continue;
        }

        // A station-specific entity cannot be
        // confirmed from schedule endpoints alone.
        const compatibleEntities =
            alert.attributes.informed_entity.filter(
                (entity) => {
                    if (
                        entity.route &&
                        entity.route !== 'CR-Franklin'
                    ) {
                        return false;
                    }

                    if (
                        entity.direction_id !== undefined &&
                        entity.direction_id !== null &&
                        entity.direction_id !== directionId
                    ) {
                        return false;
                    }

                    if (
                        entity.trip &&
                        entity.trip !== train.tripId
                    ) {
                        return false;
                    }

                    return true;
                }
            );

        // Skip alerts that only have station-scoped
        // entities unless another compatible entity
        // is explicitly trip-scoped or route-wide.
        const hasNonStationEntity =
            compatibleEntities.some(
                (entity) => !entity.stop
            );

        if (!hasNonStationEntity) {
            continue;
        }

        const category = classifyAlertPresentation(
            alert,
            assessment
        );

        if (category === 'no-match') {
            continue;
        }


        summaries.push({
            alertId: alert.id,
            effect:
                alert.attributes.effect ?? 'UNKNOWN',
            heading:
                alert.attributes.header?.trim() ||
                alert.attributes.short_header?.trim() ||
                'MBTA service advisory',
            description:
                alert.attributes.description?.trim() || null,
            category,
            matchedStopIds: []
        });

    }

    return summaries;
}
