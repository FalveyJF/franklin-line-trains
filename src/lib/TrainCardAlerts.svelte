<script lang="ts">
  import type { MBTAAlert } from "#lib/api/alerts.ts";

  import type { MatchedTrain } from "#lib/api/mbta.ts";

  import { getScheduleBasedAlertSummaries } from "#lib/schedule-alerts.ts";

  import TrainAlertIndicators from "#lib/TrainAlertIndicators.svelte";

  let {
    train,
    alerts,
  }: {
    train: MatchedTrain;
    alerts: MBTAAlert[];
  } = $props();

  // Recalculate when the train or shared
  // MBTA alert data changes.
  const summaries = $derived(getScheduleBasedAlertSummaries(alerts, train));

  const generalAdvisories = $derived(
    summaries.filter((summary) => summary.category === "general-advisory"),
  );
</script>

<TrainAlertIndicators alerts={summaries} />

{#if generalAdvisories.length > 0}
  <details class="advisory-details">
    <summary>View advisory details</summary>

    <div class="advisory-content">
      {#each generalAdvisories as advisory (advisory.alertId)}
        <div class="advisory-item">
          <p>{advisory.heading}</p>

          {#if advisory.description && advisory.description !== advisory.heading}
            <details class="full-description">
              <summary>Read full MBTA description</summary>

              <p>{advisory.description}</p>
            </details>
          {/if}
        </div>
      {/each}

      <p class="advisory-explanation">
        This is general line-wide information. It does not confirm a delay,
        cancellation, or shuttle substitution for this train.
      </p>
    </div>
  </details>
{/if}

<style>
  .advisory-details {
    margin-top: 8px;
    font-size: 13px;
  }

  .advisory-details summary {
    cursor: pointer;
    color: #1d4ed8;
    font-weight: 600;
    padding: 6px 0;
  }

  .advisory-content {
    margin-top: 6px;
    padding: 10px 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    color: #334155;
    line-height: 1.5;
  }

  .advisory-content p {
    margin: 0 0 8px;
  }

  .advisory-content p:last-child {
    margin-bottom: 0;
  }

  .advisory-explanation {
    font-style: italic;
    color: #64748b;
  }

  .advisory-item + .advisory-item {
    border-top: 1px solid #e2e8f0;
    margin-top: 12px;
    padding-top: 12px;
  }

  .full-description {
    margin: 8px 0;
  }

  .full-description summary {
    color: #1d4ed8;
    font-weight: 600;
    cursor: pointer;
  }

  .full-description p {
    margin-top: 8px;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  /* Keep long advisory text within the train card. */
  .advisory-content {
    overflow-wrap: anywhere;
    min-width: 0;
  }

  /* Preserve line breaks supplied by the MBTA. */
  .advisory-item > p {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  /* Make expandable controls easier to identify
   when using a keyboard. */
  .advisory-details summary:focus-visible,
  .full-description summary:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 3px;
    border-radius: 3px;
  }
</style>
