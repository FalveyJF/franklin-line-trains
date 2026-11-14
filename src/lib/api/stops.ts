
const MBTA_API_BASE = 'https://api-v3.mbta.com';

/**
 * The portion of an MBTA stop response
 * needed for parent-station matching.
 */
interface MBTAStopResponse {
  data: {
    id: string;
    type: 'stop';
    attributes: {
      name: string;
    };
    relationships?: {
      parent_station?: {
        data: {
          id: string;
          type: string;
        } | null;
      };
    };
  };
}

export interface StopStationInfo {
  stopId: string;
  stopName: string;
  parentStationId: string | null;
}

/**
 * Cache successful lookups and share requests
 * that are already in progress.
 */
const stopLookupCache =
  new Map<string, Promise<StopStationInfo>>();

/**
 * Retrieve the parent station associated
 * with an MBTA platform or stop.
 *
 * If the stop has no parent station,
 * parentStationId will be null.
 */
export async function getStopStationInfo(
  stopId: string
): Promise<StopStationInfo> {
  const id = stopId.trim();

  if (!id) {
    throw new Error('A stop ID is required.');
  }

  const cached = stopLookupCache.get(id);

  if (cached) {
    return cached;
  }

  const request = (async (): Promise<StopStationInfo> => {
    const url =
      `${MBTA_API_BASE}/stops/${encodeURIComponent(id)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Unable to retrieve stop ${id}: HTTP ${response.status}`
      );
    }

    const result: MBTAStopResponse =
      await response.json();

    if (result.data.id !== id) {
      throw new Error(
        `Unexpected stop ID returned for ${id}.`
      );
    }

    return {
      stopId: result.data.id,
      stopName: result.data.attributes.name,
      parentStationId:
        result.data.relationships
          ?.parent_station?.data?.id ?? null
    };
  })();

  stopLookupCache.set(id, request);

  try {
    return await request;
  } catch (error) {
    // Allow a later attempt if the request fails.
    stopLookupCache.delete(id);
    throw error;
  }
}

/**
 * Retrieve information for multiple MBTA stops
 * using a single batch request when possible.
 *
 * Previously cached stop information is reused.
 * Successful batch results populate the same
 * cache used by getStopStationInfo().
 */
export async function getStopStationInfos(
  stopIds: string[]
): Promise<StopStationInfo[]> {
  const ids = Array.from(
    new Set(stopIds.map((id) => id.trim()))
  );

  if (ids.some((id) => !id)) {
    throw new Error('Stop IDs cannot be empty.');
  }

  if (ids.length === 0) {
    return [];
  }

  if (ids.length > 100) {
    throw new Error(
      'Batch lookup supports at most 100 stop IDs.'
    );
  }

  // Only request stops that are not already cached.
  const uncachedIds = ids.filter(
    (id) => !stopLookupCache.has(id)
  );

  if (uncachedIds.length > 0) {
    const url = new URL(
      `${MBTA_API_BASE}/stops`
    );

    url.searchParams.set(
      'filter[id]',
      uncachedIds.join(',')
    );

    url.searchParams.set(
      'page[limit]',
      '100'
    );

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Unable to retrieve stops: HTTP ${response.status}`
      );
    }

    const result: {
      data: MBTAStopResponse['data'][];
      links?: {
        next?: string | null;
      };
    } = await response.json();

    if (result.links?.next) {
      throw new Error(
        'Batch stop response contains additional pages.'
      );
    }

    const returnedIds = new Set(
      result.data.map((stop) => stop.id)
    );

    // Do not silently accept an incomplete response.
    for (const id of uncachedIds) {
      if (!returnedIds.has(id)) {
        throw new Error(
          `Stop ${id} was missing from the batch response.`
        );
      }
    }

    // Cache successful results.
    for (const stop of result.data) {
      const info: StopStationInfo = {
        stopId: stop.id,
        stopName: stop.attributes.name,
        parentStationId:
          stop.relationships
            ?.parent_station?.data?.id ?? null
      };

      stopLookupCache.set(
        stop.id,
        Promise.resolve(info)
      );
    }
  }

  // Return results in the same order as requested.
  // This also handles any previously cached requests.
  return Promise.all(
    ids.map((id) => {
      const cached = stopLookupCache.get(id);

      if (!cached) {
        throw new Error(
          `No cached result for stop ${id}.`
        );
      }

      return cached;
    })
  );
}
