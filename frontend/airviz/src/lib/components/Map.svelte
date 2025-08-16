
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl, { Map } from "maplibre-gl";
  import 'maplibre-gl/dist/maplibre-gl.css';
  import ChartLib from "chart.js/auto";
  import type { Chart } from "chart.js";

  import {fetchCurrentLocation, fetchAllLocations, fetchPollutantData, fetchMapRadius} from '../../api/MockApi'
  import { Pollutants, type Location, type Coordinate } from '../constants';

  const mapTilerAPIKey: string = import.meta.env.VITE_MAPTILER_API_KEY as string;

  let currentLocation: Coordinate;
  let mapRadius: number; 
  let allLocations: Location[];

  onMount(async () => {
    // Placeholder: Fetch current locations with coordinates
    currentLocation = await fetchCurrentLocation();
    mapRadius = await fetchMapRadius();
    // Placeholder: Fetch all locations on map area with latitude, longitude and radius
    allLocations = await fetchAllLocations(currentLocation.latitude, currentLocation.longitude, mapRadius);
    initializeMap(); // call a separate function to set up the map with allLocations, currentLocation
  });

  let map: Map;
  let chart: Chart | null = null;

  function initializeMap() {
    // Create GeoJSON with properties for popups
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: allLocations.map(loc => ({
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
        const locationId = feature.properties?.id;

        if (!locationId) {
          console.warn("Location ID not found in feature properties"); 
          return;
        }
        
        try {

          // Placeholder: Fetch last 24 hours' records for the specific location ID, PM2.5 and PM10 pollutants
          const [pm25Data, pm10Data] = await Promise.all([
            fetchPollutantData(locationId, Pollutants.PM25.id), 
            fetchPollutantData(locationId, Pollutants.PM10.id), 
          ])
          
          const popupContent = document.createElement('div'); 
          popupContent.className = 'popup-chart-container'

          // Popup information
          const popupInfoDiv = document.createElement('div'); 
          popupInfoDiv.innerHTML = `
            <strong>Location Info</strong><br>
            ID: ${locationId}<br>
            Latitude: ${coordinates[1].toFixed(3)}, Longitude: ${coordinates[0].toFixed(3)}
          `;
          popupInfoDiv.className = 'popup-info'
          popupContent.appendChild(popupInfoDiv);

          // placeholder date for testing
          // const now = Date.now();
          const now = new Date("2025-08-11T20:00:00Z").getTime();
          const showHours = 24;
          const cutoff = now - showHours * 60 * 60 * 1000; 

          const filteredPm25 = pm25Data.filter(d => (new Date(d.timestamp)).getTime() >= cutoff)
          const filteredPm10 = pm10Data.filter(d => (new Date(d.timestamp)).getTime() >= cutoff)
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
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: true,
                    tension: 0.3,
                  },
                  {
                    label: 'PM10 (µg/m³)',
                    data: filteredPm10.map(d => d.concentration_value),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
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
                  y: {
                    display: true,
                    title: {
                      display: true,
                      text: 'Concentration (µg/m³)'
                    }
                  }
                },
                plugins: {
                  legend: {
                    display: true,
                  }
                },
                interaction: {
                  mode: 'nearest',
                  intersect: false
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
