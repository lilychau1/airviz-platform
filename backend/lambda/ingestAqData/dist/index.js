"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const client_s3_1 = require("@aws-sdk/client-s3");
const csvParser = require("csv-parser");
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
const s3Client = new client_s3_1.S3Client({});
async function getSecret(secretId) {
    const data = await secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretId }));
    try {
        // Try parsing as JSON (for DB secret or any structured secret)
        return JSON.parse(data.SecretString || '{}');
    }
    catch {
        // If parsing fails, treat as plain text (for your Google API key)
        return data.SecretString;
    }
}
;
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
    const url = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${apiKey}`;
    const body = JSON.stringify({
        location: { latitude: Number(latitude), longitude: Number(longitude) }
    });
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
    if (!resp.ok) {
        const errorText = await resp.text();
        console.error('Air Quality API Error details:', errorText); // Add this line
        throw new Error('Air Quality API error');
    }
    return resp.json();
}
const handler = async () => {
    let client;
    try {
        const secretId = process.env.DB_SECRET_ARN;
        const apiSecretId = process.env.GOOGLE_API_SECRET_ARN;
        const bucket = process.env.TILE_COORDS_BUCKET;
        const key = process.env.TILE_COORDS_FILENAME;
        const dbCreds = await getSecret(secretId);
        const apiSecret = await getSecret(apiSecretId);
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
        for (const { latitude, longitude } of coords) {
            console.log(latitude, longitude);
            const apiData = await fetchAirQuality(apiSecret.apiKey, latitude, longitude);
            // Insert data using your ingestion logic...
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
//# sourceMappingURL=index.js.map