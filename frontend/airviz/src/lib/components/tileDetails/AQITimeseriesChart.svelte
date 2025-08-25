<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import ChartLib from "chart.js/auto";
  import type { Chart } from "chart.js";
  import { fetchAqiData } from "../../../api/MockApi";
  import { AqiTypes } from "../../constants";
  import { filterByTimeRange } from "../../utils/utils";

  export let tileId: number;

  let chart: Chart | null = null;
  let containerDiv: HTMLDivElement;
  let canvasElement: HTMLCanvasElement;

  let filterMode: "last24" | "custom" = "last24";

  const now = new Date("2025-08-11T20:00:00Z");

  // String values bound to inputs
  let customFromStr = toDateTimeLocalString(new Date(now.getTime() - 24 * 3600 * 1000));
  let customToStr = toDateTimeLocalString(now);

  $: customFrom = new Date(customFromStr);
  $: customTo = new Date(customToStr);

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
      if (canvasElement && containerDiv.contains(canvasElement)) {
        containerDiv.removeChild(canvasElement);
      }

      canvasElement = document.createElement("canvas");
      canvasElement.width = 600;
      canvasElement.height = 300;
      containerDiv.appendChild(canvasElement);

      // Fetch both AQI types in parallel
      const [universalData, usData] = await Promise.all([
        fetchAqiData(tileId, AqiTypes.UNIVERSAL.id),
        fetchAqiData(tileId, AqiTypes.US.id),
      ]);

      const filteredUniversal = filterByTimeRange(universalData, cutoff, selectedTimestamp);
      const filteredUs = filterByTimeRange(usData, cutoff, selectedTimestamp);

      const rangeDurationMs = selectedTimestamp - cutoff;
      const showDateOnly = rangeDurationMs > 3 * 24 * 60 * 60 * 1000;

      const labels = filteredUniversal.map(d =>
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
              label: AqiTypes.UNIVERSAL.label,
              data: filteredUniversal.map(d => d.value),
              borderColor: "rgba(255, 99, 132, 1)",
              backgroundColor: "rgba(255, 99, 132, 0.2)",
              fill: true,
              tension: 0.3,
            },
            {
              label: AqiTypes.US.label,
              data: filteredUs.map(d => d.value),
              borderColor: "rgba(54, 162, 235, 1)",
              backgroundColor: "rgba(54, 162, 235, 0.2)",
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
            y: {
              type: "linear",
              position: "left",
              title: {
                display: true,
                text: "AQI",
              },
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
      console.error("Fetching AQI data or chart creation failed", error);
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

<h3>AQI Timeseries Chart</h3>

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
