import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import csvParser = require('csv-parser');

const secretsClient = new SecretsManagerClient({});
const s3Client = new S3Client({});

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

async function getCoordsFromS3(bucket: string, key: string): Promise<{latitude: string, longitude: string}[]> {
    const rows: {latitude: string, longitude: string}[] = [];
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);

    if (!response.Body) {
        throw new Error('No Body in S3 response');
    }

    const stream = response.Body as Readable;

    await new Promise((resolve, reject) => {
        stream
            .pipe(csvParser())
            .on('data', (row: { latitude: string; longitude: string; }) => rows.push(row))
            .on('end', resolve)
            .on('error', reject);
    });
    return rows;
}

async function fetchAirQuality(apiKey: string, latitude: string, longitude: string) {
    const url = `https://airquality.googleapis.com/v1/currentConditions?location=${latitude},${longitude}&key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Air Quality API error');
    return resp.json();
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

        const coords = await getCoordsFromS3(bucket, key);

        for (const { latitude, longitude } of coords) {
            console.log(latitude, longitude);
            // const apiData = await fetchAirQuality(apiSecret.apiKey, latitude, longitude);
            // Insert data using your ingestion logic...
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
