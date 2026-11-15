<script lang="ts">
    import { getTripStops, type TripStop } from "#lib/api/mbta.ts";

    import type { TrainWithPredictions } from "#lib/prediction-matching.ts";

    import {
        getCommuteJourneyStops,
        getCommuteJourneyStopIds,
        getCommuteJourneyStopIdsWithParents,
    } from "#lib/journey-stops.ts";

    import { getCommuterRailAlerts } from "#lib/api/alerts.ts";

    import {
        getMatchingJourneyStopIds,
        getCompatibleAlertEntities,
        assessAlertMatch,
    } from "#lib/service-disruptions.ts";

    import {
        areStopsEquivalent,
        matchesJourneyStop,
    } from "#lib/station-matching.ts";

    import {
        getStopStationInfo,
        getStopStationInfos,
        type StopStationInfo,
    } from "#lib/api/stops.ts";

    import {
        getJourneyTimeWindow,
        doesAlertOverlapJourney,
    } from "#lib/alert-timing.ts";

    import { classifyAlertPresentation } from "#lib/alert-presentation.ts";

    import { getTrainAlertSummaries } from "#lib/train-alerts.ts";

    import TrainAlertIndicators from "#lib/TrainAlertIndicators.svelte";

    import type { TrainAlertSummary } from "#lib/train-alerts.ts";

    import { getMatchedTrainJourneyWindow } from "#lib/train-journey-time.ts";

    import { getScheduleBasedAlertSummaries } from "#lib/schedule-alerts.ts";

    let {
        routeId,
        trains,
    }: {
        routeId: string;
        trains: TrainWithPredictions[];
    } = $props();

    let stops = $state<TripStop[]>([]);
    let journeyStops = $state<TripStop[]>([]);

    let loading = $state(false);
    let errorMessage = $state("");

    let inspectedTrainNumber = $state("");
    let inspectedTripId = $state("");

    let inspectedAlertSummaries = $state<TrainAlertSummary[]>([]);

    let selectedTripId = $state("");

    async function inspectSelectedTrain() {
        const first = trains.find(
            (item) => item.train.tripId === selectedTripId,
        )?.train;

        // Step 92: Determine journey times from
        // schedules already loaded by the main page.
        if (first) {
            const matchedWindow = getMatchedTrainJourneyWindow(first);

            if (matchedWindow) {
                const formatter = new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/New_York",
                    dateStyle: "medium",
                    timeStyle: "short",
                });

                console.table([
                    {
                        event: "Scheduled departure",
                        easternTime: formatter.format(matchedWindow.start),
                    },
                    {
                        event: "Scheduled arrival",
                        easternTime: formatter.format(matchedWindow.end),
                    },
                ]);

                console.log(
                    "Step 92 - Scheduled journey minutes:",
                    (matchedWindow.end.getTime() -
                        matchedWindow.start.getTime()) /
                        60000,
                );
            } else {
                console.warn("Step 92 - No valid matched journey window.");
            }
        }

        if (!first || loading) {
            return;
        }

        loading = true;
        errorMessage = "";
        stops = [];
        journeyStops = [];
        inspectedAlertSummaries = [];

        inspectedTrainNumber = first.trainNumber;
        inspectedTripId = first.tripId;

        try {
            const result = await getTripStops(first.tripId);

            stops = result;

            // Step 73: Inspect the scheduled commute time window.
            const journeyWindow = getJourneyTimeWindow(result);

            if (journeyWindow) {
                const easternFormatter = new Intl.DateTimeFormat("en-US", {
                    timeZone: "America/New_York",
                    dateStyle: "medium",
                    timeStyle: "short",
                });

                console.table([
                    {
                        trainNumber: first.trainNumber,
                        event: "Commute departure",
                        easternTime: easternFormatter.format(
                            journeyWindow.start,
                        ),
                    },
                    {
                        trainNumber: first.trainNumber,
                        event: "Commute arrival",
                        easternTime: easternFormatter.format(journeyWindow.end),
                    },
                ]);

                // Use the real Franklin Line alerts.
                const timingAlerts = await getCommuterRailAlerts(routeId);

                console.table(
                    timingAlerts.map((alert) => ({
                        alertId: alert.id,
                        effect: alert.attributes.effect,
                        overlapsJourney: doesAlertOverlapJourney(
                            alert,
                            journeyWindow,
                        ),
                    })),
                );
            } else {
                console.warn(
                    "Step 73: Could not determine commute journey times.",
                );
            }

            // Step 65: Test automatic parent-station lookup.
            // Run only when the inspector button is clicked.
            try {
                const [newmarket, norwoodCentral] = await Promise.all([
                    getStopStationInfo("DB-2265-01"),
                    getStopStationInfo("FB-0148-01"),
                ]);

                console.table([
                    {
                        stopId: newmarket.stopId,
                        name: newmarket.stopName,
                        parentStationId: newmarket.parentStationId,
                    },
                    {
                        stopId: norwoodCentral.stopId,
                        name: norwoodCentral.stopName,
                        parentStationId: norwoodCentral.parentStationId,
                    },
                ]);
            } catch (error) {
                console.error("Parent-station lookup test failed:", error);
            }

            journeyStops = getCommuteJourneyStops(result);

            const journeyStopIds = getCommuteJourneyStopIds(result);

            // Step 68: Retrieve parent-station information
            // for every scheduled stop in this commute.
            try {
                const journeyIds = journeyStops.map((stop) => stop.stopId);

                const stationInfos = await getStopStationInfos(journeyIds);

                const expandedJourneyIds = getCommuteJourneyStopIdsWithParents(
                    result,
                    stationInfos,
                );

                const alertsForExpandedTest =
                    await getCommuterRailAlerts(routeId);

                console.table(
                    alertsForExpandedTest.map((alert) => ({
                        alertId: alert.id,
                        effect: alert.attributes.effect,
                        matchingJourneyStops:
                            getMatchingJourneyStopIds(
                                alert,
                                first.tripId,
                                0,
                                expandedJourneyIds,
                            ).join(", ") || "(none)",
                    })),
                );

                if (journeyWindow) {
                    console.table(
                        alertsForExpandedTest.map((alert) => {
                            const matchedStops = getMatchingJourneyStopIds(
                                alert,
                                first.tripId,
                                0,
                                expandedJourneyIds,
                            );

                            const compatibleEntities =
                                getCompatibleAlertEntities(
                                    alert,
                                    first.tripId,
                                    0,
                                );

                            const hasUnrestrictedStop = compatibleEntities.some(
                                (entity) => entity.stop == null,
                            );

                            return {
                                alertId: alert.id,
                                effect: alert.attributes.effect,
                                overlapsJourney: doesAlertOverlapJourney(
                                    alert,
                                    journeyWindow,
                                ),
                                matchedStops:
                                    matchedStops.join(", ") || "(none)",
                                compatibleRouteWideEntity: hasUnrestrictedStop,
                            };
                        }),
                    );
                }

                // Step 81: Classify alerts against this train's journey.
                if (journeyWindow) {
                    const directionId = first.departure.attributes.direction_id;

                    console.table(
                        alertsForExpandedTest.map((alert) => {
                            const timingOverlaps = doesAlertOverlapJourney(
                                alert,
                                journeyWindow,
                            );

                            const assessment = assessAlertMatch(
                                alert,
                                first.tripId,
                                directionId,
                                expandedJourneyIds,
                                timingOverlaps,
                            );

                            return {
                                alertId: alert.id,
                                effect: alert.attributes.effect,
                                timingOverlaps: assessment.timingOverlaps,
                                matchCategory: assessment.category,
                                matchedStops:
                                    assessment.matchedStopIds.join(", ") ||
                                    "(none)",
                            };
                        }),
                    );
                }

                // Step 83: Verify alert presentation categories.
                if (journeyWindow) {
                    const directionId = first.departure.attributes.direction_id;

                    console.table(
                        alertsForExpandedTest.map((alert) => {
                            const timingOverlaps = doesAlertOverlapJourney(
                                alert,
                                journeyWindow,
                            );

                            const assessment = assessAlertMatch(
                                alert,
                                first.tripId,
                                directionId,
                                expandedJourneyIds,
                                timingOverlaps,
                            );

                            return {
                                alertId: alert.id,
                                effect: alert.attributes.effect,
                                matchCategory: assessment.category,
                                presentationCategory: classifyAlertPresentation(
                                    alert,
                                    assessment,
                                ),
                            };
                        }),
                    );
                }

                // Step 87: Build alert summaries for the selected train.
                if (journeyWindow) {
                    const directionId = first.departure.attributes.direction_id;

                    const trainAlertSummaries = getTrainAlertSummaries(
                        alertsForExpandedTest,
                        first.tripId,
                        directionId,
                        expandedJourneyIds,
                        journeyWindow,
                    );
                    inspectedAlertSummaries = trainAlertSummaries;

                    console.log(
                        "Step 87 - Train alert summary count:",
                        trainAlertSummaries.length,
                    );

                    console.table(
                        trainAlertSummaries.map((summary) => ({
                            alertId: summary.alertId,
                            effect: summary.effect,
                            category: summary.category,
                            heading: summary.heading,
                            matchedStops:
                                summary.matchedStopIds.join(", ") || "(none)",
                        })),
                    );
                }

                // Step 94: Compare schedule-only alert matching.
                const scheduleBasedSummaries = getScheduleBasedAlertSummaries(
                    alertsForExpandedTest,
                    first,
                );

                console.log(
                    "Step 94 - Schedule-based alert count:",
                    scheduleBasedSummaries.length,
                );

                console.table(
                    scheduleBasedSummaries.map((summary) => ({
                        alertId: summary.alertId,
                        effect: summary.effect,
                        category: summary.category,
                        heading: summary.heading,
                    })),
                );

                console.log(
                    "Step 70 - Expanded journey stop ID count:",
                    expandedJourneyIds.size,
                );

                console.table(
                    stationInfos.map((info) => ({
                        platformId: info.stopId,
                        parentStationId: info.parentStationId,
                        platformIncluded: expandedJourneyIds.has(info.stopId),
                        parentIncluded:
                            info.parentStationId !== null &&
                            expandedJourneyIds.has(info.parentStationId),
                    })),
                );

                console.log(
                    "Step 68 - Batch station lookup count:",
                    stationInfos.length,
                );

                console.table(
                    stationInfos.map(
                        (info: StopStationInfo, index: number) => ({
                            sequence: journeyStops[index].stopSequence,
                            stopId: info.stopId,
                            stationName: info.stopName,
                            parentStationId: info.parentStationId,
                        }),
                    ),
                );
            } catch (error) {
                console.error("Step 68 - Batch station lookup failed:", error);
            }

            // Step 62: Verify parent station/platform matching.
            console.table([
                {
                    test: "Norwood Central parent to platform",
                    result: areStopsEquivalent("place-FB-0148", "FB-0148-01"),
                },
                {
                    test: "South Station parent to platform",
                    result: areStopsEquivalent("place-sstat", "NEC-2287"),
                },
                {
                    test: "Different stations",
                    result: areStopsEquivalent("place-FB-0148", "NEC-2287"),
                },
                {
                    test: "Norwood Central parent in journey",
                    result: matchesJourneyStop("place-FB-0148", journeyStopIds),
                },
                {
                    test: "South Station parent in journey",
                    result: matchesJourneyStop("place-sstat", journeyStopIds),
                },
            ]);

            console.log("Full trip stop count:", result.length);

            console.log("Commute journey stop count:", journeyStops.length);

            console.log(
                "Commute journey stop IDs:",
                Array.from(journeyStopIds),
            );

            // Test the known MBTA alerts against this
            // train's actual commute journey.
            const alerts = await getCommuterRailAlerts(routeId);

            const directionId = 0; // Outbound test

            console.table(
                alerts
                    .filter((alert) =>
                        ["1030825", "1043404"].includes(alert.id),
                    )
                    .map((alert) => ({
                        alertId: alert.id,
                        effect: alert.attributes.effect,
                        matchingJourneyStops:
                            getMatchingJourneyStopIds(
                                alert,
                                first.tripId,
                                directionId,
                                journeyStopIds,
                            ).join(", ") || "(none)",
                    })),
            );

            console.table(
                result.map((stop) => ({
                    sequence: stop.stopSequence,
                    stopId: stop.stopId,
                    arrival: stop.arrivalTime,
                    departure: stop.departureTime,
                })),
            );
        } catch (error) {
            console.error("Trip stop inspection failed:", error);

            errorMessage =
                error instanceof Error
                    ? error.message
                    : "Unable to retrieve trip stops.";
        } finally {
            loading = false;
        }
    }
</script>

<section class="inspector">
    <h2>Trip Stop Inspector</h2>

    <p>Retrieve the complete scheduled stop list for the first loaded train.</p>

    <label for="train-selector"> Select train to inspect: </label>

    <select
        id="train-selector"
        bind:value={selectedTripId}
        disabled={loading || trains.length === 0}
    >
        <option value="">Choose a train</option>

        {#each trains as item (item.train.tripId)}
            <option value={item.train.tripId}>
                Train {item.train.trainNumber}
            </option>
        {/each}
    </select>

    <button
        onclick={inspectSelectedTrain}
        disabled={loading || !selectedTripId}
    >
        {loading ? "Retrieving stops..." : "Inspect Selected Train"}
    </button>

    {#if trains.length === 0}
        <p>No trains are currently loaded.</p>
    {/if}

    {#if errorMessage}
        <p class="error" role="alert">
            {errorMessage}
        </p>
    {/if}

    {#if stops.length > 0}
        <p>
            <strong>Train:</strong>
            {inspectedTrainNumber}
        </p>

        <p class="trip-id">
            <strong>Internal trip ID:</strong>
            {inspectedTripId}
        </p>

        <TrainAlertIndicators alerts={inspectedAlertSummaries} />

        <p>
            <strong>Scheduled stops:</strong>
            {stops.length}
        </p>

        <p>
            <strong>Commute journey stops:</strong>
            {journeyStops.length}
        </p>

        <p>
            <strong>Stops outside commute:</strong>
            {stops.length - journeyStops.length}
        </p>

        {#if journeyStops.length > 0}
            <h3>South Station–Norwood Central Journey</h3>

            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Sequence</th>
                            <th>Stop ID</th>
                        </tr>
                    </thead>

                    <tbody>
                        {#each journeyStops as stop (stop.stopSequence)}
                            <tr>
                                <td>{stop.stopSequence}</td>
                                <td>{stop.stopId}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else}
            <p>The complete trip does not contain both commute endpoints.</p>
        {/if}
    {/if}
</section>

<style>
    .inspector {
        margin-top: 24px;
        padding: 16px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        background: #f8fafc;
    }

    h2 {
        margin: 0 0 12px;
        font-size: 18px;
        color: #172554;
    }

    p {
        font-size: 14px;
        line-height: 1.5;
    }

    button {
        padding: 10px 14px;
        border: 0;
        border-radius: 8px;
        background: #1d4ed8;
        color: white;
        font-size: 14px;
        cursor: pointer;
    }

    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .table-container {
        margin-top: 12px;
        overflow-x: auto;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }

    th,
    td {
        padding: 8px;
        border-bottom: 1px solid #cbd5e1;
        text-align: left;
    }

    th {
        background: #e2e8f0;
    }

    .trip-id {
        overflow-wrap: anywhere;
    }

    .error {
        color: #b91c1c;
    }

    label {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
        font-weight: 600;
    }

    select {
        display: block;
        width: 100%;
        max-width: 350px;
        margin-bottom: 12px;
        padding: 10px;
        border: 1px solid #94a3b8;
        border-radius: 8px;
        background: white;
        color: #1f2937;
        font-size: 14px;
    }
</style>
