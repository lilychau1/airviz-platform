<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
    import 'maplibre-gl/dist/maplibre-gl.css';
    import ChartLib from "chart.js/auto";
    import type { Chart } from "chart.js";

    import { 
        fetchCurrentLocation, 
        fetchAllRegions, 
        fetchPollutantData, 
        fetchMapRadius, 
        fetchPopupInformation, 
        loadRegionalGeoJSON

    } from '../../api/MockApi';
    import { Pollutants, type RegionUnit, type Coordinates, LevelCategory } from '../constants';
    import { filterByTimeRange } from '../utils/utils';
    
    const mapTilerAPIKey: string = import.meta.env.VITE_MAPTILER_API_KEY as string;

    let currentLocation: Coordinates;
    let mapRadius: number; 
    let allRegions: RegionUnit[];

    let map: MapLibreMap;
    let chart: Chart | null = null;

    // placeholder date for testing
    const now = new Date("2025-08-11T20:00:00Z").getTime();
    let sliderHour = 0;
    let selectedTimestamp = now;

    onMount(async () => {
        // Placeholder: Fetch current locations with coordinates
        currentLocation = await fetchCurrentLocation();
        mapRadius = await fetchMapRadius();
        // Placeholder: Fetch all locations on map area with latitude, longitude and radius
        allRegions = await fetchAllRegions(
            'borough', 
            currentLocation.latitude, 
            currentLocation.longitude, 
            mapRadius, 
            selectedTimestamp
        );
        const geojsonBorough = await loadRegionalGeoJSON('borough');

        initialiseMap(geojsonBorough);
    });

    onDestroy(() => {
        if (map) {
            map.remove();
        }
    });

    function initialiseMap(geojson_: GeoJSON.FeatureCollection) {
        
        const geojson: GeoJSON.FeatureCollection = geojson_
        
        // Create a map from region ID to the extra region info for fast lookup
        const extraRegionDataMap = new Map<number, RegionUnit>();
        for (const region of allRegions) {
            extraRegionDataMap.set(region.id, region);
        }

        geojson.features.forEach(feature => {
        const id = feature.properties?.fid;
        if (id !== undefined) {
            const numericId = typeof id === 'string' ? Number(id) : id;
            if (extraRegionDataMap.has(numericId)) {
                const extraData = extraRegionDataMap.get(numericId);
                if (extraData !== undefined) {
                    feature.properties = {
                        ...feature.properties,
                        longitude: extraData.longitude,
                        latitude: extraData.latitude,
                        currentAqiColour: extraData.currentAqiColour,
                        // Method 2: flatten initially when expanding feature properties
                        // currentAqiColourRed: extraData.currentAqiColour.red,
                        // currentAqiColourGreen: extraData.currentAqiColour.green,
                        // currentAqiColourBlue: extraData.currentAqiColour.blue,
                    };
                }
            }
        }
        });


        // Initialise the map
        map = new maplibregl.Map({
            container: "map", 
            style: `https://api.maptiler.com/maps/winter-v2/style.json?key=${mapTilerAPIKey}`,
            center: [currentLocation.longitude, currentLocation.latitude],
            zoom: 10

        });
        
        console.log(`Map initialized center: [${map.getCenter().lng.toFixed(6)}, ${map.getCenter().lat.toFixed(6)}]`);
        
        map.on('load', () => {

            map.addSource('borough', {
                type: 'geojson',
                data: geojson,
            });
            
            console.log("First borough feature properties:", geojson.features[0]?.properties);
            // console.log("First borough feature properties:", geojson.features[0].properties?.currentAqiColour);
            map.addLayer({
                id: 'boroughs-fill',
                type: 'fill',
                source: 'borough',
                paint: {
                    'fill-color': [
                    'rgb',
                        ["*", ["coalesce", ["get", "red", ["get", "currentAqiColour"]], 0], 255],
                        // method 2
                        // ["*", ["coalesce", ["get", "red"], 0], 255],
                        ["*", ["coalesce", ["get", "green", ["get", "currentAqiColour"]], 0], 255],
                        ["*", ["coalesce", ["get", "blue", ["get", "currentAqiColour"]], 0], 255],
                    ],
                    'fill-opacity': 0.5,
                },
            });
        })

    //         map.on('moveend', () => {
    //             const center = map.getCenter();
    //             currentLocation = { latitude: center.lat, longitude: center.lng };
    //             refreshTiles();
    //         });

    //         let popupIsHovered = false;
    //         let dotIsHovered = false;
    //         const popup = new maplibregl.Popup({
    //             closeButton: false,
    //             closeOnClick: false,
    //             anchor: "top",
    //             className: "map-popup"
    //         });

    //         map.on("mouseenter", "points-layer", async (e) => {
    //             dotIsHovered = true;
    //             map.getCanvas().style.cursor = "pointer";
    //             const feature = e.features?.[0];
    //             if (!feature) return;

    //             const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    //             const tileId = feature.properties?.id;

    //             if (!tileId) {
    //                 console.warn("Tile ID not found in feature properties"); 
    //                 return;
    //             }

    //             // Initialise pop-up content space
    //             const popupContent = document.createElement('div'); 
    //             popupContent.className = 'popup-chart-container';

    //             // Popup tile information
    //             const tileInformationDiv = document.createElement('div'); 
    //             tileInformationDiv.innerHTML = 'Loading tile details...'; 
    //             tileInformationDiv.className = 'popup-tile-information'; 
    //             popupContent.appendChild(tileInformationDiv); 

    //             fetchPopupInformation('tile', tileId).then((data) => {
    //                 tileInformationDiv.innerHTML = `
    //                     <strong>Name: ${data.name}</strong><br>
    //                     Region: ${data.region}<br>
    //                     Borough: ${data.boroughRegion}<br>
    //                     View in Google Map
    //                     AQI: <span style="color: ${LevelCategory[data.currentAqiCategoryLevel as 1 | 2 | 3]?.colour ?? 'black'}">${data.currentAqi}<br></span>
    //                     <span style="color: ${LevelCategory[data.currentPm25Level as 1 | 2 | 3]?.colour ?? 'black'}">PM2.5</span>&nbsp;&nbsp;&nbsp;&nbsp;
    //                     <span style="color: ${LevelCategory[data.currentPm10Level as 1 | 2 | 3]?.colour ?? 'black'}">PM10</span>&nbsp;&nbsp;&nbsp;&nbsp;
    //                     <span style="color: ${LevelCategory[data.currentNo2Level as 1 | 2 | 3]?.colour ?? 'black'}">NO2</span>&nbsp;&nbsp;&nbsp;&nbsp;
    //                     <span style="color: ${LevelCategory[data.currentO3Level as 1 | 2 | 3]?.colour ?? 'black'}">O3</span>&nbsp;&nbsp;&nbsp;&nbsp;
    //                     <span style="color: ${LevelCategory[data.currentSo2Level as 1 | 2 | 3]?.colour ?? 'black'}">SO2</span>&nbsp;&nbsp;&nbsp;&nbsp;
    //                     <span style="color: ${LevelCategory[data.currentCoLevel as 1 | 2 | 3]?.colour ?? 'black'}">CO</span>
    //                 `;
    //             }).catch((error) => {
    //                 tileInformationDiv.innerHTML = `<span style="color: red;">Failed to load tile information.</span>`;
    //                 console.error(error);
    //             });
            
    //             // Google map link
    //             const googleMapLink = document.createElement('a');
    //             googleMapLink.href = `https://www.google.com/maps?q=${coordinates[1]},${coordinates[0]}`;
    //             googleMapLink.target = '_blank';
    //             googleMapLink.rel = 'noopener noreferrer';
    //             googleMapLink.textContent = 'View Tile in Google Map';

    //             popupContent.appendChild(googleMapLink);

    //             try {
    //                 // Placeholder: Fetch last 24 hours' records for the specific Tile ID, PM2.5 and PM10 pollutants
    //                 const [
    //                     pm25Data, 
    //                     pm10Data, 
    //                     no2Data, 
    //                     coData, 
    //                     o3Data, 
    //                     so2Data, 
    //                 ] = await Promise.all([
    //                     fetchPollutantData('tile', tileId, Pollutants.PM25.id), 
    //                     fetchPollutantData('tile', tileId, Pollutants.PM10.id), 
    //                     fetchPollutantData('tile', tileId, Pollutants.NO2.id), 
    //                     fetchPollutantData('tile', tileId, Pollutants.CO.id), 
    //                     fetchPollutantData('tile', tileId, Pollutants.O3.id), 
    //                     fetchPollutantData('tile', tileId, Pollutants.SO2.id), 
    //                 ]);

    //                 const showHours = 24;
    //                 const cutoff = selectedTimestamp - showHours * 60 * 60 * 1000; 

    //                 const filteredPm25 = filterByTimeRange(pm25Data, cutoff, selectedTimestamp); 
    //                 const filteredPm10 = filterByTimeRange(pm10Data, cutoff, selectedTimestamp); 
    //                 const filteredNo2 = filterByTimeRange(no2Data, cutoff, selectedTimestamp); 
    //                 const filteredCo = filterByTimeRange(coData, cutoff, selectedTimestamp); 
    //                 const filteredO3 = filterByTimeRange(o3Data, cutoff, selectedTimestamp); 
    //                 const filteredSo2 = filterByTimeRange(so2Data, cutoff, selectedTimestamp); 

    //                 const labels = filteredPm25.map(d => new Date(d.timestamp).toLocaleTimeString([], {
    //                     hour: '2-digit', 
    //                     minute: '2-digit'
    //                 }));

    //                 const popupChartCanvas = document.createElement('canvas'); 
    //                 popupChartCanvas.className = 'popup-chart-canvas';
    //                 popupContent.appendChild(popupChartCanvas); 
                    
    //                 popup.setLngLat(coordinates).setDOMContent(popupContent).addTo(map);
                    
    //                 if (chart) {
    //                     chart.destroy(); 
    //                     chart = null; 
    //                 }
                    
    //                 chart = new ChartLib(
    //                     popupChartCanvas, {
    //                         type: 'line', 
    //                         data: {
    //                             labels: labels, 
    //                             datasets: [
    //                                 {
    //                                     label: 'PM2.5 (µg/m³)',
    //                                     data: filteredPm25.map(d => d.value),
    //                                     yAxisID: 'y-left',
    //                                     borderColor: 'rgba(255, 99, 132, 1)', 
    //                                     backgroundColor: 'rgba(255, 99, 132, 0.2)',
    //                                     fill: true,
    //                                     tension: 0.3,
    //                                 },
    //                                 {
    //                                     label: 'PM10 (µg/m³)',
    //                                     data: filteredPm10.map(d => d.value),
    //                                     yAxisID: 'y-left',
    //                                     borderColor: 'rgba(54, 162, 235, 1)',
    //                                     backgroundColor: 'rgba(54, 162, 235, 0.2)',
    //                                     fill: true,
    //                                     tension: 0.3,
    //                                 },
    //                                 {
    //                                     label: 'NO2 (ppb)',
    //                                     data: filteredNo2.map(d => d.value),
    //                                     yAxisID: 'y-right',
    //                                     borderColor: 'rgba(255, 206, 86, 1)', 
    //                                     backgroundColor: 'rgba(255, 206, 86, 0.2)',
    //                                     fill: true,
    //                                     tension: 0.3,
    //                                 },
    //                                 {
    //                                     label: 'CO (ppb)',
    //                                     data: filteredCo.map(d => d.value),
    //                                     yAxisID: 'y-right',
    //                                     borderColor: 'rgba(153, 102, 255, 1)',
    //                                     backgroundColor: 'rgba(153, 102, 255, 0.2)',
    //                                     fill: true,
    //                                     tension: 0.3,
    //                                 },
    //                                 {
    //                                     label: 'O3 (ppb)',
    //                                     data: filteredO3.map(d => d.value),
    //                                     yAxisID: 'y-right',
    //                                     borderColor: 'rgba(255, 159, 64, 1)',
    //                                     backgroundColor: 'rgba(255, 159, 64, 0.2)',
    //                                     fill: true,
    //                                     tension: 0.3,
    //                                 },
    //                                 {
    //                                     label: 'SO2 (ppb)',
    //                                     data: filteredSo2.map(d => d.value),
    //                                     yAxisID: 'y-right',
    //                                     borderColor: 'rgba(75, 192, 192, 1)',
    //                                     backgroundColor: 'rgba(75, 192, 192, 0.2)',
    //                                     fill: true,
    //                                     tension: 0.3,
    //                                 }
    //                             ]
    //                         }, 
    //                         options: {
    //                             responsive: true,
    //                             maintainAspectRatio: false,
    //                             scales: {
    //                                 x: {
    //                                     display: true,
    //                                     title: {
    //                                         display: true,
    //                                         text: 'Time'
    //                                     }
    //                                 },
    //                                 'y-left': {
    //                                     type: 'linear', 
    //                                     position: 'left', 
    //                                     title: {
    //                                         display: true,
    //                                         text: 'Concentration (µg/m³)'
    //                                     }, 
    //                                     min: 0, 
    //                                 }, 
    //                                 'y-right': {
    //                                     type: 'linear',
    //                                     position: 'right',
    //                                     title: {
    //                                         display: true,
    //                                         text: 'Concentration (Parts Per Billion)'
    //                                     },
    //                                     grid: {
    //                                         drawOnChartArea: false 
    //                                     },
    //                                     min: 0, 
    //                                 }
    //                             },
    //                             plugins: {
    //                                 legend: {
    //                                     display: true,
    //                                     position: 'top', 
    //                                     labels: {
    //                                         font: {
    //                                             size: 10 
    //                                         },
    //                                         usePointStyle: true,
    //                                         padding: 5
    //                                     }
    //                                 }
    //                             },
    //                             layout: {
    //                                 padding: {
    //                                     top: 10,             
    //                                 }
    //                             }
    //                         }
    //                     }
    //                 ); 
    //             } catch (error) {
    //                 console.error("Failed to fetch pollutant data:", error);
    //                 popup.remove();
    //             }

    //             const tileDetailsLink = document.createElement('a');
    //             tileDetailsLink.className = 'popup-tile-details-link';
    //             tileDetailsLink.href = `/#/tile-details/${tileId}`;
    //             tileDetailsLink.target = '_blank';
    //             tileDetailsLink.rel = 'noopener noreferrer';
    //             tileDetailsLink.textContent = 'See Tile Details';
    //             popupContent.appendChild(tileDetailsLink);

    //             setTimeout(() => {
    //                 const popupEl = document.querySelector('.maplibregl-popup');
    //                 if (popupEl) {
    //                     popupEl.addEventListener('mouseenter', () => { popupIsHovered = true; });
    //                     popupEl.addEventListener('mouseleave', () => {
    //                         popupIsHovered = false;
    //                         setTimeout(() => {
    //                             if (!dotIsHovered && !popupIsHovered) {
    //                                 popup.remove();
    //                             }
    //                         }, 10);
    //                     });
    //                 }
    //             }, 0);
    //         });

    //         map.on("mouseleave", "points-layer", () => {
    //             dotIsHovered = false;
    //             map.getCanvas().style.cursor = "";
    //             setTimeout(() => {
    //                 if (!dotIsHovered && !popupIsHovered) {
    //                     popup.remove();
    //                 }
    //             }, 10);
    //         });
    //     });
    }

    $: if (sliderHour !== undefined) {
        selectedTimestamp = now - sliderHour * 3600 * 1000;
    }
</script>



<div id="map" style="width: 100vw; height: 100vh;"></div>
