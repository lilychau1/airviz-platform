
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl, { Map } from "maplibre-gl";
  import 'maplibre-gl/dist/maplibre-gl.css';
  import ChartLib from "chart.js/auto";
  import type { Chart } from "chart.js";

  import {fetchCurrentLocation, fetchAllTiles as fetchAllTiles, fetchPollutantData, fetchMapRadius} from '../../api/MockApi'
  import { Pollutants, type Tile, type Coordinate } from '../constants';

  const mapTilerAPIKey: string = import.meta.env.VITE_MAPTILER_API_KEY as string;

  let currentLocation: Coordinate;
  let mapRadius: number; 
  let allTiles: Tile[];

  onMount(async () => {
    // Placeholder: Fetch current locations with coordinates
    currentLocation = await fetchCurrentLocation();
    mapRadius = await fetchMapRadius();
    // Placeholder: Fetch all locations on map area with latitude, longitude and radius
    allTiles = await fetchAllTiles(currentLocation.latitude, currentLocation.longitude, mapRadius);
    initializeMap(); // call a separate function to set up the map with allLocations, currentLocation
  });

  let map: Map;
  let chart: Chart | null = null;

  function initializeMap() {
    // Create GeoJSON with properties for popups
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: allTiles.map(loc => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [loc.longitude, loc.latitude]},
        properties: {
          id: loc.id,
          red: loc.currentAqiColour.red,
          green: loc.currentAqiColour.green,
          blue: loc.currentAqiColour.blue, 
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
            ["*", ["get", "red"], 255],
            ["*", ["get", "green"], 255],
            ["*", ["get", "blue"], 255]
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff"
        }
      });
      // console.log(JSON.stringify(geojson.features, null, 2));

      map.on('move', () => {
        const center = map.getCenter();
        // console.log(`Map moved to: [${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}]`);
      });

      map.on('moveend', () => {
        const center = map.getCenter();
        // console.log(`Map move ended at: [${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}]`);
      });

      let popupIsHovered = false;
      let dotIsHovered = false;
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        // offset: [25, -1200], 
        anchor: "top",
        className: "map-popup"
      });
      // });

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
          
          const popupContent = document.createElement('div'); 
          popupContent.className = 'popup-chart-container'

          // Popup information
          const popupInfoDiv = document.createElement('div'); 
          popupInfoDiv.innerHTML = `
            <strong>Tile Info</strong><br>
            ID: ${tileId}<br>
            Latitude: ${coordinates[1].toFixed(3)}, Longitude: ${coordinates[0].toFixed(3)}
          `;
          popupInfoDiv.className = 'popup-info'
          popupContent.appendChild(popupInfoDiv);

          // placeholder date for testing
          // const now = Date.now();
          const now = new Date("2025-08-11T20:00:00Z").getTime();
          const showHours = 24;
          const cutoff = now - showHours * 60 * 60 * 1000; 

          const filteredPm25 = pm25Data.filter(d => (new Date(d.timestamp)).getTime() >= cutoff); 
          const filteredPm10 = pm10Data.filter(d => (new Date(d.timestamp)).getTime() >= cutoff); 
          const filteredNo2 = no2Data.filter(d => (new Date(d.timestamp)).getTime() >= cutoff); 
          const filteredCo = coData.filter(d => (new Date(d.timestamp)).getTime() >= cutoff); 
          const filteredO3 = o3Data.filter(d => (new Date(d.timestamp)).getTime() >= cutoff); 
          const filteredSo2 = so2Data.filter(d => (new Date(d.timestamp)).getTime() >= cutoff); 

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
                    borderColor: 'rgba(255, 99, 132, 1)',        // Red
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'PM10 (µg/m³)',
                    data: filteredPm10.map(d => d.concentration_value),
                    yAxisID: 'y-left',
                    borderColor: 'rgba(54, 162, 235, 1)',        // Blue
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'NO2 (ppb)',
                    data: filteredNo2.map(d => d.concentration_value),
                    yAxisID: 'y-right',
                    borderColor: 'rgba(255, 206, 86, 1)',         // Yellow
                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'CO (ppb)',
                    data: filteredCo.map(d => d.concentration_value),
                    yAxisID: 'y-right',
                    borderColor: 'rgba(153, 102, 255, 1)',        // Purple
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'O3 (ppb)',
                    data: filteredO3.map(d => d.concentration_value),
                    yAxisID: 'y-right',
                    borderColor: 'rgba(255, 159, 64, 1)',         // Orange
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'SO2 (ppb)',
                    data: filteredSo2.map(d => d.concentration_value),
                    yAxisID: 'y-right',
                    borderColor: 'rgba(75, 192, 192, 1)',         // Teal
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

  onDestroy(() => {
    if (map) {
      map.remove();
    }
  });
</script>

<div id="map" class="map-landing-container"></div>
