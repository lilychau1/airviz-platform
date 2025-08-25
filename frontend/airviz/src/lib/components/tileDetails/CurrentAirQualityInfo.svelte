<script lang="ts">
  import { onMount } from "svelte";
  import type { CurrentAirQualityInfo } from "../../constants";
  import { fetchCurrentAirQualityInfo } from "../../../api/MockApi";

  export let tileId: number;

  let airQualityInfo: CurrentAirQualityInfo | null = null;
  let error: string | null = null;
  let loading = true;

  onMount(async () => {
    try {
      airQualityInfo = await fetchCurrentAirQualityInfo(tileId);
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
      r => r.pollutantId === airQualityInfo!.dominantPollutant
    );
    return dominant?.healthImpact ?? "Unknown";
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
            <!-- AQI Card -->
            <div class="current-air-quality-card">
                <div class="current-air-quality-card-title">AQI</div>
                <div class="current-air-quality-card-value">{airQualityInfo.aqi}</div>
                <div class="current-air-quality-card-footer">{airQualityInfo.aqiCategory}</div>
            </div>

            <!-- Dominant Pollutant Card -->
            <div class="current-air-quality-card">
                <div class="current-air-quality-card-title">Dominant Pollutant</div>
                <div class="current-air-quality-card-value">{airQualityInfo.dominantPollutant.toUpperCase()}</div>
                <div class="current-air-quality-card-footer">{getDominantHealthImpact()}</div>
            </div>      
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
                <td>{record.healthImpact}</td>
                </tr>
            {/each}
            </tbody>
        </table>
    {/if}
</section>