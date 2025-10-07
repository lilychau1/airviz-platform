<script lang="ts">
    import { params } from 'svelte-spa-router';
    import TileDetailsSection from '../lib/components/tileDetails/TileDetailsSection.svelte';
    import { fetchDetails } from '../api/MockLambdaApi';
    import type { TileDetails } from '../lib/constants';
    import CurrentAirQualityInfo from '../lib/components/tileDetails/CurrentAirQualityInfo.svelte';
    import PollutantTimeseriesChart from '../lib/components/tileDetails/PollutantTimeseriesChart.svelte';
    import AqiTimeseriesChart from '../lib/components/tileDetails/AQITimeseriesChart.svelte';
    import HealthRecommendations from '../lib/components/tileDetails/HealthRecommendations.svelte';
    import MetadataSource from '../lib/components/tileDetails/MetadataSource.svelte';

  // Get ID from the route param (string -> number)
    $: tileId = Number($params?.id ?? 0);

    let tileDetails: TileDetails;
    let error: string | null = null;
    let loading = true;

    $: if (tileId) {
        // Reset states when tileId changes
        loading = true;
        error = null;

        fetchDetails('tile', tileId)
            .then(data => {
                tileDetails = data;
            })
            .catch(e => {
                error = `Failed to fetch tile details for tile ID ${tileId}`;
                console.error(error, e);
            })
            .finally(() => {
                loading = false;
            });
    }
</script>

<div class="tile-details-page-content">
    {#if loading}
        <p>Loading tile details for tile ID {tileId}...</p>
    {:else if error}
        <p>{error}</p>
    {:else if tileDetails}
        <!-- Tile details section -->
        <TileDetailsSection tile={tileDetails} />

        <!-- Current air quality section -->
        <CurrentAirQualityInfo tileId={tileId} />

        <!-- Pollutant time series chart -->
        <PollutantTimeseriesChart {tileId} />

        <!-- AQI time series chart -->
        <AqiTimeseriesChart {tileId} />

        <!-- Health recommendations -->
        <HealthRecommendations {tileId} />

        <!-- Metadata and source info -->
        <MetadataSource {tileId} />
    {:else}
        <p>No tile details found.</p>
    {/if}
</div> 