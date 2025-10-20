<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import maplibregl, { Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
    import 'maplibre-gl/dist/maplibre-gl.css';
    import ChartLib from "chart.js/auto";
    import type { Chart } from "chart.js";

    import { 
        fetchAllRegions, 
        fetchPollutantData, 
        fetchPopupInformation, 
        loadRegionalGeoJSON,
    } from '../../api/LambdaApi'
    import { type RegionUnit, type Coordinates, LevelCategory, type RegionLevel, type PopupInfoReturnTypeForRegionLevel } from '../constants';
    import { fetchCurrentLocation } from '../utils/utils';
    
    const mapTilerAPIKey: string = import.meta.env.VITE_MAPTILER_API_KEY as string;

    let currentLocation: Coordinates;
    let mapRadius: number; 
    let allRegions: RegionUnit[];
    let geojsonRegion: GeoJSON.FeatureCollection;

    let map: MapLibreMap;
    let chart: Chart | null = null;

    let regionLevel: RegionLevel = 'borough'

    // placeholder date for testing
    const now = Number(new Date());
    let sliderHour = 0;
    let selectedTimestamp = now;

    // Selected regions for comparison
    let selectedRegionIds: (number | null)[] = [null, null]; // Allow up to two selected IDs
    let comparePopup: maplibregl.Popup | null = null;
    let compareRegionData: [PopupInfoReturnTypeForRegionLevel<RegionLevel> | null, PopupInfoReturnTypeForRegionLevel<RegionLevel> | null] = [null, null];

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(() => {
            refreshRegions();
        }, 300); // wait 300ms after the last trigger
    }

    function adjustColourSensitivity(tile: RegionUnit, sensitivity = 1): { red: number; green: number; blue: number } {
        const clamp = (val: number) => Math.min(Math.max(val, 0), 1);

        // Apply sensitivity only to red and green
        const red = clamp(Math.pow(tile.currentAqiColour.red, 1 / sensitivity));
        const green = clamp(Math.pow(tile.currentAqiColour.green, 1 / sensitivity));
        const blue = 0; // always zero to stay in red→green spectrum

        return { red, green, blue };
    }

    function getFeatureCentroid(feature: GeoJSON.Feature): [number, number] {
        if (feature.geometry.type === 'Point') {
            return feature.geometry.coordinates as [number, number];
        } else if (feature.geometry.type === 'Polygon') {
            const coords = feature.geometry.coordinates[0];
            const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
            const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
            return [lng, lat];
        } else if (feature.geometry.type === 'MultiPolygon') {
            const coords = feature.geometry.coordinates[0][0];
            const lng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
            const lat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
            return [lng, lat];
        }
        return [0, 0];
    }
    async function refreshRegions() {
        // Only update if all necessary info is present. Otherwise do nothing
        if (!regionLevel || !currentLocation || !mapRadius) return;

        allRegions = await fetchAllRegionsCached(
            regionLevel,
            currentLocation.longitude,
            currentLocation.latitude,
            mapRadius,
            selectedTimestamp
        );
        geojsonRegion = await loadRegionalGeoJSONCached(regionLevel);

        const extraRegionDataMap = new Map<number, RegionUnit>();
        for (const region of allRegions) {
            extraRegionDataMap.set(region.id, region);
        }
        geojsonRegion.features.forEach(feature => {
            const id = feature.properties?.dbId;
            if (id !== undefined) {
                const numericId = typeof id === 'string' ? Number(id) : id;

                if (extraRegionDataMap.has(numericId)) {
                    const extraData = extraRegionDataMap.get(numericId);
                    const adjustedColour = adjustColourSensitivity(extraData!);

                    if (extraData !== undefined) {
                        feature.properties = {
                            ...feature.properties,
                            longitude: extraData.longitude,
                            latitude: extraData.latitude,
                            currentAqiColour: adjustedColour,
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
            selectedRegionIds.includes(Number(f.properties?.dbId))
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
        const regionId = Number(feature.properties?.dbId);
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
    }

    function formatValue(val: any) {
        if (val === null || val === undefined) return '-';
        if (typeof val === 'object') {
            return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join(', ');
        }
        return val.toString();
    }

    async function showComparePopup(
        regionId1: number, 
        regionId2: number
    ) {
        const [info1, info2] = await Promise.all([
            fetchPopupInformationCached(regionLevel, regionId1) as Promise<PopupInfoReturnTypeForRegionLevel<typeof regionLevel>>,
            fetchPopupInformationCached(regionLevel, regionId2) as Promise<PopupInfoReturnTypeForRegionLevel<typeof regionLevel>>,
        ]);

        compareRegionData = [info1, info2];

        // Find GeoJSON features for each selected region
        const feature1 = geojsonRegion.features.find(f => Number(f.properties?.dbId) === regionId1);
        const feature2 = geojsonRegion.features.find(f => Number(f.properties?.dbId) === regionId2);

        if (!feature1 || !feature2) {
            console.warn("GeoJSON features not found for one or both selected regions");
            return;
        }

        // // Use GeoJSON geometry coordinates [lng, lat]
        // const coord1 = [feature1.properties?.longitude, feature1.properties?.latitude];
        // const coord2 = [feature2.properties?.longitude, feature2.properties?.latitude];

        // // Calculate midpoint for popup placement
        // const lngLat = [
        //     (coord1[0] + coord2[0]) / 2,
        //     (coord1[1] + coord2[1]) / 2
        // ] as [number, number]; 


        const [lng1, lat1] = getFeatureCentroid(feature1);
        const [lng2, lat2] = getFeatureCentroid(feature2);
        const lngLat: [number, number] = [(lng1 + lng2) / 2, (lat1 + lat2) / 2];

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

            if (val1 && typeof val1 === 'object' && val2 && typeof val2 === 'object') {
                // If both values are objects, create a row per key
                Object.keys(val1).forEach(key => {
                    const tr = document.createElement('tr');

                    const tdLabel = document.createElement('td');
                    tdLabel.textContent = `${label} (${key})`;

                    const tdVal1 = document.createElement('td');
                    tdVal1.textContent = val1[key] !== undefined ? val1[key].toString() : '-';

                    const tdVal2 = document.createElement('td');
                    tdVal2.textContent = val2[key] !== undefined ? val2[key].toString() : '-';

                    // Optional: highlight better/worse
                    if (val1[key] !== undefined && val2[key] !== undefined) {
                        if (val1[key] === val2[key]) {
                            tdVal1.classList.add('compare-equal');
                            tdVal2.classList.add('compare-equal');
                        } else if ((betterIsLower && val1[key] < val2[key]) || (!betterIsLower && val1[key] > val2[key])) {
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
            } else {
                // Single value case
                const tr = document.createElement('tr');

                const tdLabel = document.createElement('td');
                tdLabel.textContent = label;

                const tdVal1 = document.createElement('td');
                tdVal1.textContent = val1 !== null && val1 !== undefined ? val1.toString() : '-';

                const tdVal2 = document.createElement('td');
                tdVal2.textContent = val2 !== null && val2 !== undefined ? val2.toString() : '-';

                if (val1 !== null && val1 !== undefined && val2 !== null && val2 !== undefined) {
                    if (val1 === val2) {
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
            }
        });

        table.appendChild(tbody);

        container.appendChild(table);
        
        // Create chart containers per metric and assign charts
        const charts: Chart[] = [];

        metrics.forEach(({ label, getValue }) => {
            const val1 = getValue(info1);
            const val2 = getValue(info2);

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

            // If the value is an object, create separate datasets per key
            let datasets: any[] = [];
            if (val1 && typeof val1 === 'object' && val2 && typeof val2 === 'object') {
                Object.keys(val1).forEach((key, idx) => {
                    datasets.push({
                        label: key,
                        data: [val1[key], val2[key]],
                        backgroundColor: [
                            `rgba(${50 + idx*40}, 99, 132, 0.7)`,
                            `rgba(${50 + idx*40}, 162, 235, 0.7)`
                        ],
                        borderColor: [
                            `rgba(${50 + idx*40}, 99, 132, 1)`,
                            `rgba(${50 + idx*40}, 162, 235, 1)`
                        ],
                        borderWidth: 1
                    });
                });
            } else {
                // Single numeric value
                datasets = [{
                    label,
                    data: [val1 ?? 0, val2 ?? 0],
                    backgroundColor: [
                        "rgba(255, 99, 132, 0.7)",
                        "rgba(54, 162, 235, 0.7)"
                    ],
                    borderColor: [
                        "rgba(255, 99, 132, 1)",
                        "rgba(54, 162, 235, 1)"
                    ],
                    borderWidth: 1
                }];
            }

            const chartInstance = new ChartLib(ctx, {
                type: 'bar',
                data: {
                    labels: [info1.name, info2.name],
                    datasets
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: true,
                    aspectRatio: 1,
                    scales: {
                        y: { beginAtZero: true },
                        x: { display: false }
                    },
                    plugins: {
                        legend: { display: true }
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

    function getRadiusFromZoom(zoom: number): number {
        return 2 ** (15 - zoom); 
    }

    // cache for all regions fetches
    function coordsCacheKey(lon: number, lat: number, zoomRadius: number): string {
        const roundCoord = (v: number, step: number) => Math.round(v / step);
        const step = zoomRadius / 20; 
        return `${roundCoord(lon, step)}_${roundCoord(lat, step)}`;
    }

    const allRegionsCache = new Map<string, RegionUnit[]>();

    async function fetchAllRegionsCached(regionLevel: RegionLevel, lon: number, lat: number, radius: number, timestamp: number) {
        const key = `${regionLevel}_${timestamp}_${coordsCacheKey(lon, lat, radius)}`;

        if (allRegionsCache.has(key)) {
            console.log("Using cached regions for", key);
            return allRegionsCache.get(key)!;
        }

        const regions = await fetchAllRegions(regionLevel, lon, lat, radius, timestamp);
        allRegionsCache.set(key, regions);
        return regions;
    }

    // cache for geojson fetches
    const geojsonCache = new Map<RegionLevel, GeoJSON.FeatureCollection>();

    async function loadRegionalGeoJSONCached(regionLevel: RegionLevel) {
        if (geojsonCache.has(regionLevel)) return geojsonCache.get(regionLevel)!;
        const geojson = await loadRegionalGeoJSON(regionLevel);
        geojsonCache.set(regionLevel, geojson);
        return geojson;
    }

    // cache for popup information fetches
    const popupInfoCache = new Map<string, PopupInfoReturnTypeForRegionLevel<RegionLevel> | null>();

    async function fetchPopupInformationCached(level: RegionLevel, id: number) {
        const key = `${level}_${id}`;
        if (popupInfoCache.has(key)) return popupInfoCache.get(key);

        try {
            const info = await fetchPopupInformation(level, id);
            popupInfoCache.set(key, info);
            return info;
        } catch (err) {
            console.error(`Failed to load data for ${level} ID ${id}`, err);
            popupInfoCache.set(key, null); // mark as failed to avoid immediate retry
            return null;
        }
    }



    onMount(async () => {
        // Placeholder: Fetch current locations with coordinates
        currentLocation = await fetchCurrentLocation();
        mapRadius = 30;
        // Placeholder: Fetch all locations on map area with latitude, longitude and radius
        allRegions = await fetchAllRegionsCached(
            regionLevel, 
            currentLocation.longitude, 
            currentLocation.latitude, 
            mapRadius, 
            selectedTimestamp
        );
        const geojsonRegion = await loadRegionalGeoJSONCached(regionLevel);

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
        
        // Update borough. mappings: GeoJSON 'lad22nm' -> DB ID
        const geoToDbIdMap: Record<string, number> = {
            "Barking and Dagenham": 1,
            "Barnet": 2,
            "Bexley": 3,
            "Brent": 4,
            "Bromley": 5,
            "Camden": 6,
            "Croydon": 7,
            "Ealing": 8,
            "Enfield": 9,
            "Greenwich": 10,
            "Hackney": 11,
            "Hammersmith and Fulham": 12,
            "Haringey": 13,
            "Harrow": 14,
            "Havering": 15,
            "Hillingdon": 16,
            "Hounslow": 17,
            "Islington": 18,
            "Kensington and Chelsea": 19,
            "Kingston upon Thames": 20,
            "Lambeth": 21,
            "Lewisham": 22,
            "Merton": 23,
            "Newham": 24,
            "Redbridge": 26,
            "Richmond upon Thames": 26,
            "Southwark": 27,
            "Sutton": 28,
            "Tower Hamlets": 29,
            "Waltham Forest": 30,
            "Wandsworth": 31,
            "Westminster": 32,
        };

        geojson.features.forEach(feature => {
            if (!feature.properties) return;

            const ladName = feature.properties?.lad22nm;
            if (ladName && geoToDbIdMap[ladName]) {
                feature.properties.dbId = geoToDbIdMap[ladName];
            }
        });

        // Create a map from region ID to the extra region info for fast lookup
        const extraRegionDataMap = new Map<number, RegionUnit>();
        for (const region of allRegions) {
            extraRegionDataMap.set(region.id, region);
        }

        geojson.features.forEach(feature => {
        const id = feature.properties?.dbId;
        if (id !== undefined) {
            const numericId = typeof id === 'string' ? Number(id) : id;
            if (extraRegionDataMap.has(numericId)) {
                const extraData = extraRegionDataMap.get(numericId);
                if (extraData !== undefined) {
                    const adjustedColour = adjustColourSensitivity(extraData);

                    feature.properties = {
                        ...feature.properties,
                        longitude: extraData.longitude,
                        latitude: extraData.latitude,
                        currentAqiColour: adjustedColour,
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

            map.addLayer({
                id: "regions-outline",
                type: "line",
                source: regionLevel,
                paint: {
                    "line-color": "#333", 
                    "line-width": 0.6, 
                    "line-opacity": 0.7,
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

        let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
        let lastHoveredRegionId: number | null = null;

        map.on("mousemove", "regions-fill", (e) => {
            if (!e.features || e.features.length === 0) return;

            const feature = e.features[0];
            const regionId = Number(feature.properties?.dbId);
            if (!regionId) return;

            const coordinates = getFeatureCentroid(feature);

            // Update cursor immediately
            map.getCanvas().style.cursor = "pointer";

            // If hovering the same region, do nothing
            if (lastHoveredRegionId === regionId) return;
            lastHoveredRegionId = regionId;

            // Clear any previous hover timer
            if (hoverTimeout) clearTimeout(hoverTimeout);

            hoverTimeout = setTimeout(async () => {
                lastHoveredRegionId = null; // reset after fetch

                const popupContent = document.createElement('div');
                popupContent.className = 'popup-chart-container';

                // Region information placeholder
                const regionInformationDiv = document.createElement('div'); 
                regionInformationDiv.innerHTML = `Loading ${regionLevel} details...`; 
                regionInformationDiv.className = 'popup-information';
                popupContent.appendChild(regionInformationDiv);

                // Fetch popup info (cached)
                try {
                    const data = await fetchPopupInformationCached(regionLevel, regionId);
                    if (data) {
                        let aqiHtml = '';
                        if (data.currentAqi && data.currentAqiCategoryLevel) {
                            for (const key of Object.keys(data.currentAqi)) {
                                const aqiValue = data.currentAqi[key];
                                const catLevel = data.currentAqiCategoryLevel[key];
                                const cat = LevelCategory[catLevel as 1 | 2 | 3];
                                aqiHtml += `<div><strong>${key.toUpperCase()} AQI:</strong> <span style="color:${cat?.colour ?? 'black'}">${aqiValue}</span></div>`;
                            }
                        }

                        regionInformationDiv.innerHTML = `
                            <strong>Name: ${data.name}</strong><br>
                            Region: ${data.region}<br>
                            ${aqiHtml}
                            <span style="color: ${LevelCategory[data.currentPm25Level as 1 | 2 | 3]?.colour ?? 'black'}">PM2.5</span>
                            <span style="color: ${LevelCategory[data.currentPm10Level as 1 | 2 | 3]?.colour ?? 'black'}">PM10</span>
                            <span style="color: ${LevelCategory[data.currentNo2Level as 1 | 2 | 3]?.colour ?? 'black'}">NO2</span>
                            <span style="color: ${LevelCategory[data.currentO3Level as 1 | 2 | 3]?.colour ?? 'black'}">O3</span>
                            <span style="color: ${LevelCategory[data.currentSo2Level as 1 | 2 | 3]?.colour ?? 'black'}">SO2</span>
                            <span style="color: ${LevelCategory[data.currentCoLevel as 1 | 2 | 3]?.colour ?? 'black'}">CO</span>
                        `;
                    } else {
                        regionInformationDiv.innerHTML = `<span style="color: red;">Failed to load ${regionLevel} information.</span>`;
                    }
                } catch (err) {
                    console.error(err);
                    regionInformationDiv.innerHTML = `<span style="color: red;">Failed to load ${regionLevel} information.</span>`;
                }

                // Google map link
                const googleMapLink = document.createElement('a');
                googleMapLink.href = `https://www.google.com/maps?q=${coordinates[1]},${coordinates[0]}`;
                googleMapLink.target = '_blank';
                googleMapLink.rel = 'noopener noreferrer';
                googleMapLink.textContent = `View ${regionLevel} in Google Map`;
                popupContent.appendChild(googleMapLink);

                // Fetch pollutant data after debounce
                try {
                    const pollutantData = await fetchPollutantData(regionLevel, regionId, {
                        start: selectedTimestamp - 24 * 60 * 60 * 1000,
                        end: selectedTimestamp
                    });

                    const labels = pollutantData.map(d => new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

                    const popupChartCanvas = document.createElement('canvas');
                    popupChartCanvas.className = 'popup-chart-canvas';
                    popupContent.appendChild(popupChartCanvas);

                    popup.setLngLat(coordinates).setDOMContent(popupContent).addTo(map);

                    if (chart) chart.destroy();
                    chart = new ChartLib(popupChartCanvas, {
                        type: 'line',
                        data: {
                            labels,
                            datasets: [
                                { label: 'PM2.5', data: pollutantData.map(d => d.pm25Value), borderColor: 'rgba(255,99,132,1)', backgroundColor: 'rgba(255,99,132,0.2)', fill: true, tension: 0.3 },
                                { label: 'PM10', data: pollutantData.map(d => d.pm10Value), borderColor: 'rgba(54,162,235,1)', backgroundColor: 'rgba(54,162,235,0.2)', fill: true, tension: 0.3 },
                                { label: 'NO2', data: pollutantData.map(d => d.no2Value), borderColor: 'rgba(255,206,86,1)', backgroundColor: 'rgba(255,206,86,0.2)', fill: true, tension: 0.3 },
                                { label: 'CO', data: pollutantData.map(d => d.coValue), borderColor: 'rgba(153,102,255,1)', backgroundColor: 'rgba(153,102,255,0.2)', fill: true, tension: 0.3 },
                                { label: 'O3', data: pollutantData.map(d => d.o3Value), borderColor: 'rgba(255,159,64,1)', backgroundColor: 'rgba(255,159,64,0.2)', fill: true, tension: 0.3 },
                                { label: 'SO2', data: pollutantData.map(d => d.so2Value), borderColor: 'rgba(75,192,192,1)', backgroundColor: 'rgba(75,192,192,0.2)', fill: true, tension: 0.3 }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                x: { display: true },
                                y: { type: 'linear', position: 'left', min: 0 },
                                y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, min: 0 }
                            }
                        }
                    });
                } catch (err) {
                    console.error("Failed to fetch pollutant data:", err);
                    popup.remove();
                }
            }, 300); // 300ms debounce
        });
        map.on('moveend', () => {
            const center = map.getCenter();
            currentLocation = { latitude: center.lat, longitude: center.lng };

            // Dynamically compute radius based on zoom level
            mapRadius = getRadiusFromZoom(map.getZoom());

            console.log(`Updated center: ${center.lng.toFixed(4)}, ${center.lat.toFixed(4)} radius: ${mapRadius.toFixed(2)}`);

            scheduleRefresh(); // Fetch updated data
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
    }

    $: if (map && selectedTimestamp !== undefined) {
        scheduleRefresh();
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
