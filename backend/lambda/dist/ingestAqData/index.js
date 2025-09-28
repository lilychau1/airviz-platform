"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const client_s3_1 = require("@aws-sdk/client-s3");
const csvParser = require("csv-parser");
const utils_1 = require("/opt/nodejs/utils");
const s3Client = new client_s3_1.S3Client({});
// Helper functions
async function getCoordsFromS3(bucket, key) {
    const rows = [];
    const command = new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    if (!response.Body) {
        throw new Error('No Body in S3 response');
    }
    const stream = response.Body;
    await new Promise((resolve, reject) => {
        stream
            .pipe(csvParser())
            .on('data', (row) => rows.push(row))
            .on('end', resolve)
            .on('error', reject);
    });
    return rows;
}
async function fetchAirQuality(apiKey, latitude, longitude) {
    // Follows API request template for Multiple parameters response
    // Available at: https://developers.google.com/maps/documentation/air-quality/current-conditions?hl=en#multiple_parameters_response
    const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${apiKey}`;
    const body = JSON.stringify({
        universalAqi: true,
        location: {
            latitude: Number(latitude),
            longitude: Number(longitude)
        },
        extraComputations: [
            "HEALTH_RECOMMENDATIONS",
            "DOMINANT_POLLUTANT_CONCENTRATION",
            "POLLUTANT_CONCENTRATION",
            "LOCAL_AQI",
            "POLLUTANT_ADDITIONAL_INFO"
        ],
        languageCode: "en"
    });
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
    if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Air Quality API error: ${errorText}`);
    }
    return resp.json();
}
// Batch insert function for AqRecords
async function bulkInsertAqRecords(client, AqRecords) {
    if (AqRecords.length === 0)
        return [];
    const valuesClause = AqRecords
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`) // Parameter position fpr tileId, timestamp and ingestionTimestamp
        .join(',');
    const params = AqRecords.flatMap((r) => [r.tileId, r.timestamp, r.ingestionTimestamp]);
    const result = await client.query(`INSERT INTO aq_records (tile_id, timestamp, ingestion_timestamp) VALUES ${valuesClause} RETURNING id, tile_id AS "tileId"`, params);
    return result.rows;
}
;
// Batch insert function for Pollutants
async function bulkInsertPollutants(client, pollutantData) {
    if (pollutantData.length === 0)
        return;
    console.log("Bulk inserting pollutant records:");
    // pollutantData.forEach((record, index) => {
    //     console.log(`Record ${index + 1}:`, record);
    // });
    const valuesClause = pollutantData
        .map((_, i) => `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`)
        .join(',');
    const params = pollutantData.flatMap((r) => [
        r.recordId,
        r.tileId,
        r.timestamp,
        r.ingestionTimestamp,
        r.pm25Value,
        r.pm10Value,
        r.no2Value,
        r.so2Value,
        r.o3Value,
        r.coValue,
    ]);
    await client.query(`INSERT INTO pollutant_concentration
            (record_id, tile_id, timestamp, ingestion_timestamp, pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value)
        VALUES ${valuesClause} ON CONFLICT DO NOTHING`, params);
}
// Batch insert function for AirQualityIndex
async function bulkInsertAirQualityIndex(client, indexData) {
    if (indexData.length === 0)
        return;
    const valuesClause = indexData
        .map((_, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`)
        .join(',');
    const params = indexData.flatMap((r) => [
        r.recordId,
        r.tileId,
        r.indexType,
        r.category,
        JSON.stringify(r.colourCode),
        r.dominantPollutant,
        r.timestamp,
        r.ingestionTimestamp,
        r.value,
    ]);
    await client.query(`INSERT INTO air_quality_index
            (record_id, tile_id, index_type, category, colour_code, dominant_pollutant, timestamp, ingestion_timestamp, value)
        VALUES ${valuesClause} ON CONFLICT DO NOTHING`, params);
}
// Batch insert function for HealthRecommendations
async function bulkInsertHealthRecommendations(client, healthData) {
    if (healthData.length === 0)
        return;
    const valuesClause = healthData
        .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`)
        .join(',');
    const params = healthData.flatMap(r => [
        r.recordId,
        r.tileId,
        r.timestamp,
        r.ingestionTimestamp,
        JSON.stringify(r.recommendations),
    ]);
    await client.query(`INSERT INTO health_recommendation
         (record_id, tile_id, timestamp, ingestion_timestamp, recommendations)
         VALUES ${valuesClause} ON CONFLICT DO NOTHING`, params);
}
// Limit concurrent API requests to 10
const BATCH_CONCURRENCY = 10;
// Set maximum retries upon fetch failures
const MAX_RETRIES = 4;
async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// Perform data fetch with retries
async function fetchAqDataWithRetry(apiKey, latitude, longitude, retries = MAX_RETRIES) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`Retry attempt ${attempt} for coordinates (${latitude}, ${longitude})`);
            }
            const aqData = await fetchAirQuality(apiKey, latitude, longitude);
            // console.log(`Fetched AQ data for (${latitude}, ${longitude}):`, JSON.stringify(aqData, null, 2));
            return aqData;
        }
        catch (error) {
            lastError = error;
            if (error.message?.includes("rate limit") || error.message?.includes("429") || error.cause?.code === "UND_ERR_SOCKET") {
                // Perform exponential backoff delay in the case of rate limiting mechanism from the GOogle air quality API end point
                const delay = Math.pow(2, attempt) * 500;
                console.warn(`Rate limit or socket error on attempt ${attempt} for coordinates (${latitude}, ${longitude}). Backing off for ${delay} ms.`);
                await sleep(delay);
            }
            else {
                console.error(`Fetch error on attempt ${attempt} for coordinates (${latitude}, ${longitude}):`, error);
                break;
            }
        }
    }
    console.error(`All ${retries} attempts failed for coordinates (${latitude}, ${longitude})`);
    throw lastError;
}
// Concurrency scheduler for batch (tiles)
// Concurrency scheduler for batch (tiles)
async function rateLimitedBatchFetch(batch, apiSecret) {
    let results = [];
    for (let i = 0; i < batch.length; i += BATCH_CONCURRENCY) {
        const chunk = batch.slice(i, i + BATCH_CONCURRENCY);
        // Use Promise.allSettled instead of Promise.all
        const chunkResults = await Promise.allSettled(chunk.map(async (tile) => {
            const aqData = await fetchAqDataWithRetry(apiSecret, tile.latitude, tile.longitude);
            return { tile, aqData };
        }));
        // Keep only fulfilled results
        chunkResults.forEach((res, idx) => {
            if (res.status === "fulfilled") {
                results.push(res.value);
            }
            else {
                console.error(`Failed to fetch AQ data for tile ${chunk[idx].id} (${chunk[idx].latitude}, ${chunk[idx].longitude}):`, res.reason);
            }
        });
        // Add a small delay between chunks to further reduce burst load
        await sleep(500);
    }
    return results;
}
const handler = async () => {
    let client;
    try {
        const secretId = process.env.DB_SECRET_ARN;
        const apiSecretId = process.env.GOOGLE_API_SECRET_ARN;
        const bucket = process.env.TILE_COORDS_BUCKET;
        const key = process.env.TILE_COORDS_FILENAME;
        const dbCreds = await (0, utils_1.getSecret)(secretId);
        const apiSecret = await (0, utils_1.getSecret)(apiSecretId);
        if (typeof dbCreds === "string") {
            throw new Error("Expected DB secret to be a JSON object, got string instead");
        }
        client = new pg_1.Client({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password,
            database: process.env.DB_NAME,
            port: parseInt(dbCreds.port, 10),
            ssl: { rejectUnauthorized: false },
        });
        await client.connect();
        const coords = await getCoordsFromS3(bucket, key);
        // Configs for how much records to batch and insert into the RDS+pg database 
        const batchSize = 1000;
        // Start batched operations
        for (let i = 0; i < coords.length; i += batchSize) {
            const batch = coords.slice(i, i + batchSize);
            console.log(`Starting bulk ingest of records from index ${i} to ${Math.min(i + batchSize - 1, coords.length - 1)}`);
            // Fetch Air quality data 
            if (typeof apiSecret !== "string") {
                throw new Error("Expected API secret to be a string");
            }
            const batchedAqData = await rateLimitedBatchFetch(batch, apiSecret);
            if (batchedAqData.length > 0) {
                console.log("First entry of batchedAqData:", JSON.stringify(batchedAqData[0], null, 2));
            }
            else {
                console.log("batchedAqData is empty");
            }
            const aqRecordsToInsert = batchedAqData.map(({ tile, aqData }) => ({
                tileId: tile.id,
                timestamp: aqData.dateTime,
                ingestionTimestamp: new Date().toISOString(),
            }));
            const insertedAqRecords = await bulkInsertAqRecords(client, aqRecordsToInsert);
            // console.log("Inserted AqRecords:");
            // if (insertedAqRecords.length === 0) {
            //     console.log("No rows were inserted. Check for conflicts or duplicates.");
            // } else {
            //     insertedAqRecords.forEach((rec, index) => {
            //         console.log(`Row ${index + 1}: id=${rec.id}, tileId=${rec.tileId}`);
            //     });
            // }
            // Draw relationship between recordId and tileId
            const recordIdMap = new Map();
            insertedAqRecords.forEach(({ id, tileId }) => {
                recordIdMap.set(tileId, id);
            });
            console.log("recordIdMap contents:");
            console.log(Array.from(recordIdMap.entries()).map(([tileId, recordId]) => `${tileId} => ${recordId}`).join(", "));
            const pollutantData = [];
            const aqiData = [];
            const healthRecommendationData = [];
            for (const { tile, aqData } of batchedAqData) {
                const recordId = recordIdMap.get(Number(tile.id));
                // console.log(`recordId: ${recordId}`)
                if (!recordId) {
                    console.warn(`No record ID found for tile ${tile.id}, skipping child inserts`);
                    continue;
                }
                const ingestionTimestamp = new Date().toISOString();
                const timestamp = aqData.dateTime;
                const pollutantsMap = {
                    pm25: 'pm25Value',
                    pm10: 'pm10Value',
                    no2: 'no2Value',
                    so2: 'so2Value',
                    o3: 'o3Value',
                    co: 'coValue',
                };
                // Initialise pollutant values by taking from the PollutantConcentrationRecord class
                // Any columns except for recordId, tileId, timestamp, ingestionTimestamp
                const pollutantValues = {
                    pm25Value: null,
                    pm10Value: null,
                    no2Value: null,
                    so2Value: null,
                    o3Value: null,
                    coValue: null,
                };
                //  Fill pollutant values from API data
                aqData.pollutants.forEach((p) => {
                    const col = pollutantsMap[p.code];
                    if (col) {
                        pollutantValues[col] = p.concentration.value;
                    }
                });
                pollutantData.push({
                    recordId,
                    tileId: tile.id,
                    timestamp,
                    ingestionTimestamp,
                    ...pollutantValues,
                });
                // Prepare AirQualityIndex rows
                aqData.indexes.forEach((idx) => {
                    aqiData.push({
                        recordId,
                        tileId: tile.id,
                        indexType: idx.code,
                        category: idx.category,
                        colourCode: idx.color,
                        dominantPollutant: idx.dominantPollutant,
                        timestamp,
                        ingestionTimestamp,
                        value: idx.aqi,
                    });
                });
                // Prepare HealthRecommendation rows
                const recommendations = {};
                Object.entries(aqData.healthRecommendations)
                    .forEach(([popGroup, val]) => {
                    if (typeof val === 'string' && val.trim().length > 0) {
                        recommendations[popGroup] = val;
                    }
                });
                healthRecommendationData.push({
                    recordId,
                    tileId: tile.id,
                    timestamp,
                    ingestionTimestamp,
                    recommendations,
                });
            }
            // Call bulk insert functions with typed arrays
            console.log(`Inserting ${pollutantData.length} pollutant records`);
            await bulkInsertPollutants(client, pollutantData);
            console.log(`Inserting ${aqiData.length} air quality index records`);
            await bulkInsertAirQualityIndex(client, aqiData);
            console.log(`Inserting ${healthRecommendationData.length} health recommendation records`);
            await bulkInsertHealthRecommendations(client, healthRecommendationData);
            console.log(`Completed ingestion of records from index ${i} to ${Math.min(i + batchSize - 1, coords.length - 1)}`);
        }
        await client.end();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Batch ingestion succeeded.' }),
        };
    }
    catch (error) {
        if (client)
            await client.end();
        console.error('Ingestion failed', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
exports.handler = handler;
