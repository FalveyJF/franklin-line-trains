
import type {
  MBTAPrediction
} from '#lib/mbta-types.ts';

import type {
  MatchedTrain
} from '#lib/api/mbta.ts';

/**
 * A scheduled train with any matching real-time
 * predictions for its origin and destination.
 *
 * A null prediction means no matching prediction
 * was found in the supplied API response.
 */
export interface TrainWithPredictions {
  train: MatchedTrain;
  departurePrediction: MBTAPrediction | null;
  arrivalPrediction: MBTAPrediction | null;
}

/**
 * Find a prediction for a specific trip and stop.
 *
 * Both trip ID and stop sequence must match.
 */

export function findStopPrediction(
    predictions: MBTAPrediction[],
    tripId: string,
    stopSequence: number
): MBTAPrediction | null {
    // First, prefer an exact trip and stop-sequence match.
    const exactMatch = predictions.find((prediction) =>
        prediction.relationships.trip.data?.id === tripId &&
        prediction.attributes.stop_sequence === stopSequence
    );

    if (exactMatch) {
        return exactMatch;
    }

    // The caller retrieved predictions for one station.
    // If exactly one prediction references this trip,
    // accept it even if its stop sequence differs.
    const tripMatches = predictions.filter(
        (prediction) =>
            prediction.relationships.trip.data?.id === tripId
    );

    return tripMatches.length === 1
        ? tripMatches[0]
        : null;
}


/**
 * Combine scheduled trains with available predictions.
 *
 * departurePredictions are predictions retrieved
 * for the selected origin station.
 *
 * arrivalPredictions are predictions retrieved
 * for the selected destination station.
 */
export function matchTrainPredictions(
  trains: MatchedTrain[],
  departurePredictions: MBTAPrediction[],
  arrivalPredictions: MBTAPrediction[]
): TrainWithPredictions[] {
  return trains.map((train) => {
    const departureSequence =
      train.departure.attributes.stop_sequence;

    const arrivalSequence =
      train.arrival.attributes.stop_sequence;

    const departurePrediction = findStopPrediction(
      departurePredictions,
      train.tripId,
      departureSequence
    );

    const arrivalPrediction = findStopPrediction(
      arrivalPredictions,
      train.tripId,
      arrivalSequence
    );

    return {
      train,
      departurePrediction,
      arrivalPrediction
    };
  });
}
