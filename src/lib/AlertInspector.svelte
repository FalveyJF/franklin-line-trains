
<script lang="ts">
  import {
    getFranklinAlerts,
    type MBTAAlert,
    type MBTAAlertPeriod
  } from '#lib/api/alerts.ts';




import {
  getAffectedCommuteEndpoints,
  getExplicitAlertTripIds,
  getCompatibleAlertEntities,
  getMatchingJourneyStopIds
} from '#lib/service-disruptions.ts';




  let alerts = $state<MBTAAlert[]>([]);
  let loading = $state(false);
  let errorMessage = $state('');
  let hasResults = $state(false);
  let inspectedAt = $state('');

  /**
   * Format an MBTA timestamp in Eastern Time.
   */
  function formatTime(timestamp: string | null): string {
    if (!timestamp) {
      return 'No time supplied';
    }

    const date = new Date(timestamp);

    if (!Number.isFinite(date.getTime())) {
      return 'Invalid timestamp';
    }

    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  }

  /**
   * Determine whether an active period includes now.
   *
   * This does not establish whether the alert
   * affects a specific train or station.
   */
  function periodIncludesNow(
    period: MBTAAlertPeriod,
    now: number
  ): boolean {
    const start = period.start
      ? new Date(period.start).getTime()
      : Number.NEGATIVE_INFINITY;

    const end = period.end
      ? new Date(period.end).getTime()
      : Number.POSITIVE_INFINITY;

    return (
      !Number.isNaN(start) &&
      !Number.isNaN(end) &&
      start <= now &&
      now < end
    );
  }

  function isActiveNow(alert: MBTAAlert): boolean {
    const now = Date.now();

    return (alert.attributes.active_period ?? []).some(
      (period) => periodIncludesNow(period, now)
    );
  }

  async function inspectAlerts() {
    if (loading) {
      return;
    }

    loading = true;
    errorMessage = '';
    hasResults = false;
    alerts = [];

    try {
      const results = await getFranklinAlerts();

      alerts = results;
      inspectedAt = new Date().toISOString();
      hasResults = true;

      console.log('Franklin Line alert records:', results);
      

console.table(
  alerts.map((alert) => {
    const tripIds = getExplicitAlertTripIds(alert);

    return {
      alertId: alert.id,
      effect: alert.attributes.effect,
      lifecycle: alert.attributes.lifecycle,
      matchedEndpoints:
        getAffectedCommuteEndpoints(alert).join(', ') ||
        '(none)',
      explicitTripCount: tripIds.length,
      explicitTripIds: tripIds.join(', ') || '(none)'
    };
  })
);

const shuttleAlert = alerts.find(
  (alert) => alert.id === '1043404'
);

const journeyStopIds = new Set([
  'place-sstat',
  'NEC-2287',
  'place-FB-0148',
  'FB-0148-01',
  'FB-0148-02'
]);

const alertIdsToTest = [
  '1030825',
  '1043404'
];

console.table(
  alertIdsToTest.map((alertId) => {
    const alert = alerts.find(
      (item) => item.id === alertId
    );

    if (!alert) {
      return {
        alertId,
        direction: 'Not available',
        matchedStops: '(alert not returned)'
      };
    }

    return {
      alertId,
      direction: 'Outbound (0)',
      matchedStops:
        getMatchingJourneyStopIds(
          alert,
          'test-franklin-trip',
          0,
          journeyStopIds
        ).join(', ') || '(none)'
    };
  })
);

if (shuttleAlert) {
  const testTripId = 'test-franklin-trip';

  const outboundEntities = getCompatibleAlertEntities(
    shuttleAlert,
    testTripId,
    0
  );

  const inboundEntities = getCompatibleAlertEntities(
    shuttleAlert,
    testTripId,
    1
  );

  console.table([
    {
      direction: 'Outbound',
      directionId: 0,
      compatibleEntities: outboundEntities.length
    },
    {
      direction: 'Inbound',
      directionId: 1,
      compatibleEntities: inboundEntities.length
    }
  ]);
}


    } catch (error) {
      console.error('MBTA alert inspection failed:', error);

      errorMessage =
        error instanceof Error
          ? error.message
          : 'Unable to retrieve service alerts.';
    } finally {
      loading = false;
    }
  }
</script>

<section class="inspector">
  <h2>Service Alert Inspector</h2>

  <p>
    Temporary diagnostic tool for Franklin/Foxboro
    Line service alerts.
  </p>

  <button
    type="button"
    onclick={inspectAlerts}
    disabled={loading}
  >
    {loading ? 'Retrieving alerts...' : 'Inspect Service Alerts'}
  </button>

  {#if errorMessage}
    <p class="error" role="alert">{errorMessage}</p>
  {/if}

  {#if hasResults}
    <div class="results">
      <h3>Franklin Line Alerts</h3>

      <p>
        Total alert records:
        <strong>{alerts.length}</strong>
      </p>

      <p>
        Active now by date/time:
        <strong>
          {alerts.filter((alert) => isActiveNow(alert)).length}
        </strong>
      </p>

      <p class="explanation">
        Active now means the current time falls within
        an alert's active period. It does not mean
        the alert affects your particular train.
      </p>

      <p class="explanation">
        Inspected at: {formatTime(inspectedAt)}
      </p>

      {#if alerts.length === 0}
        <p>
          The API returned no Franklin Line alerts.
        </p>
      {:else}
        {#each alerts.slice(0, 10) as alert (alert.id)}
          <article class="alert">
            <h4>
              {alert.attributes.short_header
                ?? alert.attributes.header
                ?? 'Untitled MBTA alert'}
            </h4>

            <p>
              <strong>Alert ID:</strong> {alert.id}
            </p>

            <p>
              <strong>Effect:</strong>
              {alert.attributes.effect ?? 'Not supplied'}
            </p>

            <p>
              <strong>Lifecycle:</strong>
              {alert.attributes.lifecycle ?? 'Not supplied'}
            </p>

            <p>
              <strong>Active right now:</strong>
              {isActiveNow(alert) ? 'Yes' : 'No'}
            </p>

            <p>
              <strong>Description:</strong>
              {alert.attributes.description ?? 'Not supplied'}
            </p>

            <h5>Active periods</h5>

            {#if (alert.attributes.active_period ?? []).length === 0}
              <p>No active periods supplied.</p>
            {:else}
              {#each alert.attributes.active_period as period}
                <p class="period">
                  Start: {formatTime(period.start)}
                  <span>
                    End: {formatTime(period.end)}
                  </span>
                </p>
              {/each}
            {/if}

            
<div class="affected-entities">
  <h5>Affected entities</h5>

  <p>
    <strong>Entity records:</strong>
    {(alert.attributes.informed_entity ?? []).length}
  </p>

  {#if (alert.attributes.informed_entity ?? []).length === 0}
    <p>No affected-entity details supplied.</p>
  {:else}
    {#each alert.attributes.informed_entity as entity, index}
      <div class="entity-record">
        <p><strong>Entity {index + 1}</strong></p>

        <p>
          <strong>Route:</strong>
          {entity.route ?? 'Not specified'}
        </p>

        <p>
          <strong>Stop:</strong>
          {entity.stop ?? 'Not specified'}
        </p>

        <p>
          <strong>Trip:</strong>
          {entity.trip ?? 'Not specified'}
        </p>

        <p>
          <strong>Direction:</strong>
          {entity.direction_id === 1
            ? 'Inbound (1)'
            : entity.direction_id === 0
              ? 'Outbound (0)'
              : 'Not specified'}
        </p>

        <p>
          <strong>Activities:</strong>
          {(entity.activities ?? []).join(', ') || 'Not specified'}
        </p>
      </div>
    {/each}
  {/if}
</div>

          </article>
        {/each}

        {#if alerts.length > 10}
          <p>
            Showing the first 10 alerts.
            The complete response is also available
            in the Firefox console.
          </p>
        {/if}
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
    font-size: 18px;
  }

  h4 {
    margin: 0 0 12px;
    font-size: 16px;
    color: #172554;
    overflow-wrap: anywhere;
  }

  h5 {
    margin: 14px 0 8px;
    font-size: 14px;
  }

  p {
    font-size: 14px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  button {
    width: 100%;
    min-height: 48px;
    padding: 12px;
    border: 0;
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

  .alert {
    margin-top: 14px;
    padding: 14px;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: white;
  }

  .period {
    padding: 10px;
    background: #f1f5f9;
    border-radius: 6px;
  }

  .period span {
    display: block;
    margin-top: 5px;
  }

  .explanation {
    color: #475569;
  }

  .error {
    color: #b91c1c;
  }

.affected-entities {
  margin-top: 16px;
  padding-top: 10px;
  border-top: 1px solid #cbd5e1;
}

.entity-record {
  margin-top: 10px;
  padding: 12px;
  border-radius: 8px;
  background: #f1f5f9;
}

.entity-record p {
  margin: 5px 0;
}

</style>
