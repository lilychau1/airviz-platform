<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import maplibregl, { Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
    import 'maplibre-gl/dist/maplibre-gl.css';
    import ChartLib from "chart.js/auto";
    import type { Chart } from "chart.js";

    import { 
        fetchAllRegions, 
        fetchPollutantData, 
        fetchMapRadius, 
        fetchPopupInformation, 
        loadRegionalGeoJSON
    } from '../../api/MockApi';
    import { Pollutants, type RegionUnit, type Coordinates, LevelCategory, type RegionLevel, type PopupInfoReturnTypeForRegionLevel, type RegionPopupInformation } from '../constants';
    import { fetchCurrentLocation, filterByTimeRange } from '../utils/utils';
    
    const mapTilerAPIKey: string = import.meta.env.VITE_MAPTILER_API_KEY as string;

    let currentLocation: Coordinates;
    let mapRadius: number; 
    let allRegions: RegionUnit[];
    let geojsonRegion: GeoJSON.FeatureCollection;

    let map: MapLibreMap;
    let chart: Chart | null = null;

    let regionLevel: RegionLevel = 'borough'

    // placeholder date for testing
    const now = new Date("2025-08-11T20:20:00Z").getTime();
    let sliderHour = 0;
    let selectedTimestamp = now;

    // Selected regions for comparison
    let selectedRegionIds: (number | null)[] = [null, null]; // Allow up to two selected IDs
    let comparePopup: maplibregl.Popup | null = null;
    let compareRegionData: [RegionPopupInformation | null, RegionPopupInformation | null] = [null, null];

    async function refreshRegions() {
        // Only update if all necessary info is present. Otherwise do nothing
        if (!regionLevel || !currentLocation || !mapRadius) return;

        allRegions = await fetchAllRegions(
            regionLevel,
            currentLocation.latitude,
            currentLocation.longitude,
            mapRadius,
            selectedTimestamp
        );
        geojsonRegion = await loadRegionalGeoJSON(regionLevel);

        const extraRegionDataMap = new Map<number, RegionUnit>();
        for (const region of allRegions) {
            extraRegionDataMap.set(region.id, region);
        }
        geojsonRegion.features.forEach(feature => {
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
                        };
                    }
                }
            }
        });

        // If map and source exist, refresh geojson on the map
        if (map && map.getSource(regionLevel)) {
            (map.getSource(regionLevel) as maplibregl.GeoJSONSource).setData(geojsonRegion);
        }
    }

    function updateSelectedRegionsOutline() {
        if (!map || !geojsonRegion) return;

        // Filter features with selectedRegionIds (ignoring null)
        const selectedFeatures = geojsonRegion.features.filter(f => 
            selectedRegionIds.includes(Number(f.properties?.fid))
        );

        // Update 'selected-regions' source data
        const source = map.getSource('selected-regions') as maplibregl.GeoJSONSource;
        if (source) {
            source.setData({
                type: 'FeatureCollection',
                features: selectedFeatures,
            });
        }
    }
    function handleRegionClick(e: MapLayerMouseEvent) {
        const feature = e.features?.[0];
        if (!feature) return;
        const regionId = Number(feature.properties?.fid);
        if (!regionId) return;

        // Toggle select/deselect
        let updated = false;
        for (let i = 0; i < selectedRegionIds.length; ++i) {
            if (selectedRegionIds[i] === regionId) {
                selectedRegionIds[i] = null;
                updated = true;
                break;
            }
        }
        if (!updated) {
            for (let i = 0; i < selectedRegionIds.length; ++i) {
                if (selectedRegionIds[i] == null) {
                    selectedRegionIds[i] = regionId;
                    break;
                }
            }
        }

        updateSelectedRegionsOutline();

        // Remove compare popup if now less than two selected
        if (selectedRegionIds.filter(x => x != null).length < 2 && comparePopup) {
            comparePopup.remove();
            comparePopup = null;
            compareRegionData = [null, null];
        } else if (selectedRegionIds[0] && selectedRegionIds[1]) {
            showComparePopup(selectedRegionIds[0], selectedRegionIds[1]);
        }
        console.log(map.getSource('selected-regions'));
        console.log(map.getLayer('selected-regions-outline'));
    }

    async function showComparePopup(
        regionId1: number, 
        regionId2: number
    ) {
        const [info1, info2] = await Promise.all([
            fetchPopupInformation(regionLevel, regionId1) as Promise<RegionPopupInformation>,
            fetchPopupInformation(regionLevel, regionId2) as Promise<RegionPopupInformation>,
        ]);

        compareRegionData = [info1, info2];

        // Find GeoJSON features for each selected region
        const feature1 = geojsonRegion.features.find(f => Number(f.properties?.fid) === regionId1);
        const feature2 = geojsonRegion.features.find(f => Number(f.properties?.fid) === regionId2);

        if (!feature1 || !feature2) {
            console.warn("GeoJSON features not found for one or both selected regions");
            return;
        }

        // Use GeoJSON geometry coordinates [lng, lat]
        const coord1 = [feature1.properties?.longitude, feature1.properties?.latitude];
        const coord2 = [feature2.properties?.longitude, feature2.properties?.latitude];

        // Calculate midpoint for popup placement
        const lngLat = [
            (coord1[0] + coord2[0]) / 2,
            (coord1[1] + coord2[1]) / 2
        ] as [number, number]; 

        if (comparePopup) comparePopup.remove();

        const container = document.createElement('div');
        container.className = "compare-popup-container";

        const closeButton = document.createElement('button');
        closeButton.textContent = "✕";
        closeButton.className = "compare-close";
        closeButton.onclick = () => {
            if (comparePopup) {
                comparePopup.remove();
                comparePopup = null;
                selectedRegionIds = [null, null];
            }
        };
        container.appendChild(closeButton);

        // Metrics for comparison
        const metrics = [
            { label: 'Current AQI (US)', getValue: (info: any) => info.currentAqi },
            { label: 'Unhealthy Days (30d)', getValue: (info: any) => info.last30dUnhealthyAQIDays, betterIsLower: true },
            { label: 'AQI Mean (30d)', getValue: (info: any) => info.last30dAQIMean },
            { label: 'AQI Max (30d)', getValue: (info: any) => info.last30dAQIMax },
            { label: 'AQI Min (30d)', getValue: (info: any) => info.last30dAQIMin },
            { label: 'PM2.5 Level', getValue: (info: any) => info.currentPm25Level, betterIsLower: true },
            { label: 'PM10 Level', getValue: (info: any) => info.currentPm10Level, betterIsLower: true },
            { label: 'NO2 Level', getValue: (info: any) => info.currentNo2Level, betterIsLower: true },
            { label: 'O3 Level', getValue: (info: any) => info.currentO3Level, betterIsLower: true },
            { label: 'SO2 Level', getValue: (info: any) => info.currentSo2Level, betterIsLower: true },
            { label: 'CO Level', getValue: (info: any) => info.currentCoLevel, betterIsLower: true },
        ];

        // Create table showing numeric comparison
        const table = document.createElement('table');
        table.className = 'compare-popup-table';

        // Table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Metric</th>
                <th>${info1.name}</th>
                <th>${info2.name}</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        metrics.forEach(({ label, getValue, betterIsLower }) => {
            const val1 = getValue(info1);
            const val2 = getValue(info2);

            const tr = document.createElement('tr');

            const tdLabel = document.createElement('td');
            tdLabel.textContent = label;

            const tdVal1 = document.createElement('td');
            tdVal1.textContent = val1 !== null && val1 !== undefined ? val1.toString() : '-';

            const tdVal2 = document.createElement('td');
            tdVal2.textContent = val2 !== null && val2 !== undefined ? val2.toString() : '-';

            // Determine which value is better and add CSS class for styling
            if (val1 !== null && val1 !== undefined && val2 !== null && val2 !== undefined) {
                if (val1 === val2) {
                    // Tie
                    tdVal1.classList.add('compare-equal');
                    tdVal2.classList.add('compare-equal');
                } else if ((betterIsLower && val1 < val2) || (!betterIsLower && val1 > val2)) {
                    tdVal1.classList.add('compare-better');
                    tdVal2.classList.add('compare-worse');
                } else {
                    tdVal1.classList.add('compare-worse');
                    tdVal2.classList.add('compare-better');
                }
            }

            tr.appendChild(tdLabel);
            tr.appendChild(tdVal1);
            tr.appendChild(tdVal2);

            tbody.appendChild(tr);
        });

        table.appendChild(tbody);

        container.appendChild(table);
        
        // Create chart containers per metric and assign charts
        const charts: Chart[] = [];

        metrics.forEach(({ label, getValue }) => {
            const chartWrapper = document.createElement('div');
            chartWrapper.className = "compare-mini-chart";

            const title = document.createElement('div');
            title.className = "compare-mini-chart-title";
            title.textContent = label;

            const canvas = document.createElement('canvas');
            canvas.className = "compare-mini-chart-canvas";

            chartWrapper.appendChild(title);
            chartWrapper.appendChild(canvas);

            container.appendChild(chartWrapper);

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const chartInstance = new ChartLib(ctx, {
                type: "bar",
                data: {
                    labels: [info1.name, info2.name],
                    datasets: [{
                        label: label,
                        data: [getValue(info1), getValue(info2)],
                        backgroundColor: [
                            "rgba(255, 99, 132, 0.7)",
                            "rgba(54, 162, 235, 0.7)"
                        ],
                        borderColor: [
                            "rgba(255, 99, 132, 1)",
                            "rgba(54, 162, 235, 1)"
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true },
                        x: { display: false }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });

            charts.push(chartInstance);
        });

        comparePopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false
        })
        .setLngLat(lngLat)
        .setMaxWidth("650px")
        .setDOMContent(container)
        .addTo(map);


        setTimeout(() => {
            const closeBtn = document.querySelector('.compare-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    if (comparePopup) {
                        comparePopup.remove();
                        comparePopup = null;
                        selectedRegionIds = [null, null];
                    }
                });
            }
        }, 0);
    }

    onMount(async () => {
        // Placeholder: Fetch current locations with coordinates
        currentLocation = await fetchCurrentLocation();
        mapRadius = await fetchMapRadius();
        // Placeholder: Fetch all locations on map area with latitude, longitude and radius
        allRegions = await fetchAllRegions(
            regionLevel, 
            currentLocation.latitude, 
            currentLocation.longitude, 
            mapRadius, 
            selectedTimestamp
        );
        const geojsonRegion = await loadRegionalGeoJSON(regionLevel);

        initialiseMap(geojsonRegion);

        map.on('load', async () => {
            if (map.getSource(regionLevel)) {
                (map.getSource(regionLevel) as maplibregl.GeoJSONSource).setData(geojsonRegion);
            }
        });
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

            map.addSource(regionLevel, {
                type: 'geojson',
                data: geojson,
            });
            
            map.addLayer({
                id: 'regions-fill',
                type: 'fill',
                source: regionLevel,
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

            map.addSource('selected-regions', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: [],
                },
            });

            map.addLayer({
                id: 'selected-regions-outline',
                type: 'line',
                source: 'selected-regions',
                paint: {
                    'line-color': '#000000', 
                    'line-width': 4, 
                },
            });
        })

        let popupIsHovered = false;
        let dotIsHovered = false;
        const popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            anchor: "top",
            className: "map-popup"
        });

        map.on("mousemove", "regions-fill", async (e) => {
            if (!e.features || e.features.length === 0) return; 

            dotIsHovered = true;
            map.getCanvas().style.cursor = "pointer";
            const feature = e.features?.[0];

            console.log(feature.properties)

            const longitude = feature.properties?.longitude;
            const latitude = feature.properties?.latitude;
            const regionId = feature.properties?.fid;
            if (regionId === undefined || longitude === undefined || latitude === undefined) return; 
            
            const coordinates: [number, number] = [longitude, latitude];

            if (!regionId) {
                console.warn(`${regionLevel} ID not found in feature properties`); 
                return;
            }

            // Initialise pop-up content space∂
            const popupContent = document.createElement('div'); 
            popupContent.className = 'popup-chart-container';

            // Popup region information
            const regionInformationDiv = document.createElement('div'); 
            regionInformationDiv.innerHTML = `Loading ${regionLevel} details...`; 
            regionInformationDiv.className = 'popup-information'; 
            popupContent.appendChild(regionInformationDiv); 

            fetchPopupInformation(regionLevel, regionId).then((data) => {
                regionInformationDiv.innerHTML = `
                    <strong>Name: ${data.name}</strong><br>
                    Region: ${data.region}<br>
                    View in Google Map
                    AQI: <span style="color: ${LevelCategory[data.currentAqiCategoryLevel as 1 | 2 | 3]?.colour ?? 'black'}">${data.currentAqi}<br></span>
                    <span style="color: ${LevelCategory[data.currentPm25Level as 1 | 2 | 3]?.colour ?? 'black'}">PM2.5</span>&nbsp;&nbsp;&nbsp;&nbsp;
                    <span style="color: ${LevelCategory[data.currentPm10Level as 1 | 2 | 3]?.colour ?? 'black'}">PM10</span>&nbsp;&nbsp;&nbsp;&nbsp;
                    <span style="color: ${LevelCategory[data.currentNo2Level as 1 | 2 | 3]?.colour ?? 'black'}">NO2</span>&nbsp;&nbsp;&nbsp;&nbsp;
                    <span style="color: ${LevelCategory[data.currentO3Level as 1 | 2 | 3]?.colour ?? 'black'}">O3</span>&nbsp;&nbsp;&nbsp;&nbsp;
                    <span style="color: ${LevelCategory[data.currentSo2Level as 1 | 2 | 3]?.colour ?? 'black'}">SO2</span>&nbsp;&nbsp;&nbsp;&nbsp;
                    <span style="color: ${LevelCategory[data.currentCoLevel as 1 | 2 | 3]?.colour ?? 'black'}">CO</span>
                `;

            }).catch((error) => {
                regionInformationDiv.innerHTML = `<span style="color: red;">Failed to load ${regionLevel} information.</span>`;
                console.error(error);
            });
            
            // Google map link
            const googleMapLink = document.createElement('a');
            googleMapLink.href = `https://www.google.com/maps?q=${coordinates[1]},${coordinates[0]}`;
            googleMapLink.target = '_blank';
            googleMapLink.rel = 'noopener noreferrer';
            googleMapLink.textContent = `View ${regionLevel} in Google Map`;

            popupContent.appendChild(googleMapLink);

            try {
                // Placeholder: Fetch last 24 hours' records for the specific region ID, PM2.5 and PM10 pollutants
                const [
                    pm25Data, 
                    pm10Data, 
                    no2Data, 
                    coData, 
                    o3Data, 
                    so2Data, 
                ] = await Promise.all([
                    fetchPollutantData(regionLevel, regionId, Pollutants.PM25.id), 
                    fetchPollutantData(regionLevel, regionId, Pollutants.PM10.id), 
                    fetchPollutantData(regionLevel, regionId, Pollutants.NO2.id), 
                    fetchPollutantData(regionLevel, regionId, Pollutants.CO.id), 
                    fetchPollutantData(regionLevel, regionId, Pollutants.O3.id), 
                    fetchPollutantData(regionLevel, regionId, Pollutants.SO2.id), 
                ]);

                const showHours = 24;
                const cutoff = selectedTimestamp - showHours * 60 * 60 * 1000; 

                const filteredPm25 = filterByTimeRange(pm25Data, cutoff, selectedTimestamp); 
                const filteredPm10 = filterByTimeRange(pm10Data, cutoff, selectedTimestamp); 
                const filteredNo2 = filterByTimeRange(no2Data, cutoff, selectedTimestamp); 
                const filteredCo = filterByTimeRange(coData, cutoff, selectedTimestamp); 
                const filteredO3 = filterByTimeRange(o3Data, cutoff, selectedTimestamp); 
                const filteredSo2 = filterByTimeRange(so2Data, cutoff, selectedTimestamp); 

                const labels = filteredPm25.map(d => new Date(d.timestamp).toLocaleTimeString([], {
                    hour: '2-digit', 
                    minute: '2-digit'
                }));

                const popupChartCanvas = document.createElement('canvas'); 
                popupChartCanvas.className = 'popup-chart-canvas';
                popupContent.appendChild(popupChartCanvas); 

                popup.setLngLat(coordinates).setDOMContent(popupContent).addTo(map);
                
                if (chart) {
                    chart.destroy(); 
                    chart = null; 
                }
                
                chart = new ChartLib(
                    popupChartCanvas, {
                        type: 'line', 
                        data: {
                            labels: labels, 
                            datasets: [
                                {
                                    label: 'PM2.5 (µg/m³)',
                                    data: filteredPm25.map(d => d.value),
                                    yAxisID: 'y-left',
                                    borderColor: 'rgba(255, 99, 132, 1)', 
                                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                                    fill: true,
                                    tension: 0.3,
                                },
                                {
                                    label: 'PM10 (µg/m³)',
                                    data: filteredPm10.map(d => d.value),
                                    yAxisID: 'y-left',
                                    borderColor: 'rgba(54, 162, 235, 1)',
                                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                                    fill: true,
                                    tension: 0.3,
                                },
                                {
                                    label: 'NO2 (ppb)',
                                    data: filteredNo2.map(d => d.value),
                                    yAxisID: 'y-right',
                                    borderColor: 'rgba(255, 206, 86, 1)', 
                                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                                    fill: true,
                                    tension: 0.3,
                                },
                                {
                                    label: 'CO (ppb)',
                                    data: filteredCo.map(d => d.value),
                                    yAxisID: 'y-right',
                                    borderColor: 'rgba(153, 102, 255, 1)',
                                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                                    fill: true,
                                    tension: 0.3,
                                },
                                {
                                    label: 'O3 (ppb)',
                                    data: filteredO3.map(d => d.value),
                                    yAxisID: 'y-right',
                                    borderColor: 'rgba(255, 159, 64, 1)',
                                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                                    fill: true,
                                    tension: 0.3,
                                },
                                {
                                    label: 'SO2 (ppb)',
                                    data: filteredSo2.map(d => d.value),
                                    yAxisID: 'y-right',
                                    borderColor: 'rgba(75, 192, 192, 1)',
                                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                                    fill: true,
                                    tension: 0.3,
                                }
                            ]
                        }, 
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: {
                                    display: true,
                                    title: {
                                        display: true,
                                        text: 'Time'
                                    }
                                },
                                'y-left': {
                                    type: 'linear', 
                                    position: 'left', 
                                    title: {
                                        display: true,
                                        text: 'Concentration (µg/m³)'
                                    }, 
                                    min: 0, 
                                }, 
                                'y-right': {
                                    type: 'linear',
                                    position: 'right',
                                    title: {
                                        display: true,
                                        text: 'Concentration (Parts Per Billion)'
                                    },
                                    grid: {
                                        drawOnChartArea: false 
                                    },
                                    min: 0, 
                                }
                            },
                            plugins: {
                                legend: {
                                    display: true,
                                    position: 'top', 
                                    labels: {
                                        font: {
                                            size: 10 
                                        },
                                        usePointStyle: true,
                                        padding: 5
                                    }
                                }
                            },
                            layout: {
                                padding: {
                                    top: 10,             
                                }
                            }
                        }
                    }
                ); 
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

        map.on("mouseleave", "regions-fill", () => {
            dotIsHovered = false;
            map.getCanvas().style.cursor = "";
            setTimeout(() => {
                if (!dotIsHovered && !popupIsHovered) {
                    popup.remove();
                }
            }, 10);
        });
        
        map.on('click', 'regions-fill', handleRegionClick);

    }

    $: if (sliderHour !== undefined) {
        const currentDate = new Date(now);

        // Snap the base time ("now") to the latest full hour
        const roundedNow = new Date(currentDate);
        roundedNow.setMinutes(0, 0, 0);

        // Subtract the number of hours from the snapped base
        const adjustedDate = new Date(roundedNow);
        adjustedDate.setHours(roundedNow.getHours() - sliderHour);

        selectedTimestamp = adjustedDate.getTime();

        console.log(`Selected timestamp updated to: ${adjustedDate.toISOString()}`);
    }

    $: if (map && selectedTimestamp !== undefined) {
        refreshRegions();
    }
</script>


<div class="map-wrapper">
    <div id="map" class="map-landing-container"></div>

    <div class="time-slider-container">
        <label for="timeSlider">Show Hour: {sliderHour}h ago</label>
        <input 
            id="timeSlider" 
            type="range" 
            min="0" 
            max="23" 
            bind:value={sliderHour} 
            step="1" 
            style="direction: rtl;" 
        />
        <div class="time-slider-timestamp">
            {new Date(selectedTimestamp).toLocaleString()}
        </div>
    </div>
</div>
