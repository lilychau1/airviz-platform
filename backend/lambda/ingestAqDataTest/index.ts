import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import csvParser = require('csv-parser');

const secretsClient = new SecretsManagerClient({});
const s3Client = new S3Client({});

// Interfaces
interface FetchAirQualityResponse {
    dateTime: string;
    pollutants: {
        code: string; 
        concentration: {
        value: number;
        unit?: string;
        };
    }[];
    indexes: {
        code: string;  
        category: string; 
        color: { 
            red?: number; 
            green?: number; 
            blue?: number; 
            alpha: number 
        };
        dominantPollutant: string;
        aqi: number;
    }[];
    healthRecommendations: Record<string, string>; 
    [key: string]: any; // Any extra fields
}

interface PollutantConcentrationRecord {
  recordId: number;
  tileId: number;
  timestamp: string; 
  ingestionTimestamp: string; 
  pm25Value: number | null;
  pm10Value: number | null;
  no2Value: number | null;
  so2Value: number | null;
  o3Value: number | null;
  coValue: number | null;
}

interface AqiRecord {
  recordId: number;
  tileId: number;
  indexType: string;
  category: string;
  colourCode: {
    red?: number;
    green?: number;
    blue?: number;
    alpha: number;
  };
  dominantPollutant: string;
  timestamp: string;
  ingestionTimestamp: string;
  value: number;
}

interface HealthRecommendationRecord {
  recordId: number;
  tileId: number;
  timestamp: string;
  ingestionTimestamp: string;
  populationGroup: string;
  value: string;
}

interface coordsRecord {
    id: number, 
    latitude: string, 
    longitude: string
}

type AqTileData = {
    tile: coordsRecord; 
    aqData: FetchAirQualityResponse;
}

// Helper functions
async function getSecret(secretId: string) {
    const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
    try {
        // Try parsing as JSON (for DB secret or any structured secret)
        return JSON.parse(data.SecretString || '{}');
    } catch {
        // If parsing fails, treat as plain text (for your Google API key)
        return data.SecretString;
    }
}; 

async function getCoordsFromS3(bucket: string, key: string): Promise<coordsRecord[]> {
    const rows: coordsRecord[] = [];
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);

    if (!response.Body) {
        throw new Error('No Body in S3 response');
    }

    const stream = response.Body as Readable;

    await new Promise((resolve, reject) => {
        stream
            .pipe(csvParser())
            .on('data', (row: { id: number; latitude: string; longitude: string; }) => rows.push(row))
            .on('end', resolve)
            .on('error', reject);
    });
    return rows;
}

async function fetchAirQuality(apiKey: string, latitude: string, longitude: string) {
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
async function bulkInsertAqRecords(
    client: Client, 
    AqRecords: { tileId: number; timestamp: string; ingestionTimestamp: string}[]
): Promise<{ id: number; tileId: number }[]> {
    if (AqRecords.length === 0) return []; 

    const valuesClause = AqRecords
        .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`) // Parameter position fpr tileId, timestamp and ingestionTimestamp
        .join(','); 
    
    const params = AqRecords.flatMap((r) => [r.tileId, r.timestamp, r.ingestionTimestamp]); 

    const result = await client.query(
        `INSERT INTO AqRecords (tileId, timestamp, ingestionTimestamp) VALUES ${valuesClause} RETURNING id, tileid AS "tileId"`
        , params);
    return result.rows;
}; 

// Batch insert function for Pollutants
async function bulkInsertPollutants(client: Client, pollutantData: any[]) {
    if (pollutantData.length === 0) return;

    console.log("Bulk inserting pollutant records:");
    pollutantData.forEach((record, index) => {
        console.log(`Record ${index + 1}:`, record);
    });
    
    const valuesClause = pollutantData
        .map(
            (_, i) =>
            `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`
        )
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

    await client.query(
        `INSERT INTO PollutantConcentration
            (recordId, tileId, timestamp, ingestionTimestamp, pm25Value, pm10Value, no2Value, so2Value, o3Value, coValue)
        VALUES ${valuesClause} ON CONFLICT DO NOTHING`,
        params
    );
}

// Batch insert function for AirQualityIndex
async function bulkInsertAirQualityIndex(client: Client, indexData: any[]) {
    if (indexData.length === 0) return;

    const valuesClause = indexData
        .map(
            (_, i) =>
            `($${i * 9 + 1}, $${i * 9 + 2}, $${i * 9 + 3}, $${i * 9 + 4}, $${i * 9 + 5}, $${i * 9 + 6}, $${i * 9 + 7}, $${i * 9 + 8}, $${i * 9 + 9})`
        )
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

    await client.query(
        `INSERT INTO AirQualityIndex
            (recordId, tileId, indexType, category, colourCode, dominantPollutant, timestamp, ingestionTimestamp, value)
        VALUES ${valuesClause} ON CONFLICT DO NOTHING`,
        params
    );
}

// Batch insert function for HealthRecommendations
async function bulkInsertHealthRecommendations(client: Client, healthData: any[]) {
    if (healthData.length === 0) return;
    
    const valuesClause = healthData
        .map(
            (_, i) =>
            `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`
        )
        .join(',');

    const params = healthData.flatMap((r) => [
        r.recordId,
        r.tileId,
        r.timestamp,
        r.ingestionTimestamp,
        r.populationGroup,
        r.value,
    ]);

    await client.query(
        `INSERT INTO HealthRecommendation
            (recordId, tileId, timestamp, ingestionTimestamp, populationGroup, value)
        VALUES ${valuesClause} ON CONFLICT DO NOTHING`,
        params
    );
}

// Limit concurrent API requests to 10
const BATCH_CONCURRENCY = 10; 

// Set maximum retries upon fetch failures
const MAX_RETRIES = 4;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Perform data fetch with retries
async function fetchAqDataWithRetry(
    apiKey: string, 
    latitude: string, 
    longitude: string, 
    retries = MAX_RETRIES
): Promise<FetchAirQualityResponse> {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`Retry attempt ${attempt} for coordinates (${latitude}, ${longitude})`);
            }
            
            const aqData = await fetchAirQuality(apiKey, latitude, longitude);
            console.log(`Fetched AQ data for (${latitude}, ${longitude}):`, JSON.stringify(aqData, null, 2));

            return aqData;

        } catch (error: any) {
        lastError = error;
        if (error.message?.includes("rate limit") || error.message?.includes("429") || error.cause?.code === "UND_ERR_SOCKET") {
            // Perform exponential backoff delay in the case of rate limiting mechanism from the GOogle air quality API end point
            const delay = Math.pow(2, attempt) * 500;

            console.warn(`Rate limit or socket error on attempt ${attempt} for coordinates (${latitude}, ${longitude}). Backing off for ${delay} ms.`);

            await sleep(delay);
        } else {
            
            console.error(`Fetch error on attempt ${attempt} for coordinates (${latitude}, ${longitude}):`, error);

            break; 
        }
        }
    }
    
    console.error(`All ${retries} attempts failed for coordinates (${latitude}, ${longitude})`);

    throw lastError;
}

// Concurrency scheduler for batch (tiles)
async function rateLimitedBatchFetch(batch: coordsRecord[], apiSecret: string) {
    let results: { tile: coordsRecord, aqData: FetchAirQualityResponse }[] = [];

    for (let i = 0; i < batch.length; i += BATCH_CONCURRENCY) {
        const chunk = batch.slice(i, i + BATCH_CONCURRENCY);
        const chunkResults = await Promise.all(chunk.map(async (tile) => {
            const aqData = await fetchAqDataWithRetry(apiSecret, tile.latitude, tile.longitude);
            return { tile, aqData };
        }));
        results.push(...chunkResults);
        // Add a small delay between chunks to further reduce burst load
        await sleep(500);
    }

    return results;
}

export const handler = async () => {
    let client: Client | undefined;
    try {
        const secretId = process.env.DB_SECRET_ARN!;
        const apiSecretId = process.env.GOOGLE_API_SECRET_ARN!;
        const bucket = process.env.TILE_COORDS_BUCKET!;
        const key = process.env.TILE_COORDS_FILENAME!;
        const dbCreds = await getSecret(secretId);
        const apiSecret = await getSecret(apiSecretId);

        client = new Client({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password,
            database: process.env.DB_NAME,
            port: parseInt(dbCreds.port, 10),
            ssl: { rejectUnauthorized: false },
        });

        await client.connect();

        const fullCoords = await getCoordsFromS3(bucket, key);
        const coords = fullCoords.slice(0, 50);


        // Configs for how much records to batch and insert into the RDS+pg database 
        const batchSize = 1000;

        // Start batched operations
        for (let i=0; i < coords.length; i += batchSize) {
            const batch = coords.slice(i, i + batchSize); 
            
            console.log(`Starting bulk ingest of records from index ${i} to ${Math.min(i + batchSize - 1, coords.length - 1)}`);

            // Fetch Air quality data 
            const batchedAqData = await rateLimitedBatchFetch(batch, apiSecret);
            
            if (batchedAqData.length > 0) {
                console.log("First entry of batchedAqData:", JSON.stringify(batchedAqData[0], null, 2));
            } else {
                console.log("batchedAqData is empty");
            }

            const aqRecordsToInsert = batchedAqData.map(({ tile, aqData }) => ({
                tileId: tile.id,
                timestamp: aqData.dateTime,
                ingestionTimestamp: new Date().toISOString(),
            }));

            const insertedAqRecords = await bulkInsertAqRecords(client, aqRecordsToInsert);

            console.log("Inserted AqRecords:");
            if (insertedAqRecords.length === 0) {
                console.log("No rows were inserted. Check for conflicts or duplicates.");
            } else {
                insertedAqRecords.forEach((rec, index) => {
                    console.log(`Row ${index + 1}: id=${rec.id}, tileId=${rec.tileId}`);
                });
            }

            // Draw relationship between recordId and tileId
            const recordIdMap = new Map<number, number>();
            insertedAqRecords.forEach(
                ({ id, tileId }) => {
                    recordIdMap.set(tileId, id); 
            });
            console.log("recordIdMap contents:");
            console.log(Array.from(recordIdMap.entries()).map(([tileId, recordId]) => `${tileId} => ${recordId}`).join(", "));

            const pollutantData: PollutantConcentrationRecord[] = []; 
            const aqiData: AqiRecord[] = []; 
            const healthRecommendationData: HealthRecommendationRecord[] = []; 

            for (const { tile, aqData } of batchedAqData) {
                const recordId = recordIdMap.get(tile.id);

                if (!recordId) {
                    console.warn(`No record ID found for tile ${tile.id}, skipping child inserts`);
                    continue;
                }

                const ingestionTimestamp = new Date().toISOString();
                const timestamp = aqData.dateTime;

                // Map pollutant codes to DB columns for insertion
                type PollutantKeys = keyof Omit<PollutantConcentrationRecord, 'recordId' | 'tileId' | 'timestamp' | 'ingestionTimestamp'>;

                const pollutantsMap: Record<string, PollutantKeys> = {
                    pm25: 'pm25Value',
                    pm10: 'pm10Value',
                    no2: 'no2Value',
                    so2: 'so2Value',
                    o3: 'o3Value',
                    co: 'coValue',
                };

                // Initialise pollutant values by taking from the PollutantConcentrationRecord class
                // Any columns except for recordId, tileId, timestamp, ingestionTimestamp

                const pollutantValues: Record<PollutantKeys, number | null> = {
                    pm25Value: null,
                    pm10Value: null,
                    no2Value: null,
                    so2Value: null,
                    o3Value: null,
                    coValue: null,
                };

                //  Fill pollutant values from API data
                aqData.pollutants.forEach((p: any) => {
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
                aqData.indexes.forEach((idx: any) => {
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
                Object.entries(aqData.healthRecommendations)
                    .filter(([_, val]) => typeof val === 'string' && val.trim().length > 0)
                    .forEach(([popGroup, val]) => {
                    healthRecommendationData.push({
                        recordId,
                        tileId: tile.id,
                        timestamp,
                        ingestionTimestamp,
                        populationGroup: popGroup,
                        value: val as string,
                    });
                });

            }
            // Call bulk insert functions with typed arrays
            console.log(`Inserting ${pollutantData.length} pollutant records`);
            await bulkInsertPollutants(client, pollutantData);

            // console.log(`Inserting ${aqiData.length} air quality index records`);
            // await bulkInsertAirQualityIndex(client, aqiData);

            // console.log(`Inserting ${healthRecommendationData.length} health recommendation records`);
            // await bulkInsertHealthRecommendations(client, healthRecommendationData);

            // console.log(`Completed ingestion of records from index ${i} to ${Math.min(i + batchSize - 1, coords.length - 1)}`);

        }

        await client.end();

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Batch ingestion succeeded.' }),
        };
    } catch (error) {
        if (client) await client.end();
        console.error('Ingestion failed', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: (error as Error).message }),
        };
    }
};
