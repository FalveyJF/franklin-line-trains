
const MBTA_API_BASE = 'https://api-v3.mbta.com';

export type RailTerminal = 'south' | 'north';

export interface CommuterRailRoute {
    id: string;
    name: string;
    terminal: RailTerminal;
}

interface APIRoute {
    id: string;
    attributes: {
        long_name: string;
        short_name: string;
    };
}

/**
 * Retrieve commuter rail routes serving
 * a particular Boston terminal.
 */
async function getRoutesForTerminal(
    stopId: string,
    terminal: RailTerminal
): Promise<CommuterRailRoute[]> {
    const url = new URL(`${MBTA_API_BASE}/routes`);

    // MBTA route type 2 = commuter rail.
    url.searchParams.set('filter[type]', '2');
    url.searchParams.set('filter[stop]', stopId);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Unable to retrieve commuter rail routes: HTTP ${response.status}`
        );
    }

    const json: { data: APIRoute[] } =
        await response.json();

    return json.data.map((route) => ({
        id: route.id,
        name:
            route.attributes.long_name ||
            route.attributes.short_name ||
            route.id,
        terminal
    }));
}

/**
 * South Station routes first, alphabetically.
 * North Station routes second, alphabetically.
 */
export async function getCommuterRailRoutes():
    Promise<CommuterRailRoute[]> {

    const [southRoutes, northRoutes] =
        await Promise.all([
            getRoutesForTerminal('place-sstat', 'south'),
            getRoutesForTerminal('place-north', 'north')
        ]);

    const sortByName = (
        a: CommuterRailRoute,
        b: CommuterRailRoute
    ) => a.name.localeCompare(b.name);

    return [
        ...southRoutes.sort(sortByName),
        ...northRoutes.sort(sortByName)
    ];
}
