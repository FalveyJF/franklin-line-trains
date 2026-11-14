
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
  return (
    predictions.find((prediction) => {
      const predictionTripId =
        prediction.relationships.trip.data?.id;

      return (
        predictionTripId === tripId &&
        prediction.attributes.stop_sequence === stopSequence
      );
    }) ?? null
  );
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
