<script lang="ts">
    import { onMount } from "svelte";

    import {
        getInboundTrains,
        getOutboundTrains,
        type MatchedTrain,
    } from "#lib/api/mbta.ts";

    import {
        getStationPredictions,
        NORWOOD_CENTRAL_ID,
        SOUTH_STATION_ID,
    } from "#lib/api/predictions.ts";

    import {
        matchTrainPredictions,
        type TrainWithPredictions,
    } from "#lib/prediction-matching.ts";

    import { calculateDelay } from "#lib/train-delays.ts";

    import {
        getEasternServiceDate,
        formatServiceDate,
        getDefaultDirection,
        type CommuteDirection,
    } from "#lib/eastern-time.ts";

    import type { MBTAPrediction } from "#lib/mbta-types.ts";
    //    import PredictionInspector from "#lib/PredictionInspector.svelte";
    //import TripStopInspector from "#lib/TripStopInspector.svelte";
    //import AlertInspector from "#lib/AlertInspector.svelte";
    import StationNotices from "#lib/StationNotices.svelte";

    import type { MBTAAlert } from "#lib/api/alerts.ts";

    import TrainCardAlerts from "#lib/TrainCardAlerts.svelte";

    const REFRESH_INTERVAL_MS = 60_000;
    const DEPARTURE_GRACE_PERIOD_MS = 15 * 60 * 1000;

    let direction = $state<CommuteDirection>("inbound");
    let directionInitialized = $state(false);
    let manualDirectionOverride = $state(false);

    let serviceDate = $state("");
    let trains = $state<TrainWithPredictions[]>([]);

    let loading = $state(true);
    let refreshing = $state(false);
    let errorMessage = $state("");
    let predictionWarning = $state("");

    let showPastTrains = $state(false);
    let currentTime = $state(Date.now());
    let lastUpdated = $state<number | null>(null);

    // Latest alerts shared by StationNotices.
    let serviceAlerts = $state<MBTAAlert[]>([]);

    let requestNumber = 0;

    let originName = $derived(
        direction === "inbound" ? "Norwood Central" : "South Station",
    );

    let destinationName = $derived(
        direction === "inbound" ? "South Station" : "Norwood Central",
    );

    /**
     * Return the best available departure timestamp.
     *
     * Prefer the MBTA predicted departure when available.
     * Otherwise use the scheduled departure.
     */
    function getExpectedDeparture(item: TrainWithPredictions): string | null {
        return (
            item.departurePrediction?.attributes.departure_time ??
            item.train.departure.attributes.departure_time
        );
    }

    /**
     * Describe how long ago a train's expected departure
     * time passed.
     *
     * This does not confirm the train physically departed.
     */
    function getDeparturePassedMessage(
        item: TrainWithPredictions,
    ): string | null {
        const expectedDeparture = getExpectedDeparture(item);

        if (!expectedDeparture) {
            return null;
        }

        const departureTime = new Date(expectedDeparture).getTime();

        if (!Number.isFinite(departureTime)) {
            return null;
        }

        const elapsedMs = currentTime - departureTime;

        // Only show this message during the 15-minute
        // grace period after the expected departure time.
        if (elapsedMs < 0 || elapsedMs > DEPARTURE_GRACE_PERIOD_MS) {
            return null;
        }

        const elapsedMinutes = Math.floor(elapsedMs / 60000);

        const timeSource = item.departurePrediction?.attributes.departure_time
            ? "Predicted"
            : "Scheduled";

        if (elapsedMinutes === 0) {
            return `${timeSource} departure time just passed`;
        }

        const minuteText = elapsedMinutes === 1 ? "min" : "min";

        return (
            `${timeSource} departure time passed ` +
            `${elapsedMinutes} ${minuteText} ago`
        );
    }

    let displayedTrains = $derived(
        trains
            .filter((item) => {
                const departure = getExpectedDeparture(item);

                if (!departure) {
                    return false;
                }

                return (
                    showPastTrains ||
                    new Date(departure).getTime() + DEPARTURE_GRACE_PERIOD_MS >=
                        currentTime
                );
            })
            .sort((a, b) => {
                const timeA = getExpectedDeparture(a);
                const timeB = getExpectedDeparture(b);

                return (
                    new Date(timeA ?? 0).getTime() -
                    new Date(timeB ?? 0).getTime()
                );
            })
            .slice(0, showPastTrains ? undefined : 10),
    );

    function formatTime(timestamp: string | null): string {
        if (!timestamp) {
            return "Not available";
        }

        return new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        }).format(new Date(timestamp));
    }

    function getTravelMinutes(train: MatchedTrain): number | null {
        const departure = train.departure.attributes.departure_time;

        const arrival = train.arrival.attributes.arrival_time;

        if (!departure || !arrival) {
            return null;
        }

        return Math.round(
            (new Date(arrival).getTime() - new Date(departure).getTime()) /
                60000,
        );
    }

    async function loadData(
        selectedDirection: CommuteDirection,
        fullLoad: boolean,
    ) {
        const thisRequest = ++requestNumber;

        if (fullLoad) {
            loading = true;
            refreshing = false;
        } else {
            refreshing = true;
        }

        errorMessage = "";
        predictionWarning = "";

        try {
            const date = getEasternServiceDate();

            const scheduledTrains =
                selectedDirection === "inbound"
                    ? await getInboundTrains(date)
                    : await getOutboundTrains(date);

            const originStopId =
                selectedDirection === "inbound"
                    ? NORWOOD_CENTRAL_ID
                    : SOUTH_STATION_ID;

            const destinationStopId =
                selectedDirection === "inbound"
                    ? SOUTH_STATION_ID
                    : NORWOOD_CENTRAL_ID;

            const [departureResult, arrivalResult] = await Promise.allSettled([
                getStationPredictions(originStopId),
                getStationPredictions(destinationStopId),
            ]);

            if (
                thisRequest !== requestNumber ||
                direction !== selectedDirection
            ) {
                return;
            }

            let departurePredictions: MBTAPrediction[] = [];
            let arrivalPredictions: MBTAPrediction[] = [];

            if (departureResult.status === "fulfilled") {
                departurePredictions = departureResult.value;
            } else {
                console.error(
                    "Origin predictions failed:",
                    departureResult.reason,
                );
            }

            if (arrivalResult.status === "fulfilled") {
                arrivalPredictions = arrivalResult.value;
            } else {
                console.error(
                    "Destination predictions failed:",
                    arrivalResult.reason,
                );
            }

            if (
                departureResult.status === "rejected" ||
                arrivalResult.status === "rejected"
            ) {
                predictionWarning =
                    "Some real-time predictions could not be retrieved. " +
                    "Scheduled times are still available.";
            }

            trains = matchTrainPredictions(
                scheduledTrains,
                departurePredictions,
                arrivalPredictions,
            );

            // Temporary diagnostic information from Step 25.
            // console.log("MBTA prediction matching diagnostic", {
            //     direction: selectedDirection,
            //     scheduledTrains: scheduledTrains.length,
            //     originPredictions: departurePredictions.length,
            //     destinationPredictions: arrivalPredictions.length,
            //     matchedDeparturePredictions: trains.filter(
            //         (item) => item.departurePrediction !== null,
            //     ).length,
            //     matchedArrivalPredictions: trains.filter(
            //         (item) => item.arrivalPrediction !== null,
            //     ).length,
            // });

            console.table(
                trains
                    .filter(
                        (item) =>
                            item.departurePrediction !== null ||
                            item.arrivalPrediction !== null,
                    )
                    .map((item) => ({
                        train: item.train.trainNumber,
                        tripId: item.train.tripId,
                        predictedDeparture:
                            item.departurePrediction?.attributes
                                .departure_time ?? "Not supplied",
                        predictedArrival:
                            item.arrivalPrediction?.attributes.arrival_time ??
                            "Not supplied",
                    })),
            );

            serviceDate = date;
            currentTime = Date.now();
            lastUpdated = Date.now();
        } catch (error) {
            console.error("MBTA schedule loading error:", error);

            if (thisRequest === requestNumber) {
                errorMessage = fullLoad
                    ? "Unable to retrieve train schedules."
                    : "Refresh failed. Showing the last available information.";
            }
        } finally {
            if (thisRequest === requestNumber) {
                loading = false;
                refreshing = false;
            }
        }
    }

    function selectDirection(selectedDirection: CommuteDirection) {
        manualDirectionOverride = true;

        if (direction === selectedDirection) {
            return;
        }

        direction = selectedDirection;
        trains = [];
        lastUpdated = null;
        predictionWarning = "";

        void loadData(selectedDirection, true);
    }

    function refreshSchedule() {
        currentTime = Date.now();

        const today = getEasternServiceDate();

        const selectedDirection = manualDirectionOverride
            ? direction
            : getDefaultDirection();

        const dateChanged = today !== serviceDate;
        const directionChanged = selectedDirection !== direction;

        if (dateChanged || directionChanged) {
            direction = selectedDirection;
            serviceDate = today;
            trains = [];
            lastUpdated = null;
            predictionWarning = "";

            void loadData(selectedDirection, true);
            return;
        }

        if (loading || refreshing) {
            return;
        }

        void loadData(direction, false);
    }

    onMount(() => {
        serviceDate = getEasternServiceDate();
        direction = getDefaultDirection();
        directionInitialized = true;

        void loadData(direction, true);

        const timer = window.setInterval(refreshSchedule, REFRESH_INTERVAL_MS);

        return () => {
            window.clearInterval(timer);
            requestNumber++;
        };
    });
</script>

<svelte:head>
    <title>Franklin Line Trains</title>
    <meta
        name="description"
        content="MBTA Franklin Line commuter rail schedules and predictions."
    />
</svelte:head>

<main>
    <header>
        <h1>Franklin Line Trains</h1>
        <p class="subtitle">MBTA Franklin/Foxboro Line</p>
    </header>

    <StationNotices
        onAlertsUpdated={(alerts) => {
            serviceAlerts = alerts;
            // Development diagnostic:
            // console.log(
            //     "Step 90 - Shared MBTA alert count:",
            //     serviceAlerts.length,
            // );
        }}
    />

    <section class="schedule-section">
        <h2>Train Direction</h2>

        <div class="direction-buttons">
            <button
                type="button"
                class:active={direction === "inbound"}
                aria-pressed={direction === "inbound"}
                disabled={!directionInitialized}
                onclick={() => selectDirection("inbound")}
            >
                Inbound
            </button>

            <button
                type="button"
                class:active={direction === "outbound"}
                aria-pressed={direction === "outbound"}
                disabled={!directionInitialized}
                onclick={() => selectDirection("outbound")}
            >
                Outbound
            </button>
        </div>

        <div class="route-description">
            <strong>{originName}</strong>
            <span aria-hidden="true">→</span>
            <strong>{destinationName}</strong>
        </div>

        {#if serviceDate}
            <p class="date">
                Service date: {formatServiceDate(serviceDate)}
            </p>
        {/if}

        <label class="test-option">
            <input type="checkbox" bind:checked={showPastTrains} />
            Show past trains (testing)
        </label>

        {#if loading}
            <p class="message">Loading train schedules...</p>
        {:else}
            {#if errorMessage}
                <p class="error" role="alert">{errorMessage}</p>
            {/if}

            {#if predictionWarning}
                <p class="warning" role="status">
                    {predictionWarning}
                </p>
            {/if}

            {#if displayedTrains.length === 0}
                <p class="message">
                    No matching {direction} trains were found for the selected time
                    period.
                </p>
            {:else}
                <p class="count">
                    Showing {displayedTrains.length}
                    of {trains.length} matched trains
                </p>

                <div class="train-list">
                    {#each displayedTrains as item (item.train.tripId)}
                        {@const departureDelay = calculateDelay(
                            item.train.departure.attributes.departure_time,
                            item.departurePrediction?.attributes
                                .departure_time ?? null,
                        )}

                        {@const arrivalDelay = calculateDelay(
                            item.train.arrival.attributes.arrival_time,
                            item.arrivalPrediction?.attributes.arrival_time ??
                                null,
                        )}

                        <article class="train-card">
                            <div class="card-header">
                                <div>
                                    <span class="label">Train</span>
                                    <strong class="train-number">
                                        {item.train.trainNumber}
                                    </strong>
                                </div>

                                <span class="direction-label">
                                    {direction === "inbound"
                                        ? "Inbound"
                                        : "Outbound"}
                                </span>
                            </div>

                            {#if getDeparturePassedMessage(item)}
                                <div class="departure-warning" role="status">
                                    <strong>
                                        {getDeparturePassedMessage(item)}
                                    </strong>
                                    <span>
                                        Actual departure has not been confirmed.
                                    </span>
                                </div>
                            {/if}

                            <div class="times">
                                <div class="time-block">
                                    <span class="label">{originName}</span>

                                    <strong class="time">
                                        {formatTime(
                                            item.train.departure.attributes
                                                .departure_time,
                                        )}
                                    </strong>

                                    <span class="time-description">
                                        Scheduled departure
                                    </span>

                                    <div class="prediction-detail">
                                        <span class="prediction-label">
                                            Predicted departure
                                        </span>

                                        {#if departureDelay.status !== "unavailable"}
                                            <strong class="predicted-time">
                                                {formatTime(
                                                    item.departurePrediction
                                                        ?.attributes
                                                        .departure_time ?? null,
                                                )}
                                            </strong>
                                        {:else}
                                            <span class="unavailable"
                                                >Not available</span
                                            >
                                        {/if}

                                        <span
                                            class="delay"
                                            class:late={departureDelay.status ===
                                                "late"}
                                            class:early={departureDelay.status ===
                                                "early"}
                                            class:on-time={departureDelay.status ===
                                                "on-time"}
                                        >
                                            {departureDelay.label}
                                        </span>
                                    </div>
                                </div>

                                <div class="time-block arrival">
                                    <span class="label">{destinationName}</span>

                                    <strong class="time">
                                        {formatTime(
                                            item.train.arrival.attributes
                                                .arrival_time,
                                        )}
                                    </strong>

                                    <span class="time-description">
                                        Scheduled arrival
                                    </span>

                                    <div class="prediction-detail">
                                        <span class="prediction-label">
                                            Predicted arrival
                                        </span>

                                        {#if arrivalDelay.status !== "unavailable"}
                                            <strong class="predicted-time">
                                                {formatTime(
                                                    item.arrivalPrediction
                                                        ?.attributes
                                                        .arrival_time ?? null,
                                                )}
                                            </strong>
                                        {:else}
                                            <span class="unavailable"
                                                >Not available</span
                                            >
                                        {/if}

                                        <span
                                            class="delay"
                                            class:late={arrivalDelay.status ===
                                                "late"}
                                            class:early={arrivalDelay.status ===
                                                "early"}
                                            class:on-time={arrivalDelay.status ===
                                                "on-time"}
                                        >
                                            {arrivalDelay.label}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div class="card-footer">
                                <span>Scheduled travel time</span>
                                <strong>
                                    {getTravelMinutes(item.train) ?? "—"} min
                                </strong>
                            </div>

                            <TrainCardAlerts
                                train={item.train}
                                alerts={serviceAlerts}
                            />
                        </article>
                    {/each}
                </div>
            {/if}
        {/if}
    </section>

    <!--<PredictionInspector {direction} {trains} /> -->
    <!-- <AlertInspector /> -->
    <!-- <TripStopInspector {trains} /> -->

    <footer class="status">
        {#if refreshing}
            <span>Refreshing schedules and predictions...</span>
        {:else if lastUpdated !== null}
            <span>
                Last updated:
                {formatTime(new Date(lastUpdated).toISOString())}
            </span>
        {:else}
            <span>Waiting for train information</span>
        {/if}

        <p>
            Information refreshes every 60 seconds. Delay labels compare
            scheduled and predicted times.
        </p>

        {#if manualDirectionOverride}
            <p>
                Manual direction selected. Reload the page to restore automatic
                selection.
            </p>
        {/if}
    </footer>
</main>

<style>
    :global(*) {
        box-sizing: border-box;
    }

    :global(body) {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        background: #f4f6f8;
        color: #1f2937;
    }

    main {
        max-width: 600px;
        margin: 0 auto;
        padding: 24px 16px;
    }

    h1 {
        margin: 0 0 8px;
        font-size: 30px;
        color: #172554;
    }

    .subtitle,
    .date,
    .count,
    .status {
        color: #64748b;
    }

    .subtitle {
        margin: 0;
    }

    .schedule-section {
        margin-top: 28px;
    }

    h2 {
        font-size: 22px;
        margin-bottom: 16px;
    }

    .direction-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 20px;
    }

    .direction-buttons button {
        min-height: 48px;
        padding: 12px;
        border: 2px solid #cbd5e1;
        border-radius: 10px;
        background: white;
        color: #334155;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
    }

    .direction-buttons button.active {
        border-color: #1d4ed8;
        background: #1d4ed8;
        color: white;
    }

    .direction-buttons button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .direction-buttons button:focus-visible {
        outline: 3px solid #f59e0b;
        outline-offset: 2px;
    }

    .route-description {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 16px;
    }

    .date,
    .count,
    .status {
        font-size: 14px;
        line-height: 1.5;
    }

    .test-option {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 20px 0;
        font-size: 14px;
        cursor: pointer;
    }

    .test-option input {
        width: 20px;
        height: 20px;
    }

    .train-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-top: 16px;
    }

    .train-card {
        padding: 18px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
    }

    .train-number {
        display: block;
        font-size: 28px;
        color: #172554;
    }

    .direction-label {
        padding: 6px 10px;
        border-radius: 6px;
        background: #dbeafe;
        color: #1e40af;
        font-size: 12px;
        font-weight: bold;
    }

    .times {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 12px;
    }

    .time-block {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
    }

    .arrival {
        text-align: right;
    }

    .label,
    .time-description,
    .prediction-label {
        font-size: 12px;
        color: #64748b;
    }

    .time {
        font-size: 23px;
        color: #172554;
        white-space: nowrap;
    }

    .prediction-detail {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed #cbd5e1;
    }

    .predicted-time {
        font-size: 19px;
        color: #172554;
    }

    .unavailable {
        font-size: 13px;
        color: #64748b;
    }

    .delay {
        font-size: 13px;
        font-weight: 600;
        color: #64748b;
    }

    .delay.late {
        color: #b91c1c;
    }

    .delay.early {
        color: #1d4ed8;
    }

    .delay.on-time {
        color: #166534;
    }

    .card-footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-top: 20px;
        padding-top: 12px;
        border-top: 1px solid #e2e8f0;
        font-size: 13px;
        color: #475569;
    }

    .message,
    .error,
    .warning {
        margin-top: 20px;
        padding: 16px;
        background: white;
        border-radius: 12px;
    }

    .error {
        color: #b91c1c;
    }

    .warning {
        color: #92400e;
    }

    .status {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #cbd5e1;
    }

    .status p {
        margin: 8px 0;
    }

    @media (max-width: 380px) {
        .time {
            font-size: 19px;
        }

        .predicted-time {
            font-size: 17px;
        }

        .train-card {
            padding: 14px;
        }
    }

    .departure-warning {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-bottom: 16px;
        padding: 12px;
        border: 1px solid #fbbf24;
        border-radius: 8px;
        background: #fffbeb;
        color: #92400e;
    }

    .departure-warning strong {
        font-size: 14px;
    }

    .departure-warning span {
        font-size: 12px;
        line-height: 1.4;
    }
</style>
