
import type {
  MBTAPrediction
} from '#lib/mbta-types.ts';

const MBTA_API_BASE = 'https://api-v3.mbta.com';
const FRANKLIN_ROUTE_ID = 'CR-Franklin';

// Station IDs previously verified with the MBTA API.
export const NORWOOD_CENTRAL_ID = 'place-FB-0148';
export const SOUTH_STATION_ID = 'place-sstat';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/**
 * Retrieve the MBTA's currently available predictions
 * for Franklin Line trains at a particular station.
 *
 * Predictions are not guaranteed to exist for every trip.
 */
export async function getStationPredictions(
  stopId: string
): Promise<MBTAPrediction[]> {
  const url = new URL(`${MBTA_API_BASE}/predictions`);

  url.searchParams.set(
    'filter[route]',
    FRANKLIN_ROUTE_ID
  );

  url.searchParams.set('filter[stop]', stopId);
  url.searchParams.set('page[limit]', String(PAGE_SIZE));

  const predictionMap = new Map<string, MBTAPrediction>();

  let nextUrl: string | null = url.toString();
  let pagesRetrieved = 0;

  while (nextUrl !== null) {
    if (pagesRetrieved >= MAX_PAGES) {
      throw new Error(
        'MBTA prediction pagination exceeded the safety limit.'
      );
    }

    const requestUrl: URL = new URL(nextUrl);

    // Only follow pagination links to the MBTA
    // predictions endpoint.
    if (
      requestUrl.origin !== MBTA_API_BASE ||
      requestUrl.pathname !== '/predictions'
    ) {
      throw new Error(
        'Unexpected MBTA prediction pagination URL.'
      );
    }

    const response = await fetch(requestUrl.toString());

    if (!response.ok) {
      throw new Error(
        `MBTA predictions request failed: HTTP ${response.status}`
      );
    }

    const json: {
      data: MBTAPrediction[];
      links?: {
        next?: string | null;
      };
    } = await response.json();

    for (const prediction of json.data) {
      predictionMap.set(prediction.id, prediction);
    }

    pagesRetrieved++;

    const nextLink = json.links?.next ?? null;

    nextUrl = nextLink
      ? new URL(nextLink, MBTA_API_BASE).toString()
      : null;
  }

  return [...predictionMap.values()];
}
