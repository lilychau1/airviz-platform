<script lang="ts">
    import Router from 'svelte-spa-router';
    import MapLanding from './pages/MapLanding.svelte';
    import TileDetails from './pages/TileDetails.svelte';
    import MapAggregate from './pages/MapAggregate.svelte';

    const routes = {
        '/': MapLanding,
        '/tile-details/:id': TileDetails,
        '/aggregate-map': MapAggregate,

    };

</script>

<Router {routes} />