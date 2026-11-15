

import {
    getStationTravelDirection,
    getStationPairCoverage,
    type OrderedRoutePattern,
    type StationPairStatus
} from "./station-direction.ts";


// Actual Franklin Line station order from the MBTA.
// Direction 0: South Station toward Forge Park/495.
const patterns: OrderedRoutePattern[] = [
    {
        directionId: 0,
        stationIds: [
            "place-sstat",
            "place-bbsta",
            "place-FB-0148", // Norwood Central
            "place-FB-0191", // Walpole
            "place-FB-0303"  // Forge Park/495
        ]
    },
    {
        directionId: 1,
        stationIds: [
            "place-FB-0303",
            "place-FB-0191",
            "place-FB-0148",
            "place-bbsta",
            "place-sstat"
        ]
    }
];

function verifyDirection(
    description: string,
    origin: string,
    destination: string,
    expected: number | null
) {
    const actual = getStationTravelDirection(
        origin,
        destination,
        patterns
    );

    if (actual !== expected) {
        throw new Error(
            `${description}: expected ${expected}, received ${actual}`
        );
    }

    console.log(`PASS: ${description}`);
}

export function runStationDirectionTests() {
    verifyDirection(
        "Norwood Central to South Station = inbound",
        "place-FB-0148",
        "place-sstat",
        1
    );

    verifyDirection(
        "South Station to Norwood Central = outbound",
        "place-sstat",
        "place-FB-0148",
        0
    );

    verifyDirection(
        "Walpole to Norwood Central = inbound",
        "place-FB-0191",
        "place-FB-0148",
        1
    );

    verifyDirection(
        "Norwood Central to Walpole = outbound",
        "place-FB-0148",
        "place-FB-0191",
        0
    );

    verifyDirection(
        "Same departure and arrival = invalid",
        "place-FB-0148",
        "place-FB-0148",
        null
    );

    verifyDirection(
        "Station not on line = invalid",
        "place-FB-0148",
        "place-north",
        null
    );

    console.log("Step 193: All six tests passed.");
}

function verifyCoverage(
    description: string,
    origin: string,
    destination: string,
    testPatterns: OrderedRoutePattern[],
    expectedStatus: StationPairStatus,
    expectedDirection: number | null
) {
    const result = getStationPairCoverage(
        origin,
        destination,
        testPatterns
    );

    if (
        result.status !== expectedStatus ||
        result.directionId !== expectedDirection
    ) {
        throw new Error(
            `${description}: expected ${expectedStatus} ` +
            `(${expectedDirection}), received ` +
            `${result.status} (${result.directionId})`
        );
    }

    console.log(`PASS: ${description}`);
}

export function runStationPairCoverageTests() {
    verifyCoverage(
        "Walpole to Norwood Central is supported inbound",
        "place-FB-0191",
        "place-FB-0148",
        patterns,
        "supported",
        1
    );

    verifyCoverage(
        "Norwood Central to Walpole is supported outbound",
        "place-FB-0148",
        "place-FB-0191",
        patterns,
        "supported",
        0
    );

    verifyCoverage(
        "Different branches without a common pattern",
        "place-branch-A",
        "place-branch-B",
        [
            {
                directionId: 0,
                stationIds: [
                    "place-north",
                    "place-branch-A"
                ]
            },
            {
                directionId: 0,
                stationIds: [
                    "place-north",
                    "place-branch-B"
                ]
            }
        ],
        "unverified",
        null
    );

    verifyCoverage(
        "Conflicting directions are ambiguous",
        "place-A",
        "place-B",
        [
            {
                directionId: 0,
                stationIds: ["place-A", "place-B"]
            },
            {
                directionId: 1,
                stationIds: ["place-A", "place-B"]
            }
        ],
        "ambiguous",
        null
    );

    verifyCoverage(
        "Identical stations are invalid",
        "place-FB-0148",
        "place-FB-0148",
        patterns,
        "invalid",
        null
    );

    verifyCoverage(
        "Missing station is invalid",
        "",
        "place-sstat",
        patterns,
        "invalid",
        null
    );

    console.log("Step 202: All six coverage tests passed.");
}
