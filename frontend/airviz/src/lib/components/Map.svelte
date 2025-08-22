<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl, { Map } from "maplibre-gl";
  import 'maplibre-gl/dist/maplibre-gl.css';
  import ChartLib from "chart.js/auto";
  import type { Chart } from "chart.js";

  import { 
    fetchCurrentLocation, 
    fetchAllTiles, 
    fetchPollutantData, 
    fetchMapRadius, 
    fetchTileInformation 
  } from '../../api/MockApi';
  import { Pollutants, type Tile, type Coordinates, LevelCategory } from '../constants';

  const mapTilerAPIKey: string = import.meta.env.VITE_MAPTILER_API_KEY as string;

  let currentLocation: Coordinates;
  let mapRadius: number; 
  let allTiles: Tile[];

  let map: Map;
  let chart: Chart | null = null;

  // placeholder date for testing
  const now = new Date("2025-08-11T20:00:00Z").getTime();
  let sliderHour = 0;
  let selectedTimestamp = now;

  // Helper functions
  function filterByTimeRange<T extends { timestamp: string }>(
    data: T[], 
    fromTimestamp: number, 
    toTimestamp: number
  ): T[] {
    return data.filter(d => {
      const t = new Date(d.timestamp).getTime();
      return t >= fromTimestamp && t <= toTimestamp;
    });
  }

  function updateMapSourceData(tiles: Tile[]) {
    if (!map || !map.isStyleLoaded()) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: tiles.map(tile => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [tile.longitude, tile.latitude] },
        properties: {
          id: tile.id,
          red: tile.currentAqiColour.red,
          green: tile.currentAqiColour.green,
          blue: tile.currentAqiColour.blue,
        }
      }))
    };

    if (map.getSource("points")) {
      (map.getSource("points") as maplibregl.GeoJSONSource).setData(geojson);
    } else {
      map.addSource("points", { type: "geojson", data: geojson });
      map.addLayer({
        id: "points-layer",
        type: "circle",
        source: "points",
        paint: {
          "circle-radius": 10,
          "circle-color": [
            "rgb",
            ["*", ["coalesce", ["get", "red"], 0], 255],
            ["*", ["coalesce", ["get", "green"], 0], 255],
            ["*", ["coalesce", ["get", "blue"], 0], 255],
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff"
        }
      });
    }
  }

  async function refreshTiles() {
    if (!currentLocation || !mapRadius) return;
    try {
      const tiles = await fetchAllTiles(
        currentLocation.latitude,
        currentLocation.longitude,
        mapRadius,
        selectedTimestamp
      );
      allTiles = tiles;
      updateMapSourceData(allTiles);
    } catch (err) {
      console.error("Failed to refresh tiles:", err);
    }
  }

  onMount(async () => {
    // Placeholder: Fetch current locations with coordinates
    currentLocation = await fetchCurrentLocation();
    mapRadius = await fetchMapRadius();
    // Placeholder: Fetch all locations on map area with latitude, longitude and radius
    allTiles = await fetchAllTiles(
      currentLocation.latitude, 
      currentLocation.longitude, 
      mapRadius, 
      selectedTimestamp
    );
    initializeMap();
  });

  onDestroy(() => {
    if (map) {
      map.remove();
    }
  });

  function initializeMap() {
    // Create GeoJSON with properties for popups
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: allTiles.map(tile => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [tile.longitude, tile.latitude]},
        properties: {
          id: tile.id,
          red: tile.currentAqiColour.red,
          green: tile.currentAqiColour.green,
          blue: tile.currentAqiColour.blue, 
        }
      }))
    };

    // Initialise the map
    map = new maplibregl.Map({
      container: "map", 
      style: `https://api.maptiler.com/maps/winter-v2/style.json?key=${mapTilerAPIKey}`,
      center: [currentLocation.longitude, currentLocation.latitude],
      zoom: 15
    });
    console.log(`Map initialized center: [${map.getCenter().lng.toFixed(6)}, ${map.getCenter().lat.toFixed(6)}]`);

    map.on("load", () => {
      map.addSource("points", {
        type: "geojson",
        data: geojson
      });

      map.addLayer({
        id: "points-layer",
        type: "circle",
        source: "points",
        paint: {
          "circle-radius": 10,
          "circle-color": [
            "rgb",
            ["*", ["coalesce", ["get", "red"], 0], 255],
            ["*", ["coalesce", ["get", "green"], 0], 255],
            ["*", ["coalesce", ["get", "blue"], 0], 255], 
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff"
        }
      });
      console.log(JSON.stringify(geojson.features, null, 2));

      map.on('moveend', () => {
        const center = map.getCenter();
        currentLocation = { latitude: center.lat, longitude: center.lng };
        refreshTiles();
      });

      let popupIsHovered = false;
      let dotIsHovered = false;
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        anchor: "top",
        className: "map-popup"
      });

      map.on("mouseenter", "points-layer", async (e) => {
        dotIsHovered = true;
        map.getCanvas().style.cursor = "pointer";
        const feature = e.features?.[0];
        if (!feature) return;

        const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const tileId = feature.properties?.id;

        if (!tileId) {
          console.warn("Tile ID not found in feature properties"); 
          return;
        }

        // Initialise pop-up content space
        const popupContent = document.createElement('div'); 
        popupContent.className = 'popup-chart-container';

        // Popup tile information
        const tileInformationDiv = document.createElement('div'); 
        tileInformationDiv.innerHTML = 'Loading tile details...'; 
        tileInformationDiv.className = 'popup-tile-information'; 
        popupContent.appendChild(tileInformationDiv); 

        fetchTileInformation(tileId).then((data) => {
          tileInformationDiv.innerHTML = `
            <strong>Name: ${data.name}</strong><br>
            Region: ${data.region}<br>
            Borough: ${data.boroughRegion}<br>
            View in Google Map
            AQI: <span style="color: ${LevelCategory[data.currentAqiCategoryLevel as 1 | 2 | 3]?.colour ?? 'black'}">${data.currentAqi}<br></span>
            <span style="color: ${LevelCategory[data.currentPm25Level as 1 | 2 | 3]?.colour ?? 'black'}">PM2.5</span>&nbsp;&nbsp;&nbsp;&nbsp;
            <span style="color: ${LevelCategory[data.currentPm10Level as 1 | 2 | 3]?.colour ?? 'black'}">PM10</span>&nbsp;&nbsp;&nbsp;&nbsp;
            <span style="color: ${LevelCategory[data.currentNo2Level as 1 | 2 | 3]?.colour ?? 'black'}">NO2</span>&nbsp;&nbsp;&nbsp;&nbsp;
            <span style="color: ${LevelCategory[data.currentO3Level as 1 | 2 | 3]?.colour ?? 'black'}">O3</span>&nbsp;&nbsp;&nbsp;&nbsp;
            <span style="color: ${LevelCategory[data.currentSo2Level as 1 | 2 | 3]?.colour ?? 'black'}">SO2</span>&nbsp;&nbsp;&nbsp;&nbsp;
            <span style="color: ${LevelCategory[data.currentCoLevel as 1 | 2 | 3]?.colour ?? 'black'}">CO</span>
          `;
        }).catch((error) => {
          tileInformationDiv.innerHTML = `<span style="color: red;">Failed to load tile information.</span>`;
          console.error(error);
        });
      
        // Google map link
        const googleMapLink = document.createElement('a');
        googleMapLink.href = `https://www.google.com/maps?q=${coordinates[1]},${coordinates[0]}`;
        googleMapLink.target = '_blank';
        googleMapLink.rel = 'noopener noreferrer';
        googleMapLink.textContent = 'View Tile in Google Map';

        popupContent.appendChild(googleMapLink);

        try {

          // Placeholder: Fetch last 24 hours' records for the specific Tile ID, PM2.5 and PM10 pollutants
          const [
            pm25Data, 
            pm10Data, 
            no2Data, 
            coData, 
            o3Data, 
            so2Data, 
          ] = await Promise.all([
            fetchPollutantData(tileId, Pollutants.PM25.id), 
            fetchPollutantData(tileId, Pollutants.PM10.id), 
            fetchPollutantData(tileId, Pollutants.NO2.id), 
            fetchPollutantData(tileId, Pollutants.CO.id), 
            fetchPollutantData(tileId, Pollutants.O3.id), 
            fetchPollutantData(tileId, Pollutants.SO2.id), 
          ])

          const showHours = 24;
          const cutoff = selectedTimestamp - showHours * 60 * 60 * 1000; 

          const filteredPm25 = filterByTimeRange(pm25Data, cutoff, selectedTimestamp); 
          const filteredPm10 = filterByTimeRange(pm10Data, cutoff, selectedTimestamp); 
          const filteredNo2 = filterByTimeRange(no2Data, cutoff, selectedTimestamp); 
          const filteredCo = filterByTimeRange(coData, cutoff, selectedTimestamp); 
          const filteredO3 = filterByTimeRange(o3Data, cutoff, selectedTimestamp); 
          const filteredSo2 = filterByTimeRange(so2Data, cutoff, selectedTimestamp); 

          const labels = filteredPm25.map(d => new Date(d.timestamp).toLocaleTimeString([], {
            hour: '2-digit', 
            minute: '2-digit'
          }));

          const popupChartCanvas = document.createElement('canvas'); 
          popupChartCanvas.className = 'popup-chart-canvas'
          popupContent.appendChild(popupChartCanvas); 
          
          popup.setLngLat(coordinates).setDOMContent(popupContent).addTo(map);
          
          if (chart) {
            chart.destroy(); 
            chart = null; 
          }
          
          chart = new ChartLib(
            popupChartCanvas, {
              type: 'line', 
              data: {
                labels: labels, 
                datasets: [
                  {
                    label: 'PM2.5 (µg/m³)',
                    data: filteredPm25.map(d => d.concentration_value),
                    yAxisID: 'y-left',
                    borderColor: 'rgba(255, 99, 132, 1)', 
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'PM10 (µg/m³)',
                    data: filteredPm10.map(d => d.concentration_value),
                    yAxisID: 'y-left',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'NO2 (ppb)',
                    data: filteredNo2.map(d => d.concentration_value),
                    yAxisID: 'y-right',
                    borderColor: 'rgba(255, 206, 86, 1)', 
                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'CO (ppb)',
                    data: filteredCo.map(d => d.concentration_value),
                    yAxisID: 'y-right',
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'O3 (ppb)',
                    data: filteredO3.map(d => d.concentration_value),
                    yAxisID: 'y-right',
                    borderColor: 'rgba(255, 159, 64, 1)',
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'SO2 (ppb)',
                    data: filteredSo2.map(d => d.concentration_value),
                    yAxisID: 'y-right',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: true,
                    tension: 0.3,
                  }
                ]
              }, 
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    display: true,
                    title: {
                      display: true,
                      text: 'Time'
                    }
                  },
                  'y-left': {
                    type: 'linear', 
                    position: 'left', 

                    title: {
                      display: true,
                      text: 'Concentration (µg/m³)'
                    }, 
                    min: 0, 
                  }, 
                  'y-right': {
                    type: 'linear',
                    position: 'right',
                    title: {
                      display: true,
                      text: 'Concentration (Parts Per Billion)'
                    },
                    grid: {
                      drawOnChartArea: false 
                    },
                    min: 0, 
                  }
                },
                plugins: {
                  legend: {
                    display: true,
                    position: 'top', 
                    labels: {
                      font: {
                        size: 10 
                      },
                      usePointStyle: true,
                      padding: 5
                    }
                  }
                },
                layout: {
                  padding: {
                    top: 10,             
                  }
                }
              }
            }
          ); 
          
        } catch (error) {
          console.error("Failed to fetch pollutant data:", error);
          popup.remove();
        }

        setTimeout(() => {
          const popupEl = document.querySelector('.maplibregl-popup');
          if (popupEl) {
            popupEl.addEventListener('mouseenter', () => { popupIsHovered = true; });
            popupEl.addEventListener('mouseleave', () => {
              popupIsHovered = false;
              setTimeout(() => {
                if (!dotIsHovered && !popupIsHovered) {
                  popup.remove();
                }
              }, 10);
            });
          }
        }, 0);
      });

      map.on("mouseleave", "points-layer", () => {
        dotIsHovered = false;
        map.getCanvas().style.cursor = "";
        setTimeout(() => {
          if (!dotIsHovered && !popupIsHovered) {
            popup.remove();
          }
        }, 10);
      });
    });
  };

  $: if (sliderHour !== undefined) {
    selectedTimestamp = now - sliderHour * 3600 * 1000;
    refreshTiles();
  }
</script>

<div class="map-wrapper">
  <div id="map" class="map-landing-container"></div>

  <div class="time-slider-container">
    <label for="timeSlider">Show Hour: {24 - sliderHour}h ago</label>
    <input 
      id="timeSlider" 
      type="range" 
      min="0" 
      max="23" 
      bind:value={sliderHour} 
      step="1" 
    />
    <div class="time-slider-timestamp">
      {new Date(selectedTimestamp).toLocaleString()}
    </div>
  </div>
</div>
