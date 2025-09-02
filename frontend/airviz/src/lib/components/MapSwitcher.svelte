<script lang="ts">
  import { location } from 'svelte-spa-router';

  // Local reactive state for checked status
  let isChecked: boolean;

  // When $location changes, update isChecked accordingly
  $: isChecked = $location === '/aggregate-map';

  // Toggle the route on checkbox change
  function toggle() {
    if (isChecked) {
      window.location.hash = '#/aggregate-map';
    } else {
      window.location.hash = '#/';
    }
  }
</script>

<div class="map-switch-toggle-container">
  <label class="map-switch">
    <input
      type="checkbox"
      bind:checked={isChecked}
      on:change={toggle}
    />
    <span class="map-switch-slider"></span>
  </label>
  <span class="map-switch-toggle-label">{isChecked ? 'Switch to Tile' : 'Switch to Region'}</span>
</div>
