<script lang="ts">
    import type { CommuterRailStation } from "#lib/api/commuter-stations.ts";

    let {
        id,
        label,
        stations,
        selectedStopId,
        onStationChange,
        disabled = false,
        excludeStopId = "",
    }: {
        id: string;
        label: string;
        stations: CommuterRailStation[];
        selectedStopId: string;
        onStationChange: (stopId: string) => void;
        disabled?: boolean;
        excludeStopId?: string;
    } = $props();

    // Step 229: Exclude the station selected
    // in the opposite dropdown.
    const availableStations = $derived(
        stations.filter((station) => station.id !== excludeStopId),
    );
</script>

<div class="station-selector">
    <label for={id}>{label}</label>

    <select
        {id}
        value={selectedStopId}
        disabled={disabled || stations.length === 0}
        onchange={(event) => onStationChange(event.currentTarget.value)}
    >
        <option value="" disabled> Select a station </option>

        {#each availableStations as station (station.id)}
            <option value={station.id}>
                {station.name}
            </option>
        {/each}
    </select>
</div>

<style>
    .station-selector {
        width: 100%;
        min-width: 0;
    }

    label {
        display: block;
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: 600;
        color: #334155;
    }

    select {
        display: block;
        width: 100%;
        min-height: 44px;
        padding:  6px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: white;
        color: #0f172a;
        font-size: 15px;
        cursor: pointer;
    }

    select:disabled {
        background: #f1f5f9;
        color: #475569;
        cursor: not-allowed;
    }

    select:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
    }
</style>
