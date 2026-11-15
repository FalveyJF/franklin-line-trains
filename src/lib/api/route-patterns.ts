

import {
    getStationPairCoverage,
    type OrderedRoutePattern,
    type StationPairCoverage
} from "#lib/station-direction.ts";

import {
    orderCommuterRailStations,
    type CommuterRailStation
} from "#lib/api/commuter-stations.ts";


const MBTA_API_BASE = "https://api-v3.mbta.com";

export interface CommuterRailRoutePattern {
    id: string;
    directionId: number;
    name: string;
    representativeTripId: string;
}

interface APIRoutePattern {
    id: string;
    attributes: {
        direction_id: number;
        name: string;
    };

    relationships: {
        route: {
            data: {
                id: string;
            } | null;
        };
        representative_trip?: {
            data: {
                id: string;
            } | null;
        };
    };

}

/**
 * Retrieve the travel patterns for one commuter
 * rail line, including its branches and directions.
 *
 * Each pattern identifies a representative trip.
 * We can later retrieve that trip's ordered stops
 * using the existing getTripStops() function.
 */
export async function getCommuterRailRoutePatterns(
    routeId: string
): Promise<CommuterRailRoutePattern[]> {
    if (!routeId.trim()) {
        throw new Error("A commuter rail route ID is required.");
    }

    const url = new URL(
        `${MBTA_API_BASE}/route_patterns`
    );


    url.searchParams.set("filter[route]", routeId);
    url.searchParams.set("page[limit]", "100");
    url.searchParams.set(
        "include",
        "representative_trip.stops"
    );

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Unable to retrieve route patterns: HTTP ${response.status}`
        );
    }


    const json: {
        data: APIRoutePattern[];
        included?: Array<{
            id: string;
            type: string;
            relationships?: {
                stops?: {
                    data: Array<{ id: string; type: string }>;
                };
                parent_station?: {
                    data: { id: string } | null;
                };
            };
        }>;
        links?: {
            next?: string | null;
        };
    } = await response.json();

    if (json.links?.next) {
        throw new Error(
            "Route patterns have additional pages."
        );
    }

    const included = json.included ?? [];

    // Map platform-level stops to parent stations.
    const parentStationByStop = new Map<string, string>();

    for (const resource of included) {
        if (resource.type !== "stop") continue;

        parentStationByStop.set(
            resource.id,
            resource.relationships?.parent_station?.data?.id ??
            resource.id
        );
    }

    // Cache the ordered stations of each included trip.
    for (const resource of included) {
        if (resource.type !== "trip") continue;

        const stops = resource.relationships?.stops?.data ?? [];

        if (stops.length === 0) continue;

        // Don't cache incomplete station sequences.
        if (stops.some((stop) => !parentStationByStop.has(stop.id))) {
            continue;
        }

        const stationIds: string[] = [];

        for (const stop of stops) {
            const stationId = parentStationByStop.get(stop.id)!;

            if (stationIds.at(-1) !== stationId) {
                stationIds.push(stationId);
            }
        }

        if (stationIds.length >= 2) {
            representativeTripStationCache.set(
                resource.id,
                Promise.resolve(stationIds)
            );
        }
    }


    return json.data
        .filter(
            (pattern) =>
                pattern.relationships.route?.data?.id === routeId &&
                Boolean(
                    pattern.relationships.representative_trip
                        ?.data?.id
                )
        )

        .map((pattern) => ({
            id: pattern.id,
            directionId: pattern.attributes.direction_id,
            name: pattern.attributes.name,
            representativeTripId:
                pattern.relationships.representative_trip!
                    .data!.id
        }));
}

/**
 * Retrieve the parent station IDs in travel order
 * for a representative trip.
 *
 * The MBTA trip returns platform-level stop IDs.
 * Our station selectors use parent station IDs.
 */
export async function getRepresentativeTripStations(
    tripId: string
): Promise<string[]> {
    if (!tripId.trim()) {
        throw new Error("A representative trip ID is required.");
    }

    const url = new URL(
        `${MBTA_API_BASE}/trips/${encodeURIComponent(tripId)}`
    );

    url.searchParams.set("include", "stops");

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Unable to retrieve representative trip: HTTP ${response.status}`
        );
    }

    interface TripStopReference {
        id: string;
        type: string;
    }

    interface IncludedStop {
        id: string;
        relationships?: {
            parent_station?: {
                data: {
                    id: string;
                } | null;
            };
        };
    }

    const json: {
        data: {
            relationships: {
                stops?: {
                    data: TripStopReference[];
                };
            };
        };
        included?: IncludedStop[];
    } = await response.json();

    const orderedStops =
        json.data.relationships.stops?.data ?? [];

    const parentStationByStop = new Map(
        (json.included ?? []).map((stop) => [
            stop.id,
            stop.relationships?.parent_station?.data?.id ??
            stop.id
        ])
    );

    const stationIds: string[] = [];

    for (const stop of orderedStops) {
        const stationId = parentStationByStop.get(stop.id);

        if (!stationId) {
            throw new Error(
                `Missing station details for stop ${stop.id}`
            );
        }

        // Avoid consecutive duplicate stations.
        if (stationIds.at(-1) !== stationId) {
            stationIds.push(stationId);
        }
    }

    if (stationIds.length === 0) {
        throw new Error(
            `No ordered stations returned for trip ${tripId}`
        );
    }

    return stationIds;
}

/**
 * A route pattern with its ordered station IDs
 * and identifying information.
 */
export interface ResolvedRoutePattern
    extends OrderedRoutePattern {
    patternId: string;
    name: string;
}

/**
 * Combine route patterns with previously retrieved
 * ordered station sequences.
 *
 * Only patterns whose station lists are available
 * are included.
 *
 * This function makes no MBTA API requests.
 */
export function combineRoutePatternStations(
    patterns: CommuterRailRoutePattern[],
    stationsByTrip: ReadonlyMap<string, string[]>
): ResolvedRoutePattern[] {
    const resolved: ResolvedRoutePattern[] = [];

    for (const pattern of patterns) {
        const stationIds = stationsByTrip.get(
            pattern.representativeTripId
        );

        if (!stationIds || stationIds.length < 2) {
            continue;
        }

        resolved.push({
            patternId: pattern.id,
            name: pattern.name,
            directionId: pattern.directionId,
            stationIds: [...stationIds]
        });
    }

    return resolved;
}

// Cache representative-trip station requests for the
// lifetime of the current browser page.
const representativeTripStationCache =
    new Map<string, Promise<string[]>>();

/**
 * Retrieve ordered stations for a representative trip,
 * reusing a previous successful request when available.
 *
 * Concurrent requests for the same trip also share
 * the same pending Promise.
 *
 * Failed requests are removed from the cache so they
 * can be retried later.
 */
export function getCachedRepresentativeTripStations(
    tripId: string
): Promise<string[]> {
    const cached =
        representativeTripStationCache.get(tripId);

    if (cached) {
        return cached;
    }

    const request = getRepresentativeTripStations(tripId)
        .catch((error: unknown) => {
            representativeTripStationCache.delete(tripId);
            throw error;
        });

    representativeTripStationCache.set(
        tripId,
        request
    );

    return request;
}

/**
 * Retrieve representative-trip station sequences
 * in small batches to limit simultaneous API requests.
 *
 * Results are keyed by representative trip ID.
 *
 * A failed batch stops processing and propagates
 * the error rather than returning incomplete data.
 */
export async function loadRoutePatternStations(
    patterns: CommuterRailRoutePattern[]
): Promise<Map<string, string[]>> {
    const stationsByTrip = new Map<string, string[]>();

    // Avoid requesting the same trip more than once.
    const tripIds = [
        ...new Set(
            patterns.map(
                (pattern) => pattern.representativeTripId
            )
        )
    ];

    // Never request more than two trips simultaneously.
    const BATCH_SIZE = 2;

    for (
        let index = 0;
        index < tripIds.length;
        index += BATCH_SIZE
    ) {
        const batch = tripIds.slice(
            index,
            index + BATCH_SIZE
        );

        const results = await Promise.all(
            batch.map((tripId) =>
                getCachedRepresentativeTripStations(tripId)
            )
        );

        for (let resultIndex = 0;
            resultIndex < batch.length;
            resultIndex++
        ) {
            stationsByTrip.set(
                batch[resultIndex],
                results[resultIndex]
            );
        }
    }

    return stationsByTrip;
}

/**
 * Select one representative pattern for each
 * unique direction and service description.
 *
 * Prefer actual trips over canonical trips.
 *
 * This reduces duplicate requests but does not
 * guarantee complete station coverage.
 *
 * This function makes no MBTA API requests.
 */
export function selectRepresentativePatterns(
    patterns: CommuterRailRoutePattern[]
): CommuterRailRoutePattern[] {
    const selected = new Map<
        string,
        CommuterRailRoutePattern
    >();

    for (const pattern of patterns) {
        const key = [
            pattern.directionId,
            pattern.name.trim().toLowerCase()
        ].join("|");

        const existing = selected.get(key);

        if (!existing) {
            selected.set(key, pattern);
            continue;
        }

        const existingIsCanonical =
            existing.representativeTripId.startsWith(
                "canonical-"
            );

        const candidateIsCanonical =
            pattern.representativeTripId.startsWith(
                "canonical-"
            );

        // Replace a canonical trip with an actual trip
        // representing the same named service pattern.
        if (existingIsCanonical && !candidateIsCanonical) {
            selected.set(key, pattern);
        }
    }

    return [...selected.values()];
}

/**
 * Cache route-pattern catalogs for the lifetime
 * of the current browser page.
 *
 * Each commuter rail line is retrieved only once
 * after a successful response.
 *
 * Concurrent requests for the same line share
 * the same pending Promise.
 */
const routePatternCatalogCache = new Map<
    string,
    Promise<CommuterRailRoutePattern[]>
>();

export function getCachedCommuterRailRoutePatterns(
    routeId: string
): Promise<CommuterRailRoutePattern[]> {
    const cached = routePatternCatalogCache.get(routeId);

    if (cached) {
        return cached;
    }

    const request = getCommuterRailRoutePatterns(routeId)
        .catch((error: unknown) => {
            routePatternCatalogCache.delete(routeId);
            throw error;
        });

    routePatternCatalogCache.set(routeId, request);

    return request;
}

/**
 * Resolve one commuter rail route pattern to its
 * ordered parent station IDs.
 *
 * The station request is cached, so requesting
 * the same representative trip again does not
 * generate another MBTA API request.
 *
 * This function does not load other patterns.
 */
export async function resolveRoutePattern(
    pattern: CommuterRailRoutePattern
): Promise<ResolvedRoutePattern> {
    const stationIds =
        await getCachedRepresentativeTripStations(
            pattern.representativeTripId
        );

    return {
        patternId: pattern.id,
        name: pattern.name,
        directionId: pattern.directionId,
        stationIds
    };
}

/**
 * Result of examining a limited number of patterns.
 */
export interface StationPairLookupResult {
    coverage: StationPairCoverage;
    resolvedPatterns: ResolvedRoutePattern[];
    examinedCount: number;
    remainingCount: number;
    complete: boolean;
}

/**
 * Examine a small number of route patterns for
 * the requested departure and arrival stations.
 *
 * This function examines at most two patterns.
 * It does not automatically request further batches.
 *
 * An incomplete lookup must not be treated as
 * proof that no other matching patterns exist.
 */

export async function lookupStationPair(
    originStopId: string,
    destinationStopId: string,
    patterns: CommuterRailRoutePattern[],
    resolvePattern: (
        pattern: CommuterRailRoutePattern
    ) => Promise<ResolvedRoutePattern> = resolveRoutePattern
): Promise<StationPairLookupResult> {

    const MAX_PATTERNS = 2;

    const candidates = patterns.slice(0, MAX_PATTERNS);

    const resolvedPatterns: ResolvedRoutePattern[] = [];

    for (const pattern of candidates) {
        const resolved = await resolvePattern(pattern);
        resolvedPatterns.push(resolved);
    }

    const coverage = getStationPairCoverage(
        originStopId,
        destinationStopId,
        resolvedPatterns
    );

    const remainingCount =
        patterns.length - resolvedPatterns.length;

    return {
        coverage,
        resolvedPatterns,
        examinedCount: resolvedPatterns.length,
        remainingCount,
        complete: remainingCount === 0
    };
}

/**
 * Continue an earlier station-pair lookup by
 * examining up to two additional route patterns.
 *
 * Previously resolved patterns are preserved.
 * The resolver uses cached MBTA requests.
 *
 * The caller must supply the same ordered
 * candidate list used for the initial lookup.
 */
export async function continueStationPairLookup(
    originStopId: string,
    destinationStopId: string,
    patterns: CommuterRailRoutePattern[],
    previous: StationPairLookupResult,
    resolvePattern: (
        pattern: CommuterRailRoutePattern
    ) => Promise<ResolvedRoutePattern> = resolveRoutePattern
): Promise<StationPairLookupResult> {
    const BATCH_SIZE = 2;

    const startIndex = previous.examinedCount;

    // Do not request anything if all candidates
    // have already been examined.
    if (startIndex >= patterns.length) {
        return {
            ...previous,
            remainingCount: 0,
            complete: true
        };
    }

    const nextCandidates = patterns.slice(
        startIndex,
        startIndex + BATCH_SIZE
    );

    const resolvedPatterns = [
        ...previous.resolvedPatterns
    ];

    for (const pattern of nextCandidates) {
        const resolved = await resolvePattern(pattern);
        resolvedPatterns.push(resolved);
    }

    // Recalculate coverage using every pattern
    // examined so far, not just the latest batch.
    const coverage = getStationPairCoverage(
        originStopId,
        destinationStopId,
        resolvedPatterns
    );

    const examinedCount = resolvedPatterns.length;

    const remainingCount = Math.max(
        0,
        patterns.length - examinedCount
    );

    return {
        coverage,
        resolvedPatterns,
        examinedCount,
        remainingCount,
        complete: remainingCount === 0
    };
}

/**
 * Select outbound route patterns for station ordering.
 *
 * Direction 0 travels away from the Boston terminal.
 * Multiple patterns are retained to accommodate
 * branches such as Forge Park and Foxboro.
 *
 * Makes no MBTA API requests.
 */
export function getOutboundRoutePatterns(
    patterns: CommuterRailRoutePattern[]
): CommuterRailRoutePattern[] {
    return selectRepresentativePatterns(patterns)
        .filter((pattern) => pattern.directionId === 0);
}

/**
 * Build one station order from multiple outbound
 * route patterns, including branches.
 *
 * Start with the longest pattern, then insert
 * stations from other patterns after their
 * nearest preceding station.
 *
 * Makes no MBTA API requests.
 */
export function buildOutboundStationOrder(
    patterns: ResolvedRoutePattern[]
): string[] {
    const outboundPatterns = patterns
        .filter((pattern) => pattern.directionId === 0)
        .sort(
            (a, b) =>
                b.stationIds.length - a.stationIds.length
        );

    if (outboundPatterns.length === 0) {
        return [];
    }

    // Start with the longest outbound trip.
    const orderedIds = [
        ...new Set(outboundPatterns[0].stationIds)
    ];

    // Incorporate stations belonging to other
    // routes and branches.
    for (const pattern of outboundPatterns.slice(1)) {
        let insertionIndex = 0;

        for (const stationId of pattern.stationIds) {
            const existingIndex =
                orderedIds.indexOf(stationId);

            if (existingIndex !== -1) {
                insertionIndex = existingIndex + 1;
                continue;
            }

            orderedIds.splice(
                insertionIndex,
                0,
                stationId
            );

            insertionIndex++;
        }
    }

    return orderedIds;
}

/**
 * Retrieve a line's outbound stop sequences and
 * arrange its stations in travel order.
 *
 * Includes multiple outbound route patterns so
 * stations on different branches are retained.
 *
 * Uses the existing cached MBTA requests.
 */
export async function getOrderedCommuterRailStations(
    routeId: string,
    stations: CommuterRailStation[]
): Promise<CommuterRailStation[]> {
    // Retrieve route patterns for this line.
    const patterns =
        await getCachedCommuterRailRoutePatterns(routeId);

    // Keep outbound patterns, including branches.
    const outboundPatterns =
        getOutboundRoutePatterns(patterns);

    if (outboundPatterns.length === 0) {
        return stations;
    }

    // Retrieve their ordered station sequences.

    let stationsByTrip: Map<string, string[]>;

    try {
        stationsByTrip =
            await loadRoutePatternStations(outboundPatterns);
    } catch (error) {
        // Preserve the station selector if the MBTA
        // temporarily rejects route-pattern requests.
        console.warn(
            "Station ordering unavailable; using the station list.",
            error
        );

        return stations;
    }


    // Associate each sequence with its route pattern.
    const resolvedPatterns =
        combineRoutePatternStations(
            outboundPatterns,
            stationsByTrip
        );

    // Combine the sequences into one outbound order.
    const outboundStopIds =
        buildOutboundStationOrder(resolvedPatterns);

    // Apply that order to the complete station list.
    return orderCommuterRailStations(
        stations,
        outboundStopIds
    );
}
