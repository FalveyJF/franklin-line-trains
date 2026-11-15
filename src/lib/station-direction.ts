
/**
 * A commuter rail route pattern with its stations
 * ordered in the direction of travel.
 */
export interface OrderedRoutePattern {
    directionId: number;
    stationIds: string[];
}

export type StationTravelDirection = 0 | 1;

/**
 * Determine whether a trip between two stations
 * travels inbound (1) or outbound (0).
 *
 * Returns null when:
 * - The stations are identical.
 * - No pattern serves both stations in that order.
 * - Matching patterns disagree on direction.
 */
export function getStationTravelDirection(
    originStopId: string,
    destinationStopId: string,
    patterns: OrderedRoutePattern[]
): StationTravelDirection | null {
    if (
        !originStopId ||
        !destinationStopId ||
        originStopId === destinationStopId
    ) {
        return null;
    }

    const matchingDirections = new Set<number>();

    for (const pattern of patterns) {
        if (
            pattern.directionId !== 0 &&
            pattern.directionId !== 1
        ) {
            continue;
        }

        const originIndex =
            pattern.stationIds.indexOf(originStopId);

        const destinationIndex =
            pattern.stationIds.indexOf(destinationStopId);

        if (
            originIndex >= 0 &&
            destinationIndex > originIndex
        ) {
            matchingDirections.add(pattern.directionId);
        }
    }

    if (matchingDirections.size !== 1) {
        return null;
    }

    const direction = [...matchingDirections][0];

    return direction === 0 || direction === 1
        ? direction
        : null;
}

export type StationPairStatus =
    | "supported"
    | "unverified"
    | "ambiguous"
    | "invalid";

export interface StationPairCoverage {
    status: StationPairStatus;
    directionId: StationTravelDirection | null;
    matchingPatternCount: number;
    originCovered: boolean;
    destinationCovered: boolean;
}

/**
 * Evaluate a station pair against available
 * ordered route patterns.
 *
 * "unverified" means our available patterns do
 * not establish a direct journey. It does not
 * prove that the journey is impossible.
 *
 * This function makes no API requests.
 */
export function getStationPairCoverage(
    originStopId: string,
    destinationStopId: string,
    patterns: OrderedRoutePattern[]
): StationPairCoverage {
    const originCovered = patterns.some(
        (pattern) =>
            pattern.stationIds.includes(originStopId)
    );

    const destinationCovered = patterns.some(
        (pattern) =>
            pattern.stationIds.includes(destinationStopId)
    );

    const result: StationPairCoverage = {
        status: "unverified",
        directionId: null,
        matchingPatternCount: 0,
        originCovered,
        destinationCovered
    };

    if (
        !originStopId ||
        !destinationStopId ||
        originStopId === destinationStopId
    ) {
        return {
            ...result,
            status: "invalid"
        };
    }

    const directions = new Set<number>();

    for (const pattern of patterns) {
        const originIndex =
            pattern.stationIds.indexOf(originStopId);

        const destinationIndex =
            pattern.stationIds.indexOf(destinationStopId);

        if (
            originIndex < 0 ||
            destinationIndex <= originIndex
        ) {
            continue;
        }

        if (
            pattern.directionId !== 0 &&
            pattern.directionId !== 1
        ) {
            continue;
        }

        result.matchingPatternCount++;
        directions.add(pattern.directionId);
    }

    if (directions.size === 0) {
        return result;
    }

    if (directions.size > 1) {
        return {
            ...result,
            status: "ambiguous"
        };
    }

    const directionId = [...directions][0] as
        StationTravelDirection;

    return {
        ...result,
        status: "supported",
        directionId
    };
}
