<script lang="ts">
    import { onMount } from 'svelte';
    import maplibregl from 'maplibre-gl';
    import 'maplibre-gl/dist/maplibre-gl.css';
    import { loadRegionalGeoJSON } from '../../api/MockApi';

    const mapTilerAPIKey: string = import.meta.env.VITE_MAPTILER_API_KEY as string;

    onMount(() => {
        const map = new maplibregl.Map({
        container: 'map',
        style: `https://api.maptiler.com/maps/winter-v2/style.json?key=${mapTilerAPIKey}`,
        center: [-0.1276, 51.5074], // London center
        zoom: 9,
        });

        map.on('load', async () => {
        console.log('Map loaded, loading GeoJSON...');

        const geojson = await loadRegionalGeoJSON('borough');
        console.log('GeoJSON loaded:', geojson);

        geojson.features.forEach((feature, i) => {
            if (feature.id === undefined) {
            feature.id = i;
            }
        });

        map.addSource('boroughs', {
            type: 'geojson',
            data: geojson,
        });

        map.addLayer({
            id: 'boroughs-fill',
            type: 'fill',
            source: 'boroughs',
            paint: {
            'fill-color': [
                'case',
                ['boolean', ['feature-state', 'selected'], false],
                '#f00',
                '#888'
            ],
            'fill-opacity': 0.5,
            },
        });

        map.addLayer({
            id: 'boroughs-outline',
            type: 'line',
            source: 'boroughs',
            paint: {
            'line-color': '#000',
            'line-width': 2,
            },
        });

        let selectedFeatureId: string | number | null = null;
        let hoveredFeatureId: string |number | null = null;

        // Selection click logic (already implemented)
        map.on('click', 'boroughs-fill', (e) => {
            if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            const id = feature.id;

            if (selectedFeatureId !== null && selectedFeatureId !== undefined) {
                map.setFeatureState({ source: 'boroughs', id: selectedFeatureId }, { selected: false });
            }

            // Assign new id only if defined, else null
            selectedFeatureId = id !== undefined ? id : null;

            if (selectedFeatureId !== null && selectedFeatureId !== undefined) {
                map.setFeatureState({ source: 'boroughs', id: selectedFeatureId }, { selected: true });
            }
            console.log('Selected Borough:', feature.properties.lad22nm);
            }
        });

        // Hover logic for getting fid and calling API
        map.on('mousemove', 'boroughs-fill', (e) => {
            if (e.features && e.features.length > 0)  {
            // Reset previous hover state
            if (hoveredFeatureId !== null && hoveredFeatureId !== selectedFeatureId) {
                map.setFeatureState({ source: 'boroughs', id: hoveredFeatureId }, { hover: false });
            }

            hoveredFeatureId = e.features[0].id !== undefined ? e.features[0].id : null;

            if (hoveredFeatureId !== null && hoveredFeatureId !== selectedFeatureId) {
                map.setFeatureState({ source: 'boroughs', id: hoveredFeatureId }, { hover: true });
            }

            const fid = e.features[0].properties.fid;
            console.log('Hovered feature fid:', fid);

            // // API call example (replace with your actual API call)
            // fetch(`https://your-api.example.com/data?fid=${fid}`)
            //     .then(res => res.json())
            //     .then(data => {
            //     console.log('API data for fid', fid, data);
                // You can update your UI with this data here
                // })
                // .catch(err => console.error('API error:', err));
            }
        });

        map.on('mouseleave', 'boroughs-fill', () => {
            if (hoveredFeatureId !== null && hoveredFeatureId !== selectedFeatureId) {
            map.setFeatureState({ source: 'boroughs', id: hoveredFeatureId }, { hover: false });
            }
            hoveredFeatureId = null;
        });


        
        map.on('mouseleave', 'boroughs-fill', () => {
            map.getCanvas().style.cursor = '';
        });

        console.log('GeoJSON layers added with hover and selection');
        });

        map.on('error', (e) => {
        console.error('Map error', e.error);
        });
    });
</script>

<div id="map" style="width: 100vw; height: 100vh;"></div>
