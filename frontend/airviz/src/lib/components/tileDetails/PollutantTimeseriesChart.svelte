<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import ChartLib from "chart.js/auto";
  import type { Chart } from "chart.js";
  import { fetchPollutantData } from "../../../api/MockLambdaApi";

  export let tileId: number;

  let chart: Chart | null = null;
  let containerDiv: HTMLDivElement;
  let canvasElement: HTMLCanvasElement;

  let filterMode: "last24" | "custom" = "last24";

  const now = new Date("2025-08-11T20:00:00Z");

  // String values for inputs bound to datetime-local
  let customFromStr = toDateTimeLocalString(new Date(now.getTime() - 24 * 3600 * 1000));
  let customToStr = toDateTimeLocalString(now);

  $: customFrom = new Date(customFromStr);
  $: customTo = new Date(customToStr);

  // Normalize to hour only
  $: {
    customFrom.setMinutes(0, 0, 0);
    customTo.setMinutes(0, 0, 0);
  }

  $: selectedTimestamp = filterMode === "last24" ? now.getTime() : customTo.getTime();
  $: showHours =
    filterMode === "last24"
      ? 24
      : (customTo.getTime() - customFrom.getTime()) / (1000 * 60 * 60);
  $: cutoff =
    filterMode === "last24"
      ? selectedTimestamp - showHours * 60 * 60 * 1000
      : customFrom.getTime();

  function toDateTimeLocalString(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hour = date.getHours().toString().padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:00`;
  }

  async function createChart() {
    if (!tileId || !containerDiv) return;

    try {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      // Remove old canvas after destroying chart
      if (canvasElement && containerDiv.contains(canvasElement)) {
        containerDiv.removeChild(canvasElement);
      }

      // Create new canvas
      canvasElement = document.createElement("canvas");
      canvasElement.width = 600;
      canvasElement.height = 300;
      containerDiv.appendChild(canvasElement);

      const selectedTimestampPeriod = {start: cutoff, end: selectedTimestamp};
      const pollutantData = await fetchPollutantData('tile', tileId, selectedTimestampPeriod);

      const rangeDurationMs = selectedTimestamp - cutoff;
      const showDateOnly = rangeDurationMs > 3 * 24 * 60 * 60 * 1000;

      const labels = pollutantData.map((d) =>
        showDateOnly
          ? new Date(d.timestamp).toLocaleDateString()
          : new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );

      chart = new ChartLib(canvasElement.getContext("2d")!, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "PM2.5 (µg/m³)",
              data: pollutantData.map((d) => d.pm25Value),
              yAxisID: "y-left",
              borderColor: "rgba(255, 99, 132, 1)",
              backgroundColor: "rgba(255, 99, 132, 0.2)",
              fill: true,
              tension: 0.3,
            },
            {
              label: "PM10 (µg/m³)",
              data: pollutantData.map((d) => d.pm10Value),
              yAxisID: "y-left",
              borderColor: "rgba(54, 162, 235, 1)",
              backgroundColor: "rgba(54, 162, 235, 0.2)",
              fill: true,
              tension: 0.3,
            },
            {
              label: "NO2 (ppb)",
              data: pollutantData.map((d) => d.no2Value),
              yAxisID: "y-right",
              borderColor: "rgba(255, 206, 86, 1)",
              backgroundColor: "rgba(255, 206, 86, 0.2)",
              fill: true,
              tension: 0.3,
            },
            {
              label: "CO (ppb)",
              data: pollutantData.map((d) => d.coValue),
              yAxisID: "y-right",
              borderColor: "rgba(153, 102, 255, 1)",
              backgroundColor: "rgba(153, 102, 255, 0.2)",
              fill: true,
              tension: 0.3,
            },
            {
              label: "O3 (ppb)",
              data: pollutantData.map((d) => d.o3Value),
              yAxisID: "y-right",
              borderColor: "rgba(255, 159, 64, 1)",
              backgroundColor: "rgba(255, 159, 64, 0.2)",
              fill: true,
              tension: 0.3,
            },
            {
              label: "SO2 (ppb)",
              data: pollutantData.map((d) => d.so2Value),
              yAxisID: "y-right",
              borderColor: "rgba(75, 192, 192, 1)",
              backgroundColor: "rgba(75, 192, 192, 0.2)",
              fill: true,
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              display: true,
              title: {
                display: true,
                text: "Time",
              },
            },
            "y-left": {
              type: "linear",
              position: "left",
              title: {
                display: true,
                text: "Concentration (µg/m³)",
              },
              min: 0,
            },
            "y-right": {
              type: "linear",
              position: "right",
              title: {
                display: true,
                text: "Concentration (Parts Per Billion)",
              },
              grid: { drawOnChartArea: false },
              min: 0,
            },
          },
          plugins: {
            legend: {
              display: true,
              position: "right",
              align: "start", 
              labels: {
                font: { size: 10 },
                usePointStyle: true,
                padding: 20,
              },
            },
          },
          layout: {
            padding: {
              top: 10,
            },
          },
        },
      });
    } catch (error) {
      console.error("Polling data or chart creation failed", error);
    }
  }

  onMount(() => {
    createChart();
  });

  onDestroy(() => {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  });

  $: if (tileId && (filterMode === "last24" || (customFromStr && customToStr))) {
    createChart();
  }

  function selectFilter(mode: "last24" | "custom") {
    filterMode = mode;
    if (mode === "last24") {
      customToStr = toDateTimeLocalString(new Date(now));
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      customFromStr = toDateTimeLocalString(yesterday);
    }
  }
</script>

<h3>Pollutant Concentration Timeseries</h3>

<div class="details-chart-filter-buttons">
  <button
    type="button"
    class="details-chart-filter-button"
    class:selected={filterMode === 'last24'}
    on:click={() => selectFilter("last24")}
  >
    Last 24 Hours
  </button>
  <button
    type="button"
    class="details-chart-filter-button"
    class:selected={filterMode === 'custom'}
    on:click={() => selectFilter("custom")}
  >
    Custom
  </button>
</div>

{#if filterMode === "custom"}
  <div class="date-pickers">
    <input
      type="datetime-local"
      bind:value={customFromStr}
      max={customToStr}
      step="3600"
      on:change={() => {
        if (new Date(customFromStr) > new Date(customToStr)) {
          customToStr = customFromStr;
        }
      }}
    />
    <input
      type="datetime-local"
      bind:value={customToStr}
      min={customFromStr}
      step="3600"
      on:change={() => {
        if (new Date(customToStr) < new Date(customFromStr)) {
          customFromStr = customToStr;
        }
      }}
    />
  </div>
{/if}

<div class="details-chart-container" bind:this={containerDiv}></div>
