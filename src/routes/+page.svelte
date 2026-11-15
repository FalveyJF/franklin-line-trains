<script lang="ts">
    import { onMount } from "svelte";

    import { getTrainLookup, type MatchedTrain } from "#lib/api/mbta.ts";

    import {
        NORWOOD_CENTRAL_ID,
        SOUTH_STATION_ID,
        NORTH_STATION_ID,
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

    //    import PredictionInspector from "#lib/PredictionInspector.svelte";
    //import TripStopInspector from "#lib/TripStopInspector.svelte";
    //import AlertInspector from "#lib/AlertInspector.svelte";
    import StationNotices from "#lib/StationNotices.svelte";

    import type { MBTAAlert } from "#lib/api/alerts.ts";

    import TrainCardAlerts from "#lib/TrainCardAlerts.svelte";

    import CommuterRailLineSelector from "#lib/CommuterRailLineSelector.svelte";

    import {
        getCommuterRailRoutes,
        type CommuterRailRoute,
    } from "#lib/api/commuter-routes.ts";

    import {
        getCommuterRailStations,
        type CommuterRailStation,
    } from "#lib/api/commuter-stations.ts";

    import CommuterRailStationSelector from "#lib/CommuterRailStationSelector.svelte";

    // import { runStationDirectionTests } from "#lib/station-direction.test.ts";

    import {
        getCachedCommuterRailRoutePatterns,
        selectRepresentativePatterns,
        lookupStationPair,
        continueStationPairLookup,
        getOrderedCommuterRailStations,
        type CommuterRailRoutePattern,
    } from "#lib/api/route-patterns.ts";

    import type { StationPairLookupResult } from "#lib/api/route-patterns.ts";

    import type { StationPairCoverage } from "#lib/station-direction.ts";

    import { getScheduleDirection } from "#lib/schedule-direction.ts";

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

    let commuterRailRoutes = $state<CommuterRailRoute[]>([]);

    let selectedRouteId = $state("CR-Franklin");

    let routeCatalogError = $state("");

    // Stations belonging to the selected commuter rail line.
    let commuterRailStations = $state<CommuterRailStation[]>([]);

    let stationCatalogError = $state("");

    let stationsLoading = $state(false);

    // Step 175: Initial station selections.
    let selectedOriginStopId = $state("place-FB-0148");
    let selectedDestinationStopId = $state("place-sstat");

    // Step 205: Route patterns for the selected line.
    let commuterRailPatterns = $state<CommuterRailRoutePattern[]>([]);

    // Step 206: Reduced route-pattern candidate list.
    const selectedCommuterRailPatterns = $derived(
        selectRepresentativePatterns(commuterRailPatterns),
    );

    // Step 211: Station-pair lookup state.
    let stationPairLookup = $state<StationPairLookupResult | null>(null);

    let stationPairLookupLoading = $state(false);
    let stationJourneyPendingVerification = $state(false);

    let stationPairLookupError = $state("");

    let stationPairLookupRequestNumber = 0;

    function clearStationPairLookup() {
        // Invalidate any station-pair lookup in progress.
        stationPairLookupRequestNumber++;

        stationPairLookup = null;
        stationPairLookupLoading = false;
        stationPairLookupError = "";
    }

    async function loadStationPairLookup() {
        const routeId = selectedRouteId;
        const originStopId = selectedOriginStopId;
        const destinationStopId = selectedDestinationStopId;

        const patterns = [...selectedCommuterRailPatterns];

        // Do not request trip information until both
        // stations and the pattern catalog are available.
        if (
            !originStopId ||
            !destinationStopId ||
            originStopId === destinationStopId ||
            patterns.length === 0
        ) {
            clearStationPairLookup();
            return;
        }

        const thisRequest = ++stationPairLookupRequestNumber;

        stationPairLookup = null;
        stationPairLookupError = "";
        stationPairLookupLoading = true;

        try {
            const result = await lookupStationPair(
                originStopId,
                destinationStopId,
                patterns,
            );

            // Ignore results if the journey has changed.
            if (
                thisRequest !== stationPairLookupRequestNumber ||
                selectedRouteId !== routeId ||
                selectedOriginStopId !== originStopId ||
                selectedDestinationStopId !== destinationStopId
            ) {
                return;
            }

            stationPairLookup = result;
            stationPairLookupLoading = false;

            // Step 227: Start a train search only when
            // the examined candidate list establishes a
            // consistent direction and is complete.
            if (result.complete && result.coverage.status === "supported") {
                searchVerifiedStationPair();
            }
        } catch (error) {
            if (thisRequest !== stationPairLookupRequestNumber) {
                return;
            }

            stationPairLookupError = "Unable to verify this station pair.";

            stationPairLookupLoading = false;

            console.error("Station-pair lookup failed:", error);
        }
    }

    async function loadMoreStationPairPatterns() {
        const previous = stationPairLookup;

        // Nothing to continue if no initial lookup exists,
        // a lookup is running, or all candidates were examined.
        if (!previous || previous.complete || stationPairLookupLoading) {
            return;
        }

        const routeId = selectedRouteId;
        const originStopId = selectedOriginStopId;
        const destinationStopId = selectedDestinationStopId;
        const patterns = [...selectedCommuterRailPatterns];

        const thisRequest = ++stationPairLookupRequestNumber;

        stationPairLookupLoading = true;
        stationPairLookupError = "";

        try {
            const result = await continueStationPairLookup(
                originStopId,
                destinationStopId,
                patterns,
                previous,
            );

            // Discard results if the selected journey changed.
            if (
                thisRequest !== stationPairLookupRequestNumber ||
                selectedRouteId !== routeId ||
                selectedOriginStopId !== originStopId ||
                selectedDestinationStopId !== destinationStopId
            ) {
                return;
            }

            stationPairLookup = result;
            stationPairLookupLoading = false;

            // Step 228: Search automatically when the
            // continued lookup establishes a direction
            // and finishes the candidate list.
            if (result.complete && result.coverage.status === "supported") {
                searchVerifiedStationPair();
            }
        } catch (error) {
            if (thisRequest !== stationPairLookupRequestNumber) {
                return;
            }

            stationPairLookupLoading = false;
            stationPairLookupError =
                "Unable to examine additional route patterns.";

            console.error("Additional station-pair lookup failed:", error);
        }
    }

    const stationPairCoverage = $derived<StationPairCoverage | null>(
        stationPairLookup?.coverage ?? null,
    );

    // Step 221: Whether both selected stations are valid.
    const stationSelectionReady = $derived(hasValidStationSelection());

    /**
     * Step 223: Direction supported by the route patterns
     * examined for the selected station pair.
     *
     * 0 = outbound
     * 1 = inbound
     * null = direction not yet established
     *
     * Actual schedules must still confirm train service.
     */
    const stationPairSearchDirection = $derived<0 | 1 | null>(
        stationSelectionReady && stationPairCoverage?.status === "supported"
            ? stationPairCoverage.directionId
            : null,
    );

    let routePatternsLoading = $state(false);

    let routePatternsError = $state("");

    let requestNumber = 0;

    let originName = $derived(
        commuterRailStations.find(
            (station) => station.id === selectedOriginStopId,
        )?.name ?? "Select departure station",
    );

    let destinationName = $derived(
        commuterRailStations.find(
            (station) => station.id === selectedDestinationStopId,
        )?.name ?? "Select arrival station",
    );

    function syncStationsWithDirection(selectedDirection: CommuteDirection) {
        clearStationPairLookup();
        const selectedRoute = commuterRailRoutes.find(
            (route) => route.id === selectedRouteId,
        );

        const terminalStopId =
            selectedRoute?.terminal === "north"
                ? NORTH_STATION_ID
                : SOUTH_STATION_ID;

        const origin = selectedOriginStopId;
        const destination = selectedDestinationStopId;

        // If the terminal is already on the correct side,
        // preserve the existing station selections.
        if (selectedDirection === "inbound") {
            if (destination === terminalStopId) {
                return;
            }

            if (origin === terminalStopId) {
                selectedOriginStopId = destination;
                selectedDestinationStopId = origin;
                return;
            }
        } else {
            if (origin === terminalStopId) {
                return;
            }

            if (destination === terminalStopId) {
                selectedOriginStopId = destination;
                selectedDestinationStopId = origin;
                return;
            }
        }

        // If neither station has been selected, initialize
        // only the terminal for the requested direction.
        if (!origin && !destination) {
            if (selectedDirection === "inbound") {
                selectedDestinationStopId = terminalStopId;
            } else {
                selectedOriginStopId = terminalStopId;
            }
        }
    }

    // Step 166: Load all commuter rail lines once.
    $effect(() => {
        let active = true;

        getCommuterRailRoutes()
            .then((routes) => {
                if (active) {
                    commuterRailRoutes = routes;
                    routeCatalogError = "";
                }
            })
            .catch((error) => {
                if (active) {
                    routeCatalogError = "Unable to load commuter rail lines.";

                    console.error("Commuter rail route catalog:", error);
                }
            });

        return () => {
            active = false;
        };
    });

    // Step 174: Load stations whenever the selected line changes.
    $effect(() => {
        const routeId = selectedRouteId;
        let active = true;

        commuterRailStations = [];
        stationCatalogError = "";
        stationsLoading = true;

        getCommuterRailStations(routeId)
            .then((stations) =>
                getOrderedCommuterRailStations(routeId, stations),
            )
            .then((stations) => {
                if (active) {
                    commuterRailStations = stations;

                    stationsLoading = false;

                    // Identify the terminal for the selected line.
                    const selectedRoute = commuterRailRoutes.find(
                        (route) => route.id === routeId,
                    );

                    const terminalStopId =
                        selectedRoute?.terminal === "north"
                            ? NORTH_STATION_ID
                            : SOUTH_STATION_ID;

                    // Only initialize the stations when a route change
                    // has cleared the previous station selections.
                    if (!selectedOriginStopId && !selectedDestinationStopId) {
                        if (direction === "inbound") {
                            selectedDestinationStopId = terminalStopId;
                        } else {
                            selectedOriginStopId = terminalStopId;
                        }
                    }
                }
            })
            .catch((error) => {
                if (active) {
                    stationCatalogError =
                        "Unable to load stations for this line.";
                    stationsLoading = false;

                    console.error("Commuter rail station catalog:", error);
                }
            });

        return () => {
            active = false;
        };
    });

    // Step 205: Load route patterns when the line changes.
    // $effect(() => {
    //     const routeId = selectedRouteId;
    //     let active = true;

    //     commuterRailPatterns = [];
    //     routePatternsError = "";
    //     routePatternsLoading = true;

    //     getCachedCommuterRailRoutePatterns(routeId)
    //         .then((patterns) => {
    //             if (!active) {
    //                 return;
    //             }

    //             commuterRailPatterns = patterns;
    //             routePatternsLoading = false;
    //         })
    //         .catch((error) => {
    //             if (!active) {
    //                 return;
    //             }

    //             routePatternsError = "Unable to load route patterns.";

    //             routePatternsLoading = false;

    //             console.error("Commuter rail route patterns:", error);
    //         });

    //     return () => {
    //         active = false;
    //     };
    // });

    function getSignedDelayMinutes(
        scheduledTime: string | null,
        predictedTime: string | null,
    ): string | null {
        if (!scheduledTime || !predictedTime) {
            return null;
        }

        const scheduled = new Date(scheduledTime).getTime();
        const predicted = new Date(predictedTime).getTime();

        if (!Number.isFinite(scheduled) || !Number.isFinite(predicted)) {
            return null;
        }

        const minutes = Math.round((predicted - scheduled) / 60000);

        if (minutes === 0) {
            return null;
        }

        return minutes > 0 ? `(+${minutes})` : `(${minutes})`;
    }

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
        searchDirectionId: 0 | 1 | null = selectedDirection === "inbound"
            ? 1
            : 0,
    ) {
        // Do not load trains for a newly selected
        // station pair until its direction is verified.
        if (stationJourneyPendingVerification) {
            return;
        }

        const thisRequest = ++requestNumber;

        const requestedRouteId = selectedRouteId;
        const requestedOriginStopId = selectedOriginStopId;
        const requestedDestinationStopId = selectedDestinationStopId;

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

            const trainLookup = await getTrainLookup(
                requestedOriginStopId,
                requestedDestinationStopId,
                searchDirectionId,
                date,
                requestedRouteId,
            );

            const scheduledTrains = trainLookup.trains;

            const detectedScheduleDirection =
                searchDirectionId === null
                    ? getScheduleDirection(scheduledTrains)
                    : null;

            if (detectedScheduleDirection?.status === "ambiguous") {
                throw new Error("Matching trains have conflicting directions.");
            }

            if (
                thisRequest !== requestNumber ||
                direction !== selectedDirection ||
                selectedRouteId !== requestedRouteId ||
                selectedOriginStopId !== requestedOriginStopId ||
                selectedDestinationStopId !== requestedDestinationStopId
            ) {
                return;
            }

            // Update the displayed direction only after confirming
            // this response is still current.
            if (
                searchDirectionId === null &&
                detectedScheduleDirection?.directionId !== null &&
                detectedScheduleDirection?.directionId !== undefined
            ) {
                applyScheduleDirection(detectedScheduleDirection.directionId);
            }

            const departurePredictions = trainLookup.departurePredictions;
            const arrivalPredictions = trainLookup.arrivalPredictions;

            trains = matchTrainPredictions(
                scheduledTrains,
                departurePredictions,
                arrivalPredictions,
            );

            //

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

    /**
     * Check whether enough information is available
     * to search for trains between selected stations.
     *
     * This does not determine travel direction or
     * confirm that a scheduled train exists.
     */
    function hasValidStationSelection(): boolean {
        if (
            !selectedRouteId ||
            !selectedOriginStopId ||
            !selectedDestinationStopId
        ) {
            return false;
        }

        if (selectedOriginStopId === selectedDestinationStopId) {
            return false;
        }

        // Both stations must belong to the
        // currently selected commuter rail line.
        const originAvailable = commuterRailStations.some(
            (station) => station.id === selectedOriginStopId,
        );

        const destinationAvailable = commuterRailStations.some(
            (station) => station.id === selectedDestinationStopId,
        );

        return originAvailable && destinationAvailable;
    }

    /**
     * Step 238: Synchronize the displayed direction
     * with the direction reported by MBTA schedules.
     *
     * Preserve the selected departure and arrival stations.
     *
     * Returns false if no valid direction was supplied.
     */
    function applyScheduleDirection(directionId: 0 | 1 | null): boolean {
        if (directionId === null || !hasValidStationSelection()) {
            return false;
        }

        const scheduledDirection: CommuteDirection =
            directionId === 1 ? "inbound" : "outbound";

        // Update the displayed direction without
        // swapping the selected stations.
        direction = scheduledDirection;

        // Preserve the user's station-based selection
        // instead of reverting to the time-of-day default.
        manualDirectionOverride = true;

        return true;
    }

    /**
     * Step 225: Apply the direction established by
     * route-pattern verification.
     *
     * Preserve the user's selected departure and
     * arrival stations.
     *
     * Returns false when direction is not established.
     */
    function applyVerifiedStationPairDirection(): boolean {
        if (!stationSelectionReady || stationPairSearchDirection === null) {
            return false;
        }

        const verifiedDirection: CommuteDirection =
            stationPairSearchDirection === 1 ? "inbound" : "outbound";

        // Preserve manually selected station pairs.
        // Do not call syncStationsWithDirection().
        direction = verifiedDirection;

        // A station-pair selection overrides the
        // automatic morning/evening commute direction.
        manualDirectionOverride = true;

        return true;
    }

    /**
     * Step 226: Search for trains only when the
     * station-pair lookup establishes a direction.
     *
     * Preserve the user's selected stations.
     */
    function searchVerifiedStationPair(): boolean {
        if (
            !stationSelectionReady ||
            !stationPairLookup ||
            !stationPairLookup.complete ||
            stationPairCoverage?.status !== "supported" ||
            stationPairSearchDirection === null ||
            stationPairLookupLoading
        ) {
            return false;
        }

        // Update Inbound/Outbound without rearranging
        // the selected departure and arrival stations.
        if (!applyVerifiedStationPairDirection()) {
            return false;
        }

        const verifiedDirectionId = stationPairSearchDirection;

        const verifiedDirection: CommuteDirection =
            verifiedDirectionId === 1 ? "inbound" : "outbound";

        // The journey is verified; normal train
        // searches and refreshes may resume.
        stationJourneyPendingVerification = false;

        // Request schedules and predictions for
        // the currently selected station pair.
        void loadData(verifiedDirection, true, verifiedDirectionId);

        return true;
    }

    function selectCommuterRailStation(
        stationType: "origin" | "destination",
        stopId: string,
    ) {
        // Step 220: Departure and arrival must differ.
        const otherStopId =
            stationType === "origin"
                ? selectedDestinationStopId
                : selectedOriginStopId;

        if (stopId && stopId === otherStopId) {
            stationPairLookupError =
                "Departure and arrival must be different stations.";
            return;
        }

        if (stationType === "origin") {
            if (selectedOriginStopId === stopId) {
                return;
            }
            selectedOriginStopId = stopId;
        } else {
            if (selectedDestinationStopId === stopId) {
                return;
            }
            selectedDestinationStopId = stopId;
        }

        // Invalidate outstanding requests for the old journey.
        requestNumber++;

        // Suspend train refreshes until the new
        // station pair has been verified.
        stationJourneyPendingVerification = true;

        clearStationPairLookup();

        // Clear the old train results.
        trains = [];
        lastUpdated = null;
        predictionWarning = "";
        errorMessage = "";

        loading = false;
        refreshing = false;

        // Step 222: Only verify complete station selections.
        // Both stations must belong to the selected line.

        if (hasValidStationSelection()) {
            // Actual MBTA schedules will determine whether
            // the selected journey is inbound or outbound.
            // No representative route-pattern lookup is needed.
            stationJourneyPendingVerification = false;

            void loadData(direction, true, null);
        }
    }

    function selectCommuterRailLine(routeId: string) {
        if (routeId === selectedRouteId) {
            return;
        }

        // Invalidate requests for the previously selected line.
        requestNumber++;

        // Suspend train searches until the new journey is verified.
        stationJourneyPendingVerification = true;

        // Clear the previous station-pair verification.
        clearStationPairLookup();

        // Update the selected commuter rail line.
        selectedRouteId = routeId;

        // Clear stations belonging to the previous line.
        selectedOriginStopId = "";
        selectedDestinationStopId = "";

        // Clear train information from the previous line.
        trains = [];
        lastUpdated = null;
        predictionWarning = "";
        errorMessage = "";

        loading = false;
        refreshing = false;
    }

    function selectDirection(selectedDirection: CommuteDirection) {
        manualDirectionOverride = true;

        const directionChanged = direction !== selectedDirection;

        // Identify the Boston terminal for this line.
        const selectedRoute = commuterRailRoutes.find(
            (route) => route.id === selectedRouteId,
        );

        const terminalStopId =
            selectedRoute?.terminal === "north"
                ? NORTH_STATION_ID
                : SOUTH_STATION_ID;

        // When reversing a journey between two intermediate
        // stations, swap the selected departure and arrival.
        if (
            directionChanged &&
            selectedOriginStopId &&
            selectedDestinationStopId &&
            selectedOriginStopId !== terminalStopId &&
            selectedDestinationStopId !== terminalStopId
        ) {
            const previousOrigin = selectedOriginStopId;

            selectedOriginStopId = selectedDestinationStopId;
            selectedDestinationStopId = previousOrigin;
        }

        direction = selectedDirection;
        syncStationsWithDirection(selectedDirection);

        // Do not search while the new line or station
        // selections are incomplete.
        if (!hasValidStationSelection()) {
            return;
        }

        // The user explicitly selected a direction.
        // Allow normal train retrieval to resume.
        const wasPending = stationJourneyPendingVerification;
        stationJourneyPendingVerification = false;

        // Avoid unnecessary requests when clicking
        // the already-selected direction.
        if (!directionChanged && !wasPending) {
            return;
        }

        // Invalidate any earlier train request.
        requestNumber++;

        trains = [];
        lastUpdated = null;
        predictionWarning = "";
        errorMessage = "";

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
            syncStationsWithDirection(selectedDirection);
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
        syncStationsWithDirection(direction);
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
    <title>Commuter Rail Trains</title>
    <meta
        name="description"
        content="MBTA Franklin Line commuter rail schedules and predictions."
    />
</svelte:head>

<main>
    <header>
        <h1>Commuter Rail Trains</h1>
        <p class="subtitle">MBTA Franklin/Foxboro Line</p>
    </header>

    <!-- Step 219: Incremental station-pair verification -->
    {#if stationPairLookup}
        <div class="station-pair-status">
            {#if stationPairCoverage?.status === "supported"}
                <p>
                    Journey direction verified:
                    {stationPairCoverage.directionId === 1
                        ? "Inbound"
                        : "Outbound"}
                </p>
            {:else if stationPairCoverage?.status === "unverified"}
                <p>Journey not yet verified.</p>
            {:else if stationPairCoverage?.status === "ambiguous"}
                <p>Multiple possible directions found.</p>
            {:else}
                <p>Invalid station selection.</p>
            {/if}

            {#if !stationPairLookup.complete}
                <button
                    type="button"
                    class="check-more-patterns-button"
                    disabled={stationPairLookupLoading}
                    onclick={() => void loadMoreStationPairPatterns()}
                >
                    {stationPairLookupLoading
                        ? "Checking..."
                        : "Check more route patterns"}
                </button>

                <p class="pattern-count">
                    {stationPairLookup.examinedCount} checked,
                    {stationPairLookup.remainingCount} remaining
                </p>
            {/if}
        </div>
    {/if}

    {#if stationPairLookupError}
        <p class="station-pair-error" role="alert">
            {stationPairLookupError}
        </p>
    {/if}

    {#key selectedRouteId}
        <StationNotices
            routeId={selectedRouteId}
            originStationName={originName}
            destinationStationName={destinationName}
            onAlertsUpdated={(alerts) => {
                serviceAlerts = alerts;
            }}
        />
    {/key}

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
        {#if commuterRailRoutes.length > 0}
            <CommuterRailLineSelector
                routes={commuterRailRoutes}
                {selectedRouteId}
                onRouteChange={selectCommuterRailLine}
                disabled={false}
            />
        {:else if routeCatalogError}
            <p role="alert">{routeCatalogError}</p>
        {/if}

        <!-- Step 175: Station selectors -->
        {#if commuterRailStations.length > 0}
            <div class="station-selectors">
                <CommuterRailStationSelector
                    id="departure-station"
                    label="Departure station"
                    stations={commuterRailStations}
                    selectedStopId={selectedOriginStopId}
                    excludeStopId={selectedDestinationStopId}
                    onStationChange={(stopId) => {
                        selectCommuterRailStation("origin", stopId);
                    }}
                    disabled={false}
                />

                <div class="direction-switch">
                    <span class="direction-label">
                        {direction === "inbound" ? "Inbound" : "Outbound"}
                    </span>

                    <button
                        type="button"
                        class="reverse-stations-button"
                        aria-label="Reverse departure and arrival stations"
                        title="Reverse direction"
                        onclick={() =>
                            selectDirection(
                                direction === "inbound"
                                    ? "outbound"
                                    : "inbound",
                            )}
                    >
                        ⇄
                    </button>
                </div>

                <CommuterRailStationSelector
                    id="arrival-station"
                    label="Arrival station"
                    stations={commuterRailStations}
                    selectedStopId={selectedDestinationStopId}
                    excludeStopId={selectedOriginStopId}
                    onStationChange={(stopId) => {
                        selectCommuterRailStation("destination", stopId);
                    }}
                    disabled={false}
                />
            </div>
        {:else if stationsLoading}
            <p>Loading stations...</p>
        {:else if stationCatalogError}
            <p role="alert">{stationCatalogError}</p>
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

                        {@const departureMinutes = getSignedDelayMinutes(
                            item.train.departure.attributes.departure_time,
                            item.departurePrediction?.attributes
                                .departure_time ?? null,
                        )}

                        {@const arrivalMinutes = getSignedDelayMinutes(
                            item.train.arrival.attributes.arrival_time,
                            item.arrivalPrediction?.attributes.arrival_time ??
                                null,
                        )}

                        <article class="train-card">
                            <div class="card-header">
                                <div class="train-heading">
                                    <span class="label">Train</span>
                                    <strong class="train-number">
                                        {item.train.trainNumber}
                                    </strong>
                                    <span class="train-duration">
                                        ({getTravelMinutes(item.train) ?? "—"} min)
                                    </span>

                                    {#if item.train.departure.attributes.pickup_type === 3 || item.train.arrival.attributes.drop_off_type === 3}
                                        <span
                                            class="flag-stop"
                                            title="Flag stop — notify the conductor"
                                            aria-label="Flag stop"
                                        >
                                            🚩
                                        </span>
                                    {/if}
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

                                    <div class="scheduled-time-row">
                                        <strong class="time">
                                            {formatTime(
                                                item.train.departure.attributes
                                                    .departure_time,
                                            )}
                                        </strong>

                                        {#if departureMinutes !== null}
                                            <span
                                                class="delay"
                                                class:late={departureDelay.status ===
                                                    "late"}
                                                class:early={departureDelay.status ===
                                                    "early"}
                                                title={`Departure ${departureMinutes} minutes`}
                                            >
                                                {departureMinutes}
                                            </span>
                                        {/if}
                                    </div>

                                    <span class="time-description">
                                        Scheduled departure
                                    </span>
                                    <!--
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
                                    </div> -->
                                </div>

                                <div class="time-block arrival">
                                    <span class="label">{destinationName}</span>

                                    <div class="scheduled-time-row">
                                        <strong class="time">
                                            {formatTime(
                                                item.train.arrival.attributes
                                                    .arrival_time,
                                            )}
                                        </strong>

                                        {#if arrivalMinutes !== null}
                                            <span
                                                class="delay"
                                                class:late={arrivalDelay.status ===
                                                    "late"}
                                                class:early={arrivalDelay.status ===
                                                    "early"}
                                                title={`Arrival ${arrivalMinutes} minutes`}
                                            >
                                                {arrivalMinutes}
                                            </span>
                                        {/if}
                                    </div>

                                    <span class="time-description">
                                        Scheduled arrival
                                    </span>
                                    <!--
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
                                    </div>-->
                                </div>
                            </div>
                            <!--
                            <div class="card-footer">
                                <span>Scheduled travel time</span>
                                <strong>
                                    {getTravelMinutes(item.train) ?? "—"} min
                                </strong>
                            </div>
-->
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

    <!--
<AlertInspector routeId={selectedRouteId} />
<TripStopInspector
    routeId={selectedRouteId}
    {trains}
/>
-->

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
    /* Align arrival information with the right edge. */
    .time-block.arrival {
        align-items: flex-end;
        text-align: right;
    }

    /* Keep the scheduled arrival and delay together. */
    .time-block.arrival .scheduled-time-row {
        justify-content: flex-end;
    }

    .train-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 16px;
    }

    .train-card {
        padding: 8px 10px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
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
        gap: 3px;
        min-width: 0;
    }

    .arrival {
        text-align: right;
    }

    .label,
    .time-description {
        font-size: 12px;
        color: #64748b;
    }

    .time {
        font-size: 23px;
        color: #172554;
        white-space: nowrap;
    }

    /* .prediction-detail {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed #cbd5e1;
    } */

    /* .predicted-time {
        font-size: 19px;
        color: #172554;
    } */

    /* .unavailable {
        font-size: 13px;
        color: #64748b;
    } */

    .delay {
        font-size: 13px;
        font-weight: 600;
        color: #64748b;
    }

    .delay.late {
        color: #b91c1c;
    }

    .delay.early {
        color: #15803d;
    }

    /* .delay.on-time {
        color: #166534;
    } */

    /* .card-footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid #e2e8f0;
        font-size: 13px;
        color: #475569;
    } */

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

        /* .predicted-time {
            font-size: 17px;
        } */

        .train-card {
            padding: 12 px;
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

    .scheduled-time-row {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 8px;
        min-width: 0;
    }

    .train-duration {
        margin-left: 8px;
        font-size: 13px;
        font-weight: 400;
        color: #64748b;
        white-space: nowrap;
    }

    .train-heading {
        display: flex;
        align-items: baseline;
        gap: 6px;
        flex-wrap: nowrap;
    }

    .train-heading .train-duration {
        margin-left: 0;
    }

    /* Step 175: Compact station selector layout. */

    .station-selectors {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 64px minmax(0, 1fr);
        align-items: end;
        gap: 8px;
        margin-bottom: 12px;
    }

    .direction-switch {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
    }

    .direction-label {
        font-size: 11px;
        font-weight: 600;
        color: #475569;
        white-space: nowrap;
    }

    .reverse-stations-button {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 25px;
        font-weight: 600;
        cursor: pointer;
    }

    .reverse-stations-button:hover {
        background: #dbeafe;
    }

    .reverse-stations-button:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
    }

    /* Step 219: Station-pair verification controls. */
    .station-pair-status {
        margin-bottom: 12px;
        padding: 10px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font-size: 13px;
    }

    .station-pair-status p {
        margin: 0 0 6px;
    }

    .check-more-patterns-button {
        min-height: 40px;
        padding: 8px 12px;
        border: 1px solid #2563eb;
        border-radius: 8px;
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }

    .check-more-patterns-button:disabled {
        opacity: 0.6;
        cursor: wait;
    }

    .station-pair-status .pattern-count {
        margin: 6px 0 0;
        color: #64748b;
        font-size: 12px;
    }

    .station-pair-error {
        color: #b91c1c;
        font-size: 13px;
    }
</style>
