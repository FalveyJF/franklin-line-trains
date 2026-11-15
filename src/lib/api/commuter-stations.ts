
const MBTA_API_BASE = 'https://api-v3.mbta.com';

export interface CommuterRailStation {
    id: string;
    name: string;
}

interface APIStop {
    id: string;
    attributes: {
        name: string;
        location_type: number;
    };
}

/**
 * Retrieve passenger stations for a commuter rail line.
 * Returns station IDs rather than individual platform IDs.
 */
export async function getCommuterRailStations(
    routeId: string
): Promise<CommuterRailStation[]> {
    if (!routeId.trim()) {
        throw new Error('A commuter rail route ID is required.');
    }

    const url = new URL(`${MBTA_API_BASE}/stops`);

    url.searchParams.set('filter[route]', routeId);

    // GTFS location_type 1 means a station.
    url.searchParams.set('filter[location_type]', '1');

    url.searchParams.set('page[limit]', '100');

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Unable to retrieve commuter rail stations: HTTP ${response.status}`
        );
    }

    const json: {
        data: APIStop[];
        links?: {
            next?: string | null;
        };
    } = await response.json();

    if (json.links?.next) {
        throw new Error(
            'Station list has additional pages; results may be incomplete.'
        );
    }

    return json.data
        .map((stop) => ({
            id: stop.id,
            name: stop.attributes.name
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Order commuter rail stations using an outbound
 * stop sequence from the MBTA.
 *
 * Stations not present in the supplied sequence
 * are placed at the end, alphabetically.
 *
 * The original station array is not modified.
 */
export function orderCommuterRailStations(
    stations: CommuterRailStation[],
    outboundStopIds: string[]
): CommuterRailStation[] {
    const stationPositions = new Map<string, number>();

    outboundStopIds.forEach((stopId, index) => {
        if (!stationPositions.has(stopId)) {
            stationPositions.set(stopId, index);
        }
    });

    return [...stations].sort((a, b) => {
        const positionA =
            stationPositions.get(a.id) ?? Infinity;

        const positionB =
            stationPositions.get(b.id) ?? Infinity;

        if (positionA !== positionB) {
            return positionA - positionB;
        }

        return a.name.localeCompare(b.name);
    });
}
