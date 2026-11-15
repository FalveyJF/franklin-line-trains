
/**
 * MBTA Franklin/Foxboro Line service alerts.
 */

const MBTA_API_BASE = 'https://api-v3.mbta.com';


const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/**
 * The period during which an alert applies.
 *
 * A null end means the API has not supplied
 * an ending time.
 */
export interface MBTAAlertPeriod {
  start: string | null;
  end: string | null;
}

/**
 * Identifies the route, stop, trip, or direction
 * affected by an alert.
 *
 * Fields are optional because alerts can
 * describe different types of disruptions.
 */
export interface MBTAInformedEntity {
  route?: string | null;
  stop?: string | null;
  trip?: string | null;
  direction_id?: number | null;
  activities?: string[];
}

/**
 * An MBTA service alert.
 */
export interface MBTAAlert {
  id: string;
  type: 'alert';

  attributes: {
    header: string | null;
    short_header: string | null;
    description: string | null;
    effect: string | null;
    service_effect: string | null;
    lifecycle: string | null;
    timeframe: string | null;
    active_period: MBTAAlertPeriod[];
    informed_entity: MBTAInformedEntity[];
  };
}

/**
 * Retrieve Franklin Line service alerts.
 *
 * This retrieves alerts associated with the route.
 * It does not yet determine whether an alert
 * affects a particular train or commute.
 */


export async function getCommuterRailAlerts(
    routeId: string
): Promise<MBTAAlert[]> {


  const url = new URL(`${MBTA_API_BASE}/alerts`);

  url.searchParams.set('filter[route]', routeId);
  url.searchParams.set('page[limit]', String(PAGE_SIZE));

  const alertMap = new Map<string, MBTAAlert>();

  let nextUrl: string | null = url.toString();
  let pagesRetrieved = 0;

  while (nextUrl !== null) {
    if (pagesRetrieved >= MAX_PAGES) {
      throw new Error(
        'MBTA alert pagination exceeded the safety limit.'
      );
    }

    const requestUrl: URL = new URL(nextUrl);

    // Only follow links to the official alerts endpoint.
    if (
      requestUrl.origin !== MBTA_API_BASE ||
      requestUrl.pathname !== '/alerts'
    ) {
      throw new Error('Unexpected MBTA alert pagination URL.');
    }

    const response = await fetch(requestUrl.toString());

    if (!response.ok) {
      throw new Error(
        `MBTA alerts request failed: HTTP ${response.status}`
      );
    }

    const json: {
      data: MBTAAlert[];
      links?: {
        next?: string | null;
      };
    } = await response.json();

    for (const alert of json.data) {
      alertMap.set(alert.id, alert);
    }

    pagesRetrieved++;

    const nextLink = json.links?.next ?? null;

    nextUrl = nextLink
      ? new URL(nextLink, MBTA_API_BASE).toString()
      : null;
  }

  return [...alertMap.values()];
}
