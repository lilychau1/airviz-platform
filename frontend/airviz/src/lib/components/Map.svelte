<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl, { Map } from "maplibre-gl";

  const mapTilerAPIKey: string = import.meta.env.VITE_MAPTILER_API_KEY as string;

  // Placeholder: Marker locations with names and coordinates

  interface Location {
    name: string; 
    coordinates: [number, number]; 
  }

  const locations: Location[] = [
    { name: "Main", coordinates: [-0.09, 51.505] },
    { name: "Nearby 1", coordinates: [-0.091, 51.506] },
    { name: "Nearby 2", coordinates: [-0.088, 51.504] },
    { name: "Nearby 3", coordinates: [-0.092, 51.5055] }
  ];

  // Generate mock PM2.5 and PM10 data
  interface PollutantData {
    time: string; 
    pm25: number; 
    pm10: number; 
  }

  const now = new Date();
  function generateData(): PollutantData[] {
    const data: PollutantData[] = [];
    for (let i = 4; i >= 1; i--) {
      const t = new Date(now.getTime() - i * 15 * 60 * 1000);
      data.push({
        time: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        pm25: (10 + Math.random() * 10),
        pm10: (20 + Math.random() * 10), 
      });
    }
    return data;
  }

  // Create popup HTML string for a location
  function makePopupHTML(loc: Location, data: PollutantData[]): string {
    return `
      <strong>Air Quality Data</strong><br>
      <em>Location: [${loc.coordinates[1].toFixed(4)}, ${loc.coordinates[0].toFixed(4)}]</em>
      <table style="margin-top:0.5em;font-size:90%">
        <tr><th>Time</th><th>PM2.5</th><th>PM10</th></tr>
        ${data.map(d => `<tr><td>${d.time}</td><td>${d.pm25.toFixed(1)}</td><td>${d.pm10.toFixed(1)}</td></tr>`).join("")}
      </table>
    `;
  }

  let map: Map;

  onMount(() => {
    // Create GeoJSON with properties for popups
    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: locations.map(loc => {
        const data = generateData();
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: loc.coordinates},
          properties: { popupHTML: makePopupHTML(loc, data) }
        };
      })
    };

    // Initialise the map
    map = new maplibregl.Map({
      container: "map", 
      style: `https://api.maptiler.com/maps/winter-v2/style.json?key=${mapTilerAPIKey}`,
      center: locations[0].coordinates,
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

      map.on("mouseenter", "points-layer", (e) => {
        dotIsHovered = true;
        map.getCanvas().style.cursor = "pointer";

        const coordinates = (e.features?.[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const html = (e.features?.[0].properties?.popupHTML) as string;

        popup.setLngLat(coordinates).setHTML(html).addTo(map);

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
  });

  onDestroy(() => {
    if (map) {
      map.remove();
    }
  });
</script>

<div id="map" class="map-landing-container"></div>
