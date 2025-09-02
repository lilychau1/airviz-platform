<script lang="ts">
    import Router from 'svelte-spa-router';
    import MapLanding from './pages/MapLanding.svelte';
    import TileDetails from './pages/TileDetails.svelte';
    import MapAggregate from './pages/MapAggregate.svelte';
    import About from './pages/About.svelte';
    import Contact from './pages/Contact.svelte';

    const routes = {
        '/': MapLanding,
        '/map': MapLanding,
        '/tile-details/:id': TileDetails,
        '/aggregate-map': MapAggregate,
        '/about': About,
        '/contact': Contact,
    };

</script>

<Router {routes} />