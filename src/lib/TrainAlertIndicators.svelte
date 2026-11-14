<script lang="ts">
  import type { TrainAlertSummary } from "#lib/train-alerts.ts";

  let {
    alerts,
  }: {
    alerts: TrainAlertSummary[];
  } = $props();

  const stationNoticeCount = $derived(
    alerts.filter((alert) => alert.category === "station-notice").length,
  );

  const advisoryCount = $derived(
    alerts.filter((alert) => alert.category === "general-advisory").length,
  );

  const potentialDisruptionCount = $derived(
    alerts.filter((alert) => alert.category === "potential-disruption").length,
  );
</script>

{#if alerts.length > 0}
  <div class="alert-indicators">
    {#if stationNoticeCount > 0}
      <span class="indicator station">
        {stationNoticeCount}
        {stationNoticeCount === 1 ? "station notice" : "station notices"}
      </span>
    {/if}

    {#if advisoryCount > 0}
      <span
        class="indicator advisory"
        title="General MBTA service information. This does not confirm a change to this particular train."
      >
        {advisoryCount}
        {advisoryCount === 1 ? "line-wide advisory" : "line-wide advisories"}
      </span>
    {/if}

    {#if potentialDisruptionCount > 0}
      <span class="indicator potential">
        {potentialDisruptionCount}
        {potentialDisruptionCount === 1
          ? "potential disruption"
          : "potential disruptions"}
      </span>
    {/if}
  </div>
{/if}

<style>
  .alert-indicators {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .indicator {
    display: inline-block;
    padding: 6px 10px;
    border: 1px solid;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
  }

  .station {
    color: #1e40af;
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .advisory {
    color: #92400e;
    background: #fffbeb;
    border-color: #fde68a;
  }

  .potential {
    color: #9a3412;
    background: #fff7ed;
    border-color: #fdba74;
  }
</style>
