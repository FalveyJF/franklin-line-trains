<script lang="ts">
    import { onMount } from "svelte";

    import { getCommuterRailAlerts } from "#lib/api/alerts.ts";

    import {
        getActiveStationNotices,
        type StationNotice,
    } from "#lib/alert-filtering.ts";

    import {
        getUpcomingShuttleNotices,
        getActiveLineScheduleAdvisories,
        type UpcomingShuttleNotice,
        type LineScheduleAdvisory,
    } from "#lib/service-disruptions.ts";

    import type { MBTAAlert } from "#lib/api/alerts.ts";

    // Notify the parent page when fresh alerts are available.

    let {
        routeId,
        originStationName,
        destinationStationName,
        onAlertsUpdated,
    }: {
        routeId: string;
        originStationName: string;
        destinationStationName: string;
        onAlertsUpdated?: (alerts: MBTAAlert[]) => void;
    } = $props();

    // Station notices refresh every 5 minutes.
    const NOTICE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

    let notices = $state<StationNotice[]>([]);

    let upcomingShuttles = $state<UpcomingShuttleNotice[]>([]);

    let currentServiceChanges = $state<LineScheduleAdvisory[]>([]);

    let loading = $state(true);
    let refreshing = $state(false);
    let errorMessage = $state("");

    let lastChecked = $state<number | null>(null);

    // Used to avoid overlapping requests.
    let requestInProgress = false;

    // Used to prevent updates after component cleanup.
    let componentActive = false;

    /**
     * Retrieve Line alerts and identify
     * current station notices.
     *
     * If refreshing fails, retain the previous notices.
     */
    async function loadNotices() {
        if (requestInProgress) {
            return;
        }

        requestInProgress = true;

        const isInitialLoad = lastChecked === null;

        if (isInitialLoad) {
            loading = true;
        } else {
            refreshing = true;
        }

        errorMessage = "";

        try {
            const alerts = await getCommuterRailAlerts(routeId);

            if (!componentActive) {
                return;
            }

            // Share the successful API response with the main page.
            onAlertsUpdated?.(alerts);

            // Recalculate which notices are active now.

            const checkedAt = new Date();

            notices = getActiveStationNotices(alerts, checkedAt);

            upcomingShuttles = getUpcomingShuttleNotices(alerts, checkedAt);

            currentServiceChanges = getActiveLineScheduleAdvisories(
                alerts,
                checkedAt,
            );

            // console.log(
            //     "Current  Line service changes:",
            //     currentServiceChanges,
            // );

            lastChecked = checkedAt.getTime();

            // console.log(
            //     "Upcoming  Line shuttle notices:",
            //     upcomingShuttles,
            // );

            lastChecked = Date.now();

            // console.log("Active Line station notices:", notices);
        } catch (error) {
            if (!componentActive) {
                return;
            }

            console.error("Unable to refresh station notices:", error);

            errorMessage = isInitialLoad
                ? "Station notices could not be retrieved."
                : "Station notice refresh failed. Previous notices are shown.";
        } finally {
            requestInProgress = false;

            if (componentActive) {
                loading = false;
                refreshing = false;
            }
        }
    }

    /**
     * Format the latest successful check time
     * using Eastern Time.
     */
    function formatCheckedTime(timestamp: number): string {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: "America/New_York",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        }).format(new Date(timestamp));
    }

    onMount(() => {
        componentActive = true;

        // Retrieve notices immediately.
        void loadNotices();

        // Refresh them every 10 minutes.
        const timer = window.setInterval(
            () => void loadNotices(),
            NOTICE_REFRESH_INTERVAL_MS,
        );

        // Clean up when the component is removed.
        return () => {
            componentActive = false;
            window.clearInterval(timer);
        };
    });
</script>

{#if loading}
    <section class="notices" aria-label="Station notices">
        <h2>Station Notices</h2>
        <p class="message">Checking station notices...</p>
    </section>
{:else if notices.length > 0 || errorMessage}
    <section class="notices" aria-label="Station notices">
        <h2>Station Notices</h2>

        {#if errorMessage}
            <p class="error" role="status">
                {errorMessage}
            </p>
        {/if}

        {#each notices as notice (`${notice.id}-${notice.station}`)}
            <article class="notice">
                <p class="station-name">
                    {notice.station}
                </p>

                <p class="notice-heading">
                    {notice.heading}
                </p>

                {#if notice.description}
                    <details class="notice-details">
                        <summary>Additional alert details</summary>

                        <p class="notice-description">
                            {notice.description}
                        </p>
                    </details>
                {/if}
            </article>
        {/each}

        {#if notices.length > 0}
            <p class="explanation">
                Station notices describe facilities or conditions at stations.
                They do not necessarily indicate train delays or cancellations.
            </p>
        {/if}

        <p class="refresh-status">
            {#if refreshing}
                Checking for updated station notices...
            {:else if lastChecked !== null}
                Station notices checked:
                {formatCheckedTime(lastChecked)}
            {/if}
        </p>
    </section>
{/if}

{#if currentServiceChanges.length > 0}
    <section class="current-changes" aria-label="Current service changes">
        <h2>Current Service Changes</h2>

        {#each currentServiceChanges as change (change.id)}
            <article class="current-change-notice">
                <p class="current-change-label">
                    Commuter rail schedule advisory
                </p>

                <p class="current-change-heading">
                    {change.heading}
                </p>

                {#if change.description}
                    <details class="notice-details">
                        <summary>
                            Additional schedule and shuttle details
                        </summary>

                        <p class="notice-description">
                            {change.description}
                        </p>
                    </details>
                {/if}
            </article>
        {/each}

        <p class="explanation">
            These advisories describe changes affecting portions of the
            Franklin/Foxboro Line. They do not necessarily affect every train
            between South Station and Norwood Central.
        </p>
    </section>
{/if}

{#if upcomingShuttles.length > 0}
    <section class="upcoming-changes" aria-label="Upcoming service changes">
        <h2>Upcoming Service Changes</h2>

        {#each upcomingShuttles as shuttle (shuttle.id)}
            <article class="shuttle-notice">
                <p class="shuttle-label">Upcoming shuttle service</p>

                <p class="shuttle-heading">
                    {shuttle.heading}
                </p>

                {#if shuttle.description}
                    <details class="notice-details">
                        <summary>Shuttle stop details</summary>

                        <p class="notice-description">
                            {shuttle.description}
                        </p>
                    </details>
                {/if}
            </article>
        {/each}

        <p class="explanation">
            These advisories describe upcoming changes on the selected commuter
            rail line. They do not necessarily affect your selected journey.
        </p>
    </section>
{/if}

<style>
    .notices {
        margin-top: 24px;
    }

    h2 {
        margin: 0 0 12px;
        font-size: 20px;
        color: #172554;
    }

    .notice {
        margin-bottom: 12px;
        padding: 16px;
        border: 1px solid #93c5fd;
        border-left: 4px solid #2563eb;
        border-radius: 10px;
        background: white;
    }

    .station-name {
        margin: 0 0 8px;
        color: #1e40af;
        font-size: 14px;
        font-weight: bold;
    }

    .notice-heading {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.6;
        color: #1f2937;
        overflow-wrap: anywhere;
    }

    .notice-details {
        margin-top: 12px;
    }

    .notice-details summary {
        color: #1d4ed8;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }

    .notice-description {
        margin: 10px 0 0;
        font-size: 13px;
        line-height: 1.5;
        color: #475569;
        white-space: pre-line;
    }

    .explanation {
        font-size: 12px;
        line-height: 1.5;
        color: #64748b;
    }

    .refresh-status {
        margin-top: 12px;
        font-size: 12px;
        color: #64748b;
    }

    .message {
        font-size: 14px;
        color: #64748b;
    }

    .error {
        padding: 10px;
        border-radius: 8px;
        background: #fff7ed;
        color: #9a3412;
        font-size: 13px;
        line-height: 1.5;
    }

    .upcoming-changes {
        margin-top: 24px;
    }

    .shuttle-notice {
        margin-bottom: 12px;
        padding: 16px;
        border: 1px solid #fbbf24;
        border-left: 4px solid #d97706;
        border-radius: 10px;
        background: white;
    }

    .shuttle-label {
        margin: 0 0 8px;
        color: #92400e;
        font-size: 14px;
        font-weight: bold;
    }

    .shuttle-heading {
        margin: 0;
        color: #1f2937;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.6;
        overflow-wrap: anywhere;
    }

    .current-changes {
        margin-top: 24px;
    }

    .current-change-notice {
        margin-bottom: 12px;
        padding: 16px;
        border: 1px solid #fdba74;
        border-left: 4px solid #ea580c;
        border-radius: 10px;
        background: white;
    }

    .current-change-label {
        margin: 0 0 8px;
        color: #9a3412;
        font-size: 14px;
        font-weight: bold;
    }

    .current-change-heading {
        margin: 0;
        color: #1f2937;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.6;
        overflow-wrap: anywhere;
    }
</style>
