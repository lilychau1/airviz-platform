<script lang="ts">
    import Router from 'svelte-spa-router';
    import MapLanding from './pages/MapLanding.svelte';
    import TileDetails from './pages/TileDetails.svelte';

    const routes = {
        '/': MapLanding,
        '/tile-details/:id': TileDetails,
    };

</script>

<Router {routes} />