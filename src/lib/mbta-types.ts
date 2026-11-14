
/**
 * Types for the MBTA V3 REST API.
 */

export interface MBTARelationship {
  data: {
    id: string;
    type: string;
  } | null;
}

export interface MBTARoute {
  id: string;
  type: 'route';

  attributes: {
    long_name: string;
    short_name: string | null;
    type: number;
  };
}

export interface MBTATrip {
  id: string;
  type: 'trip';

  attributes: {
    name: string | null;
    headsign: string | null;
    direction_id: number;
  };
}

export interface MBTASchedule {
  id: string;
  type: 'schedule';

  attributes: {
    arrival_time: string | null;
    departure_time: string | null;
    stop_sequence: number;
    direction_id: number;

    // GTFS boarding and drop-off rules.
    pickup_type: number;
    drop_off_type: number;

    schedule_relationship: string | null;
  };

  relationships: {
    trip: MBTARelationship;
    stop: MBTARelationship;
  };
}

export interface MBTAPrediction {
  id: string;
  type: 'prediction';

  attributes: {
    arrival_time: string | null;
    departure_time: string | null;
    stop_sequence: number;
    status: string | null;
    schedule_relationship: string | null;
  };

  relationships: {
    trip: MBTARelationship;
    stop: MBTARelationship;
  };
}

export interface MBTACollection<T> {
  data: T[];
}
