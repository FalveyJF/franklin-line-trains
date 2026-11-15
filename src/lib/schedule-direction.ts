
import type {
    MatchedTrain
} from "#lib/api/mbta.ts";

export type ScheduleDirectionStatus =
    | "inbound"
    | "outbound"
    | "ambiguous"
    | "no-service";

export interface ScheduleDirectionResult {
    status: ScheduleDirectionStatus;
    directionId: 0 | 1 | null;
    matchingTrainCount: number;
}

/**
 * Determine the direction of a selected journey
 * from trains that actually serve both stations.
 *
 * The caller supplies trains already matched
 * to the selected origin and destination.
 *
 * This function makes no API requests.
 */
export function getScheduleDirection(
    trains: MatchedTrain[]
): ScheduleDirectionResult {
    if (trains.length === 0) {
        return {
            status: "no-service",
            directionId: null,
            matchingTrainCount: 0
        };
    }

    const directions = new Set(
        trains.map((train) => train.directionId)
    );

    if (directions.size !== 1) {
        return {
            status: "ambiguous",
            directionId: null,
            matchingTrainCount: trains.length
        };
    }

    const directionId = trains[0].directionId;

    return {
        status: directionId === 1
            ? "inbound"
            : "outbound",
        directionId,
        matchingTrainCount: trains.length
    };
}
