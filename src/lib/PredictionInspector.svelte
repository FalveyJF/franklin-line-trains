
<script lang="ts">
  import {
    getStationPredictions,
    NORWOOD_CENTRAL_ID,
    SOUTH_STATION_ID
  } from '#lib/api/predictions.ts';

  import type {
    MBTAPrediction
  } from '#lib/mbta-types.ts';

  import type {
    CommuteDirection
  } from '#lib/eastern-time.ts';

  import type {
    TrainWithPredictions
  } from '#lib/prediction-matching.ts';

  // Direction and matched trains from the main page.
  let {
    direction,
    trains
  }: {
    direction: CommuteDirection;
    trains: TrainWithPredictions[];
  } = $props();

  let predictions = $state<MBTAPrediction[]>([]);
  let loading = $state(false);
  let errorMessage = $state('');
  let hasResults = $state(false);
  let inspectedStation = $state('');

  let requestNumber = 0;

  let selectedStationName = $derived(
    direction === 'inbound'
      ? 'Norwood Central'
      : 'South Station'
  );

  let selectedStationId = $derived(
    direction === 'inbound'
      ? NORWOOD_CENTRAL_ID
      : SOUTH_STATION_ID
  );

  /**
   * Keep only predictions matching a scheduled
   * departure in the selected commute direction.
   *
   * Match both the trip ID and stop sequence.
   */
  let matchingPredictions = $derived(
    predictions.filter((prediction) => {
      const tripId = prediction.relationships.trip.data?.id;
      const sequence = prediction.attributes.stop_sequence;

      if (!tripId) {
        return false;
      }

      return trains.some((item) => {
        return (
          item.train.tripId === tripId &&
          item.train.departure.attributes.stop_sequence
            === sequence
        );
      });
    })
  );

  // Clear results when the direction changes.
  $effect(() => {
    const currentDirection = direction;

    if (
      currentDirection === 'inbound' ||
      currentDirection === 'outbound'
    ) {
      requestNumber++;
      predictions = [];
      hasResults = false;
      errorMessage = '';
      inspectedStation = '';
      loading = false;
    }
  });

  function formatTime(timestamp: string | null): string {
    if (!timestamp) {
      return 'Not supplied';
    }

    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(timestamp));
  }

  function getTrainNumber(prediction: MBTAPrediction): string {
    const tripId = prediction.relationships.trip.data?.id;

    const matched = trains.find(
      (item) => item.train.tripId === tripId
    );

    return matched?.train.trainNumber ?? 'Unknown';
  }

  async function inspectPredictions() {
    if (loading) {
      return;
    }

    const thisRequest = ++requestNumber;

    loading = true;
    errorMessage = '';
    hasResults = false;
    predictions = [];

    const stationName = selectedStationName;
    const stationId = selectedStationId;

    try {
      const results = await getStationPredictions(stationId);

      if (thisRequest !== requestNumber) {
        return;
      }

      predictions = results;
      inspectedStation = stationName;
      hasResults = true;

      console.log(
        'All MBTA predictions at ' + stationName,
        results
      );

    } catch (error) {
      if (thisRequest !== requestNumber) {
        return;
      }

      console.error('Prediction inspection failed:', error);

      errorMessage =
        error instanceof Error
          ? error.message
          : 'Unable to retrieve predictions.';

    } finally {
      if (thisRequest === requestNumber) {
        loading = false;
      }
    }
  }
</script>

<section class="inspector">
  <h2>Prediction Inspector</h2>

  <p>
    Temporary testing tool for MBTA real-time data.
    Results are filtered to trains traveling in the
    selected commute direction.
  </p>

  <p class="station">
    Selected direction:
    <strong>{direction}</strong>
  </p>

  <p class="station">
    Departure station:
    <strong>{selectedStationName}</strong>
  </p>

  <button
    type="button"
    onclick={inspectPredictions}
    disabled={loading}
  >
    {loading
      ? 'Retrieving predictions...'
      : 'Inspect Predictions'}
  </button>

  {#if errorMessage}
    <p class="error" role="alert">{errorMessage}</p>
  {/if}

  {#if hasResults}
    <div class="results">
      <h3>Results for {inspectedStation}</h3>

      <p>
        All station prediction records:
        <strong>{predictions.length}</strong>
      </p>

      <p>
        Matching {direction} departure predictions:
        <strong>{matchingPredictions.length}</strong>
      </p>

      {#if matchingPredictions.length === 0}
        <p>
          No predictions matched scheduled departures
          in the selected direction.
        </p>

        <p>
          The MBTA may have returned predictions for
          trains traveling in the opposite direction,
          or for trips outside this commute.
        </p>
      {:else}
        <p>Showing up to five matching records:</p>

        {#each matchingPredictions.slice(0, 5) as prediction (prediction.id)}
          <div class="prediction">
            <p>
              <strong>Train:</strong>
              {getTrainNumber(prediction)}
            </p>

            <p>
              <strong>Trip ID:</strong>
              {prediction.relationships.trip.data?.id
                ?? 'Not supplied'}
            </p>

            <p>
              <strong>Stop sequence:</strong>
              {prediction.attributes.stop_sequence}
            </p>

            <p>
              <strong>Predicted departure:</strong>
              {formatTime(
                prediction.attributes.departure_time
              )}
            </p>

            <p>
              <strong>Predicted arrival:</strong>
              {formatTime(
                prediction.attributes.arrival_time
              )}
            </p>

            <p>
              <strong>Status:</strong>
              {prediction.attributes.status ?? 'Not supplied'}
            </p>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</section>

<style>
  .inspector {
    margin-top: 32px;
    padding: 18px;
    border: 1px dashed #94a3b8;
    border-radius: 12px;
    background: #eef2f7;
  }

  h2 {
    margin: 0 0 10px;
    font-size: 20px;
    color: #172554;
  }

  h3 {
    margin: 0 0 12px;
    font-size: 17px;
  }

  p {
    font-size: 14px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .station {
    margin: 12px 0;
    text-transform: capitalize;
  }

  button {
    min-height: 48px;
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 10px;
    background: #1d4ed8;
    color: white;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .results {
    margin-top: 20px;
  }

  .prediction {
    margin-top: 12px;
    padding: 12px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: white;
  }

  .prediction p {
    margin: 6px 0;
  }

  .error {
    color: #b91c1c;
  }
</style>
