<script lang="ts">
  import type { MBTAAlert } from "#lib/api/alerts.ts";
  import type { MatchedTrain } from "#lib/api/mbta.ts";

  import { getScheduleBasedAlertSummaries } from "#lib/schedule-alerts.ts";

  let {
    train,
    alerts,
  }: {
    train: MatchedTrain;
    alerts: MBTAAlert[];
  } = $props();

  const summaries = $derived(getScheduleBasedAlertSummaries(alerts, train));

  const generalAdvisoryCount = $derived(
    summaries.filter((summary) => summary.category === "general-advisory")
      .length,
  );

  const buttonLabel = $derived(
    summaries.length === generalAdvisoryCount
      ? `${generalAdvisoryCount} line-wide ${
          generalAdvisoryCount === 1 ? "advisory" : "advisories"
        }`
      : `${summaries.length} ${
          summaries.length === 1 ? "service alert" : "service alerts"
        }`,
  );

  let dialog = $state<HTMLDialogElement>();
</script>

{#if summaries.length > 0}
  <button
    type="button"
    class="advisory-button"
    onclick={() => dialog?.showModal()}
  >
    {buttonLabel}
  </button>

  <dialog bind:this={dialog} class="advisory-dialog">
    <div class="dialog-header">
      <h2>Train {train.trainNumber} — Service information</h2>

      <button
        type="button"
        class="close-icon"
        aria-label="Close service information"
        onclick={() => dialog?.close()}
      >
        ×
      </button>
    </div>

    <div class="dialog-content">
      {#each summaries as advisory (advisory.alertId)}
        <section class="advisory-item">
          <p>{advisory.heading}</p>

          {#if advisory.description && advisory.description !== advisory.heading}
            <details class="full-description">
              <summary>Read full MBTA description</summary>
              <p>{advisory.description}</p>
            </details>
          {/if}
        </section>
      {/each}

      <p class="advisory-explanation">
        This information does not confirm a delay, cancellation, or shuttle
        substitution for this particular train.
      </p>
    </div>

    <div class="dialog-footer">
      <button
        type="button"
        class="close-button"
        onclick={() => dialog?.close()}
      >
        Close
      </button>
    </div>
  </dialog>
{/if}

<style>
  .advisory-button {
    margin-top: 8px;
    padding: 8px 12px;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    background: #fffbeb;
    color: #92400e;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
  }

  .advisory-button:focus-visible,
  .close-button:focus-visible,
  .close-icon:focus-visible {
    outline: 2px solid #2563eb;
    outline-offset: 3px;
  }

  .advisory-dialog {
    position: fixed;
    inset: 0;
    width: calc(100% - 32px);
    max-width: 480px;
    max-height: calc(100% - 48px);
    margin: auto;
    padding: 0;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    background: white;
    color: #0f172a;
    box-shadow: 0 16px 48px #0003;
    display: none;
    flex-direction: column;
  }
  .advisory-dialog[open] {
    display: flex;
  }
  .advisory-dialog::backdrop {
    background: rgb(15 23 42 / 60%);
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid #e2e8f0;
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 17px;
    line-height: 1.4;
  }

  .close-icon {
    border: 0;
    background: transparent;
    color: #475569;
    font-size: 26px;
    cursor: pointer;
  }

  .dialog-content {
    padding: 16px;
    font-size: 14px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .advisory-item p {
    margin: 0 0 12px;
    white-space: pre-line;
  }

  .advisory-item + .advisory-item {
    border-top: 1px solid #e2e8f0;
    margin-top: 12px;
    padding-top: 12px;
  }

  .full-description {
    margin-bottom: 12px;
  }

  .full-description summary {
    color: #1d4ed8;
    cursor: pointer;
    font-weight: 600;
  }

  .advisory-explanation {
    margin: 12px 0 0;
    color: #64748b;
    font-style: italic;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid #e2e8f0;
  }

  .close-button {
    padding: 9px 18px;
    border: 0;
    border-radius: 8px;
    background: #1d4ed8;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }
</style>
