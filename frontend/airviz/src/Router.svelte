<script lang="ts">
    import Router from 'svelte-spa-router';
    import MapLanding from './pages/MapLanding.svelte';

    const routes = {
        '/': MapLanding,
    };

</script>

<Router {routes} />