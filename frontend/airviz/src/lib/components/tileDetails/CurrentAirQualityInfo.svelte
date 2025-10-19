<script lang="ts">
  import { onMount } from "svelte";
  import type { CurrentAirQualityInfo } from "../../constants";
  import { fetchCurrentAirQualityInfo } from "../../../api/LambdaApi";

  export let tileId: number;

  let airQualityInfo: CurrentAirQualityInfo | null = null;
  let error: string | null = null;
  let loading = true;

  onMount(async () => {
    try {
      airQualityInfo = await fetchCurrentAirQualityInfo('tile', tileId);
    } catch (e) {
      error = `Failed to fetch air quality info for tile ID ${tileId}`;
      console.error(error, e);
    } finally {
      loading = false;
    }
  });

  function getDominantHealthImpact() {
    if (!airQualityInfo) return "Unknown";
    const dominant = airQualityInfo.currentRecords.find(
      r => Object.values(airQualityInfo!.dominantPollutant).includes(r.pollutantId)
    );
    return dominant?.impact ?? "Unknown";
  }
</script>

<section class="air-quality-info">
    <h3 class="current-air-quality">Current Air Quality</h3>

    {#if loading}
        <p>Loading air quality info...</p>
    {:else if error}
        <p>{error}</p>
    {:else if airQualityInfo}
      <!-- Cards Section -->
      <div class="current-air-quality-cards">
        <!-- AQI Cards -->
        {#each Object.entries(airQualityInfo.aqi) as [aqiType, aqiValue]}
          <div class="current-air-quality-card">
            <div class="current-air-quality-card-title">{aqiType.toUpperCase()} AQI</div>
            <div class="current-air-quality-card-value">{aqiValue}</div>
            <div class="current-air-quality-card-footer">
              {airQualityInfo.aqiCategory[aqiType] ?? ''}
            </div>
          </div>
        {/each}

        <!-- Dominant Pollutant Cards -->
        {#each Object.entries(airQualityInfo.dominantPollutant) as [aqiType, pollutant]}
          <div class="current-air-quality-card">
            <div class="current-air-quality-card-title">{aqiType.toUpperCase()} Dominant Pollutant</div>
            <div class="current-air-quality-card-value">{pollutant.toUpperCase()}</div>
            <div class="current-air-quality-card-footer">
            </div>
          </div>
        {/each}
      </div>

        <!-- Table Section -->
        <h3 class="pollutant-concentration">Pollutant Concentration</h3>
        <table>
            <thead>
            <tr>
                <th>Pollutant</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Level</th>
                <th>Health Impact</th>
            </tr>
            </thead>
            <tbody>
            {#each airQualityInfo.currentRecords as record}
                <tr>
                <td>{record.pollutantId.toUpperCase()}</td>
                <td>{record.value}</td>
                <td>{record.unit}</td>
                <td>{record.level}</td>
                <td>{record.impact}</td>
                </tr>
            {/each}
            </tbody>
        </table>
    {/if}
</section>