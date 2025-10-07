<script lang="ts">
  import { onMount } from "svelte";
  import maplibregl, { Marker } from "maplibre-gl";
  import type { TileDetails } from "../../constants";

  export let tile: TileDetails;

  let map: maplibregl.Map;
  const mapTilerAPIKey: string = import.meta.env.VITE_MAPTILER_API_KEY as string;

  onMount(() => {
    map = new maplibregl.Map({
      container: "map",
      style: `https://api.maptiler.com/maps/winter-v2/style.json?key=${mapTilerAPIKey}`,
      center: [tile.longitude, tile.latitude],
      zoom: 15
    });
    new Marker({ color: "#008C96" })
    .setLngLat([tile.longitude, tile.latitude])
    .addTo(map);

    return () => map.remove();
  });
</script>

<section class="tile-details-container">
  <h1>{tile.name}</h1>
  <h3>Tile details</h3>

  <div class="content">
    <div class="details-card">
      <div class="details-grid">
        <div><strong>Tile ID:</strong></div>
        <div>{tile.id}</div>
        <div><strong>Region:</strong></div>
        <div>{tile.region}</div>
        <div><strong>Borough Region:</strong></div>
        <div>{tile.boroughRegion}</div>
        {#if tile.description}
          <div><strong>Description:</strong></div>
          <div>{tile.description}</div>
        {/if}
      </div>
    </div>

    <div id="map" class="map-frame"></div>
  </div>
</section>