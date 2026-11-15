import type {
  MBTARoute,
  MBTASchedule,
  MBTATrip,
  MBTAPrediction
} from '#lib/mbta-types.ts';

const MBTA_API_BASE = 'https://api-v3.mbta.com';

const FRANKLIN_ROUTE_ID = 'CR-Franklin';
const NORWOOD_CENTRAL_ID = 'place-FB-0148';
const SOUTH_STATION_ID = 'place-sstat';

const INBOUND = 1;
const OUTBOUND = 0;

const REGULAR_BOARDING = 0;
const REGULAR_DROP_OFF = 0;
const FLAG_STOP_BOARDING = 3;
const FLAG_STOP_DROP_OFF = 3;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/**
 * Retrieve Franklin/Foxboro Line route information.
 */
export async function getFranklinRoute(): Promise<MBTARoute> {
  const url = `${MBTA_API_BASE}/routes/${FRANKLIN_ROUTE_ID}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `MBTA route request failed: HTTP ${response.status}`
    );
  }

  const json: { data: MBTARoute } = await response.json();



  return json.data;
}

/**
 * Schedules and their associated trips.
 */

export interface StationScheduleData {
  schedules: MBTASchedule[];
  trips: MBTATrip[];
  predictions: MBTAPrediction[];
}


/**
 * Retrieve all schedule pages for a station and date.
 */

export async function getStationSchedules(
  stopId: string,
  date: string,
  routeId: string = FRANKLIN_ROUTE_ID
): Promise<StationScheduleData> {

  const url = new URL(`${MBTA_API_BASE}/schedules`);

  url.searchParams.set('filter[route]', routeId);
  url.searchParams.set('filter[stop]', stopId);
  url.searchParams.set('filter[date]', date);

  url.searchParams.set('include', 'trip,prediction');

  url.searchParams.set('page[limit]', String(PAGE_SIZE));

  const scheduleMap = new Map<string, MBTASchedule>();
  const tripMap = new Map<string, MBTATrip>();
  const predictionMap = new Map<string, MBTAPrediction>();


  let nextUrl: string | null = url.toString();
  let pagesRetrieved = 0;

  while (nextUrl !== null) {
    if (pagesRetrieved >= MAX_PAGES) {
      throw new Error(
        'MBTA schedule pagination exceeded the safety limit.'
      );
    }

    const requestUrl: URL = new URL(nextUrl);

    if (
      requestUrl.origin !== MBTA_API_BASE ||
      requestUrl.pathname !== '/schedules'
    ) {
      throw new Error('Unexpected MBTA pagination URL.');
    }

    const response = await fetch(requestUrl.toString());

    if (!response.ok) {
      throw new Error(
        `MBTA schedules request failed: HTTP ${response.status}`
      );
    }


    const json: {
      data: MBTASchedule[];
      included?: Array<MBTATrip | MBTAPrediction>;
      links?: {
        next?: string | null;
      };
    } = await response.json();


    for (const schedule of json.data) {
      scheduleMap.set(schedule.id, schedule);
    }

    for (const resource of json.included ?? []) {
      if (resource.type === 'trip') {
        tripMap.set(resource.id, resource);
      } else if (resource.type === 'prediction') {
        predictionMap.set(resource.id, resource);
      }
    }

    pagesRetrieved++;

    const nextLink = json.links?.next ?? null;

    nextUrl = nextLink
      ? new URL(nextLink, MBTA_API_BASE).toString()
      : null;
  }




  return {
    schedules: [...scheduleMap.values()],
    trips: [...tripMap.values()],
    predictions: [...predictionMap.values()]
  };

}

/**
 * A train serving both selected stations.
 */

export interface MatchedTrain {
  tripId: string;
  trainNumber: string;
  directionId: 0 | 1;
  departure: MBTASchedule;
  arrival: MBTASchedule;
}

export interface TrainLookupResult {
  trains: MatchedTrain[];
  departurePredictions: MBTAPrediction[];
  arrivalPredictions: MBTAPrediction[];
}


/**
 * Find trains traveling between two stations.
 *
 * This works for both inbound and outbound service.
 */


export async function getTrainLookup(
  originStopId: string,
  destinationStopId: string,
  directionId: number | null,
  date: string,
  routeId: string = FRANKLIN_ROUTE_ID
): Promise<TrainLookupResult> {




  const [originData, destinationData] = await Promise.all([
    getStationSchedules(originStopId, date, routeId),
    getStationSchedules(destinationStopId, date, routeId)
  ]);


  // Create a lookup of trips by their internal IDs.
  const tripMap = new Map<string, MBTATrip>();

  for (const trip of originData.trips) {
    tripMap.set(trip.id, trip);
  }

  // Group destination stops by their trip IDs.
  const arrivalsByTrip = new Map<string, MBTASchedule[]>();

  for (const arrival of destinationData.schedules) {
    const tripId = arrival.relationships.trip.data?.id;

    if (!tripId) {
      continue;
    }

    const existing = arrivalsByTrip.get(tripId) ?? [];
    existing.push(arrival);
    arrivalsByTrip.set(tripId, existing);
  }

  const matched = new Map<string, MatchedTrain>();

  // Find a valid origin and destination for each trip.
  for (const departure of originData.schedules) {
    const attributes = departure.attributes;
    const tripId = departure.relationships.trip.data?.id;

    if (!tripId) {
      continue;
    }

    // Only accept standard MBTA direction identifiers.
    if (
      attributes.direction_id !== 0 &&
      attributes.direction_id !== 1
    ) {
      continue;
    }
    if (
      directionId !== null &&
      attributes.direction_id !== directionId
    ) {
      continue;
    }


    if (attributes.pickup_type !== REGULAR_BOARDING) {
      continue;
    }

    if (!attributes.departure_time) {
      continue;
    }

    const trip = tripMap.get(tripId);

    if (!trip?.attributes.name) {
      continue;
    }

    const departureTime = new Date(
      attributes.departure_time
    ).getTime();

    const arrivals = arrivalsByTrip.get(tripId) ?? [];

    const destination = arrivals.find((arrival) => {
      const a = arrival.attributes;

      if (!a.arrival_time) {
        return false;
      }

      return (

        a.direction_id === attributes.direction_id &&


        (a.drop_off_type === REGULAR_DROP_OFF ||
          a.drop_off_type === FLAG_STOP_DROP_OFF) &&

        a.stop_sequence > attributes.stop_sequence &&
        new Date(a.arrival_time).getTime() > departureTime
      );
    });

    if (!destination) {
      continue;
    }

    if (!matched.has(tripId)) {

      matched.set(tripId, {
        tripId,
        trainNumber: trip.attributes.name,
        directionId: attributes.direction_id as 0 | 1,
        departure,
        arrival: destination
      });

    }
  }


  return {
    trains: [...matched.values()].sort((a, b) => {
      const timeA = a.departure.attributes.departure_time ?? '';
      const timeB = b.departure.attributes.departure_time ?? '';

      return timeA.localeCompare(timeB);
    }),
    departurePredictions: originData.predictions,
    arrivalPredictions: destinationData.predictions
  };

}

export async function getTrainsBetween(
  originStopId: string,
  destinationStopId: string,
  directionId: number | null,
  date: string,
  routeId: string = FRANKLIN_ROUTE_ID
): Promise<MatchedTrain[]> {
  const result = await getTrainLookup(
    originStopId,
    destinationStopId,
    directionId,
    date,
    routeId
  );

  return result.trains;
}

/**
 * Morning commute:
 * Norwood Central to South Station.
 */
export async function getInboundTrains(
  date: string
): Promise<MatchedTrain[]> {
  return getTrainsBetween(
    NORWOOD_CENTRAL_ID,
    SOUTH_STATION_ID,
    INBOUND,
    date
  );
}

/**
 * Afternoon/evening commute:
 * South Station to Norwood Central.
 */
export async function getOutboundTrains(
  date: string
): Promise<MatchedTrain[]> {
  return getTrainsBetween(
    SOUTH_STATION_ID,
    NORWOOD_CENTRAL_ID,
    OUTBOUND,
    date
  );
}

/**
 * A scheduled stop belonging to one MBTA trip.
 */
export interface TripStop {
  stopId: string;
  stopSequence: number;
  arrivalTime: string | null;
  departureTime: string | null;
}

/**
 * Cache complete trip stop lists for the
 * lifetime of the webpage.
 *
 * A trip is fetched at most once after a
 * successful response.
 */
const tripStopsCache = new Map<string, TripStop[]>();

/**
 * Retrieve the ordered stops for one MBTA trip.
 *
 * This uses the trip's INTERNAL MBTA ID,
 * not the public train number.
 */
export async function getTripStops(
  tripId: string
): Promise<TripStop[]> {
  if (!tripId.trim()) {
    throw new Error('A trip ID is required.');
  }

  const cached = tripStopsCache.get(tripId);

  if (cached) {
    return cached;
  }

  const url = new URL(
    'https://api-v3.mbta.com/schedules'
  );

  url.searchParams.set('filter[trip]', tripId);
  url.searchParams.set('page[limit]', '100');

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Unable to retrieve trip stops: HTTP ${response.status}`
    );
  }

  const result: {
    data: MBTASchedule[];
    links?: { next?: string | null };
  } = await response.json();

  // A single trip should fit within 100 stops.
  // Do not silently return an incomplete journey.
  if (result.links?.next) {
    throw new Error(
      'Trip stop response contains additional pages.'
    );
  }

  const stops: TripStop[] = result.data
    .filter(
      (schedule) =>
        schedule.relationships.trip.data?.id === tripId &&
        schedule.relationships.stop.data !== null
    )
    .map((schedule) => ({
      stopId: schedule.relationships.stop.data!.id,
      stopSequence: schedule.attributes.stop_sequence,
      arrivalTime: schedule.attributes.arrival_time,
      departureTime: schedule.attributes.departure_time
    }))
    .sort(
      (a, b) =>
        a.stopSequence - b.stopSequence
    );

  if (stops.length === 0) {
    throw new Error(
      `No scheduled stops were returned for trip ${tripId}.`
    );
  }

  tripStopsCache.set(tripId, stops);

  return stops;
}
