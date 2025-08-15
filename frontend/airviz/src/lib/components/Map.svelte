
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl, { Map } from "maplibre-gl";
  import {fetchCurrentLocation, fetchAllLocations, fetchPollutantData, fetchMapRadius, type Coordinate, type Location} from '../MockApi'
  import { POLLUTANTS } from '../constants';

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

  function initializeMap() {
    // Create GeoJSON with properties for popups
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: allLocations.map(loc => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [loc.longitude, loc.latitude]},
        properties: {
          id: loc.id,
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
          "circle-color": "#0078a8",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff"
        }
      });
      map.on('move', () => {
        const center = map.getCenter();
        console.log(`Map moved to: [${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}]`);
      });

      map.on('moveend', () => {
        const center = map.getCenter();
        console.log(`Map move ended at: [${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}]`);
      });

      let popupIsHovered = false;
      let dotIsHovered = false;
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        anchor: "top",
        className: "custom-popup"
      }).setOffset([125, -800]);

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
          // Placeholder: Fetch last 5 records for the specific location ID, PM2.5 and PM10 pollutants
          const [pm25Data, pm10Data] = await Promise.all([
            fetchPollutantData(locationId, POLLUTANTS.PM25.id), 
            fetchPollutantData(locationId, POLLUTANTS.PM10.id), 
          ])

          const rows = []; 
          const maxRecords = 5;
          const length = Math.min(pm25Data.length, pm10Data.length, maxRecords); // limit to 5 records or less
          
          for (let i = length - 1; i >= 0; i--) {

            const pm25Record = pm25Data[i];
            console.log("PM2.5 Data:", pm25Data);

            const pm10Record = pm10Data[i];
            console.log("PM10 Data:", pm10Data);

            if (!pm25Record || !pm10Record) continue;  // skip if missing

            const timestamp = new Date(pm25Record.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const pm25 = pm25Record.concentration_value != null ? pm25Record.concentration_value.toFixed(1) : "N/A";
            const pm10 = pm10Record.concentration_value != null ? pm10Record.concentration_value.toFixed(1) : "N/A";

            rows.push(`<tr><td>${timestamp}</td><td>${pm25}</td><td>${pm10}</td></tr>`);
          }

          const popupHTML = `
            <strong>Air Quality Data</strong><br>
            <em>Location ID: ${locationId}</em>
            <table style="margin-top:0.5em;font-size:90%">
              <tr><th>Time</th><th>PM2.5 (µg/m³)</th><th>PM10 (µg/m³)</th></tr>
              ${rows.join("")}
            </table>
          `;

          popup.setLngLat(coordinates).setHTML(popupHTML).addTo(map);

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
