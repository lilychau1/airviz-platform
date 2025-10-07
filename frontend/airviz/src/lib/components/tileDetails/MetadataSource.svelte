<script lang="ts">
    import { onMount } from "svelte";
    import { staticMetadata, type TileMetadata, type Metadata } from "../../constants";
    import { fetchTileMetadata } from "../../../api/mockLambdaApi";

    export let tileId: number;

    let tileMetadata: TileMetadata | null = null;
    let metadata: Metadata | null = null;
    let error: string | null = null;

    async function loadMetadata() {
        try {
            tileMetadata = await fetchTileMetadata(tileId);
            metadata = { ...tileMetadata, ...staticMetadata };
        } catch (err: any) {
            error = err.message || "Failed to load metadata";
            metadata = null;
        }
    }

    onMount(() => {
        loadMetadata();
    });
</script>

<br>
<h3>Metadata and Source</h3>
{#if error}
    <div class="error">{error}</div>
{:else if metadata}
    <div class="metadata-container" role="region" aria-label="Tile metadata and data source information">
        <div class="metadata-row">
        <span class="metadata-label">Location:</span>
        <span class="metadata-value">{metadata.location}</span>
        </div>
        <div class="metadata-row">
        <span class="metadata-label">Tile ID:</span>
        <span class="metadata-value">{metadata.tileId}</span>
        </div>
        <div class="metadata-row">
        <span class="metadata-label">Coordinates:</span>
        <span class="metadata-value">
            Latitude {metadata.latitude.toFixed(4)}° N, Longitude {metadata.longitude.toFixed(4)}° W
        </span>
        </div>
        <div class="metadata-row">
        <span class="metadata-label">Data Source:</span>
        <span class="metadata-value">{metadata.dataSource}</span>
        </div>
        <div class="metadata-row">
        <span class="metadata-label">API Data Type:</span>
        <span class="metadata-value">{metadata.apiDataType}</span>
        </div>
        <div class="metadata-row">
        <span class="metadata-label">API Version:</span>
        <span class="metadata-value">{metadata.apiVersion}</span>
        </div>
        <div class="metadata-row">
        <span class="metadata-label">Latest Measurement Timestamp:</span>
        <span class="metadata-value">{metadata.latestMeasurementTimestamp}</span>
        </div>
        <div class="metadata-row">
        <span class="metadata-label">Data Quality Confidence:</span>
        <span class="metadata-value">{metadata.dataQualityConfidence}</span>
        </div>
        <div class="metadata-row">
        <span class="metadata-label">License:</span>
        <span class="metadata-value">{metadata.license}</span>
        </div>
        <div class="metadata-row">
        <span class="metadata-label">Additional Notes:</span>
        <span class="metadata-value">{metadata.additionalNotes}</span>
        </div>
    </div>
{:else}
<div>Loading metadata...</div>
{/if}
