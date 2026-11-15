
<script lang="ts">
    import type {
        CommuterRailRoute
    } from '#lib/api/commuter-routes.ts';

    
let {
    routes,
    selectedRouteId,
    onRouteChange,
    disabled = false
}: {
    routes: CommuterRailRoute[];
    selectedRouteId: string;
    onRouteChange: (routeId: string) => void;
    disabled?: boolean;
} = $props();


    const southRoutes = $derived(
        routes.filter(
            (route) => route.terminal === 'south'
        )
    );

    const northRoutes = $derived(
        routes.filter(
            (route) => route.terminal === 'north'
        )
    );
</script>

<div class="line-selector">
    <label for="commuter-rail-line">
        Commuter rail line
    </label>

    <select
        id="commuter-rail-line"
        disabled={disabled}
        value={selectedRouteId}
        onchange={(event) =>
            onRouteChange(event.currentTarget.value)}
    >
        <optgroup label="South Station Lines">
            {#each southRoutes as route (route.id)}
                <option value={route.id}>
                    {route.name}
                </option>
            {/each}
        </optgroup>

        <optgroup label="North Station Lines">
            {#each northRoutes as route (route.id)}
                <option value={route.id}>
                    {route.name}
                </option>
            {/each}
        </optgroup>
    </select>
</div>

<style>
    .line-selector {
        width: 100%;
        margin-bottom: 12px;
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
        padding: 10px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: white;
        color: #0f172a;
        font-size: 15px;
        cursor: pointer;
    }

    select:focus-visible {
        outline: 2px solid #2563eb;
        outline-offset: 2px;
    }

select:disabled {
    background: #f1f5f9;
    color: #475569;
    cursor: not-allowed;
}
</style>
