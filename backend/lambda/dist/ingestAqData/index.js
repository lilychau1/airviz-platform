"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const client_s3_1 = require("@aws-sdk/client-s3");
const csvParser = require("csv-parser");
const utils_1 = require("/opt/nodejs/utils");
const s3Client = new client_s3_1.S3Client({});
async function getCoordsFromS3(bucket, key) {
    const rows = [];
    const command = new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    if (!response.Body)
        throw new Error('No Body in S3 response');
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
    const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${apiKey}`;
    const body = JSON.stringify({
        universalAqi: true,
        location: { latitude: Number(latitude), longitude: Number(longitude) },
        extraComputations: [
            "HEALTH_RECOMMENDATIONS",
            "DOMINANT_POLLUTANT_CONCENTRATION",
            "POLLUTANT_CONCENTRATION",
            "LOCAL_AQI",
            "POLLUTANT_ADDITIONAL_INFO"
        ],
        languageCode: "en"
    });
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!resp.ok)
        throw new Error(`Air Quality API error: ${await resp.text()}`);
    return resp.json();
}
async function bulkInsertAqRecords(client, AqRecords) {
    if (AqRecords.length === 0)
        return [];
    const valuesClause = AqRecords.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
    const params = AqRecords.flatMap(r => [r.tileId, r.timestamp, r.ingestionTimestamp]);
    const result = await client.query(`INSERT INTO aq_records (tile_id, timestamp, ingestion_timestamp)
         VALUES ${valuesClause}
         ON CONFLICT (tile_id, timestamp) DO UPDATE SET timestamp = EXCLUDED.timestamp
         RETURNING id, tile_id AS "tileId"`, params);
    return result.rows;
}
async function bulkInsertPollutants(client, pollutantData) {
    if (pollutantData.length === 0)
        return;
    const valuesClause = pollutantData
        .map((_, i) => `($${i * 16 + 1}, $${i * 16 + 2}, $${i * 16 + 3}, $${i * 16 + 4}, $${i * 16 + 5}, $${i * 16 + 6}, $${i * 16 + 7}, $${i * 16 + 8}, $${i * 16 + 9}, $${i * 16 + 10}, $${i * 16 + 11}, $${i * 16 + 12}, $${i * 16 + 13}, $${i * 16 + 14}, $${i * 16 + 15}, $${i * 16 + 16})`).join(',');
    const params = pollutantData.flatMap(r => [
        r.recordId, r.tileId, r.timestamp, r.ingestionTimestamp,
        r.pm25Value, r.pm10Value, r.no2Value, r.so2Value, r.o3Value, r.coValue,
        r.pm25Impact, r.pm10Impact, r.no2Impact, r.so2Impact, r.o3Impact, r.coImpact
    ]);
    await client.query(`INSERT INTO pollutant_concentration
            (record_id, tile_id, timestamp, ingestion_timestamp, pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value,
            pm25_impact, pm10_impact, no2_impact, so2_impact, o3_impact, co_impact)
         VALUES ${valuesClause} ON CONFLICT (record_id, tile_id) DO NOTHING`, params);
}
async function bulkInsertAirQualityIndex(client, indexData) {
    if (indexData.length === 0)
        return;
    const valuesClause = indexData
        .map((_, i) => `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`).join(',');
    const params = indexData.flatMap(r => [
        r.recordId, r.tileId, r.indexType, r.category, JSON.stringify(r.colourCode),
        r.dominantPollutant, r.timestamp, r.ingestionTimestamp, r.value
    ]);
    await client.query(`INSERT INTO air_quality_index
            (record_id, tile_id, index_type, category, colour_code, dominant_pollutant, timestamp, ingestion_timestamp, value)
         VALUES ${valuesClause} ON CONFLICT (record_id, tile_id, index_type) DO NOTHING`, params);
}
async function bulkInsertHealthRecommendations(client, healthData) {
    if (healthData.length === 0)
        return;
    const valuesClause = healthData
        .map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(',');
    const params = healthData.flatMap(r => [
        r.recordId, r.tileId, r.timestamp, r.ingestionTimestamp, JSON.stringify(r.recommendations)
    ]);
    await client.query(`INSERT INTO health_recommendation
            (record_id, tile_id, timestamp, ingestion_timestamp, recommendations)
         VALUES ${valuesClause} ON CONFLICT (record_id, tile_id) DO NOTHING`, params);
}
const BATCH_CONCURRENCY = 10;
const MAX_RETRIES = 4;
async function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function fetchAqDataWithRetry(apiKey, latitude, longitude, retries = MAX_RETRIES) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            if (attempt > 0)
                console.log(`Retry attempt ${attempt} for coordinates (${latitude}, ${longitude})`);
            return await fetchAirQuality(apiKey, latitude, longitude);
        }
        catch (error) {
            lastError = error;
            if (error.message?.includes("rate limit") || error.message?.includes("429") || error.cause?.code === "UND_ERR_SOCKET") {
                const delay = Math.pow(2, attempt) * 500;
                console.warn(`Rate limit/socket error on attempt ${attempt} for (${latitude}, ${longitude}), backing off ${delay}ms`);
                await sleep(delay);
            }
            else {
                console.error(`Fetch error on attempt ${attempt} for (${latitude}, ${longitude}):`, error);
                break;
            }
        }
    }
    console.error(`All ${retries} attempts failed for (${latitude}, ${longitude})`);
    throw lastError;
}
async function rateLimitedBatchFetch(batch, apiSecret) {
    let results = [];
    for (let i = 0; i < batch.length; i += BATCH_CONCURRENCY) {
        const chunk = batch.slice(i, i + BATCH_CONCURRENCY);
        const chunkResults = await Promise.allSettled(chunk.map(tile => fetchAqDataWithRetry(apiSecret, tile.latitude, tile.longitude).then(aqData => ({ tile, aqData }))));
        chunkResults.forEach((res, idx) => {
            if (res.status === "fulfilled")
                results.push(res.value);
            else
                console.error(`Failed to fetch AQ data for tile ${chunk[idx].id} (${chunk[idx].latitude}, ${chunk[idx].longitude}):`, res.reason);
        });
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
        if (typeof dbCreds === "string")
            throw new Error("Expected DB secret to be a JSON object, got string instead");
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
        const batchSize = 1000;
        for (let i = 0; i < coords.length; i += batchSize) {
            const batch = coords.slice(i, i + batchSize);
            console.log(`Starting bulk ingest of records from index ${i} to ${Math.min(i + batchSize - 1, coords.length - 1)}`);
            if (typeof apiSecret !== "string")
                throw new Error("Expected API secret to be a string");
            const batchedAqData = await rateLimitedBatchFetch(batch, apiSecret);
            if (batchedAqData.length > 0)
                console.log("First entry of batchedAqData:", JSON.stringify(batchedAqData[0], null, 2));
            else
                console.log("batchedAqData is empty");
            const aqRecordsToInsert = batchedAqData.map(({ tile, aqData }) => ({
                tileId: tile.id,
                timestamp: aqData.dateTime,
                ingestionTimestamp: new Date().toISOString(),
            }));
            const insertedAqRecords = await bulkInsertAqRecords(client, aqRecordsToInsert);
            const recordIdMap = new Map();
            insertedAqRecords.forEach(({ id, tileId }) => recordIdMap.set(tileId, id));
            console.log("recordIdMap contents:");
            console.log(Array.from(recordIdMap.entries()).map(([tileId, recordId]) => `${tileId} => ${recordId}`).join(", "));
            const pollutantData = [];
            const aqiData = [];
            const healthRecommendationData = [];
            for (const { tile, aqData } of batchedAqData) {
                const recordId = recordIdMap.get(Number(tile.id));
                if (!recordId) {
                    console.warn(`No record ID found for tile ${tile.id}, skipping child inserts`);
                    continue;
                }
                const ingestionTimestamp = new Date().toISOString();
                const timestamp = aqData.dateTime;
                const pollutantsMap = {
                    pm25: { valueKey: 'pm25Value', impactKey: 'pm25Impact' },
                    pm10: { valueKey: 'pm10Value', impactKey: 'pm10Impact' },
                    no2: { valueKey: 'no2Value', impactKey: 'no2Impact' },
                    so2: { valueKey: 'so2Value', impactKey: 'so2Impact' },
                    o3: { valueKey: 'o3Value', impactKey: 'o3Impact' },
                    co: { valueKey: 'coValue', impactKey: 'coImpact' },
                };
                const pollutantValues = {
                    pm25Value: null, pm10Value: null, no2Value: null, so2Value: null, o3Value: null, coValue: null,
                    pm25Impact: null, pm10Impact: null, no2Impact: null, so2Impact: null, o3Impact: null, coImpact: null,
                };
                aqData.pollutants.forEach((p) => {
                    const mapping = pollutantsMap[p.code];
                    if (mapping) {
                        if (mapping.valueKey.endsWith('Value')) {
                            pollutantValues[mapping.valueKey] =
                                typeof p.concentration.value === "number" ? p.concentration.value : null;
                        }
                        if (mapping.impactKey.endsWith('Impact')) {
                            pollutantValues[mapping.impactKey] =
                                p.additionalInfo?.effects ?? null;
                        }
                    }
                });
                pollutantData.push({
                    recordId,
                    tileId: tile.id,
                    timestamp,
                    ingestionTimestamp,
                    pm25Value: pollutantValues.pm25Value,
                    pm10Value: pollutantValues.pm10Value,
                    no2Value: pollutantValues.no2Value,
                    so2Value: pollutantValues.so2Value,
                    o3Value: pollutantValues.o3Value,
                    coValue: pollutantValues.coValue,
                    pm25Impact: pollutantValues.pm25Impact,
                    pm10Impact: pollutantValues.pm10Impact,
                    no2Impact: pollutantValues.no2Impact,
                    so2Impact: pollutantValues.so2Impact,
                    o3Impact: pollutantValues.o3Impact,
                    coImpact: pollutantValues.coImpact,
                });
                aqData.indexes.forEach(idx => {
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
                const recommendations = {};
                Object.entries(aqData.healthRecommendations).forEach(([popGroup, val]) => {
                    if (typeof val === 'string' && val.trim().length > 0)
                        recommendations[popGroup] = val;
                });
                healthRecommendationData.push({
                    recordId,
                    tileId: tile.id,
                    timestamp,
                    ingestionTimestamp,
                    recommendations,
                });
            }
            console.log(`Inserting ${pollutantData.length} pollutant records`);
            await bulkInsertPollutants(client, pollutantData);
            console.log(`Inserting ${aqiData.length} air quality index records`);
            await bulkInsertAirQualityIndex(client, aqiData);
            console.log(`Inserting ${healthRecommendationData.length} health recommendation records`);
            await bulkInsertHealthRecommendations(client, healthRecommendationData);
            console.log(`Completed ingestion of records from index ${i} to ${Math.min(i + batchSize - 1, coords.length - 1)}`);
        }
        await client.end();
        return { statusCode: 200, body: JSON.stringify({ message: 'Batch ingestion succeeded.' }) };
    }
    catch (error) {
        if (client)
            await client.end();
        console.error('Ingestion failed', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
exports.handler = handler;
