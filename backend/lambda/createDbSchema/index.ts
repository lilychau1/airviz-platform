import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, GetObjectCommand, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const secretsClient = new SecretsManagerClient({});
const s3Client = new S3Client({});

// Helper functions
async function getSecret(secretId: string) {
    const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
    return JSON.parse(data.SecretString || '{}');
}

async function streamToString(stream: Readable): Promise<string> {
    const chunks: any[] = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
}

// Interfaces
interface Borough {
  name: string;
  latitude: number;
  longitude: number;
  description?: string;
}

export const handler = async () => {
    let client: Client | undefined;
    try {
        const secretId = process.env.DB_SECRET_ARN!;
        const dbCreds = await getSecret(secretId);

        client = new Client({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password,
            database: process.env.DB_NAME, 
            port: parseInt(dbCreds.port, 10),
            ssl: { rejectUnauthorized: false },
        });

        await client.connect();

        const res = await client.query(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public';
        `);
        console.log('Existing tables:', res.rows);
        
        const tablesToDrop = [
            'health_recommendation',
            'air_quality_index',
            'pollutant_concentration',
            'aq_records',
            'tiles',
            'postcode_areas',
            'zones',
            'boroughs',
        ];

        for (const table of tablesToDrop) {
            await client.query(`DROP TABLE IF EXISTS public.${table} CASCADE;`);
            console.log(`Table ${table} dropped (if it existed).`)
        }

        // Create schema
        console.log('Creating new tables...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS boroughs (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL, 
                location POINT NOT NULL, 
                inserted_at TIMESTAMP NOT NULL, 
                updated_at TIMESTAMP NOT NULL, 
                description TEXT
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS zones (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL, 
                location POINT NOT NULL, 
                inserted_at TIMESTAMP NOT NULL, 
                updated_at TIMESTAMP NOT NULL, 
                description TEXT
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS postcode_areas (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL, 
                location POINT NOT NULL, 
                inserted_at TIMESTAMP NOT NULL, 
                updated_at TIMESTAMP NOT NULL, 
                description TEXT
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS tiles (
                id SERIAL PRIMARY KEY,
                /* borough_id INT REFERENCES boroughs(id), */
                borough_id INT, 
                /* zone_id INT REFERENCES zones(id), */ 
                zone_id INT, 
                /* postcode_area_id INT REFERENCES postcode_areas(id), */
                postcode_area_id INT, 
                name VARCHAR(255) NOT NULL, 
                location POINT NOT NULL, 
                inserted_at TIMESTAMP NOT NULL, 
                updated_at TIMESTAMP NOT NULL, 
                description TEXT
            );
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS aq_records (
                id SERIAL PRIMARY KEY,
                tile_id INT NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                ingestion_timestamp TIMESTAMP NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS pollutant_concentration (
                id SERIAL PRIMARY KEY,
                record_id INT REFERENCES aq_records(id),
                /* tile_id INT REFERENCES Tiles(id), */
                tile_id INT NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                ingestion_timestamp TIMESTAMP NOT NULL,
                pm25_value DOUBLE PRECISION,
                pm10_value DOUBLE PRECISION,
                no2_value DOUBLE PRECISION,
                so2_value DOUBLE PRECISION,
                o3_value DOUBLE PRECISION,
                co_value DOUBLE PRECISION
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS air_quality_index (
                id SERIAL PRIMARY KEY,
                record_id INT REFERENCES aq_records(id),
                /* tile_id INT REFERENCES Tiles(id), */
                tile_id INT NOT NULL,
                index_type VARCHAR(20) NOT NULL,
                category TEXT NOT NULL,
                colour_code JSONB NOT NULL,
                dominant_pollutant VARCHAR(50) NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                ingestion_timestamp TIMESTAMP NOT NULL,
                value INT
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS health_recommendation (
                id SERIAL PRIMARY KEY,
                record_id INT REFERENCES aq_records(id),
                /* tile_id INT REFERENCES Tiles(id), */
                tile_id INT NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                ingestion_timestamp TIMESTAMP NOT NULL,
                recommendations JSONB NOT NULL
            );
        `);

        // Read borough JSON from S3
        const bucket = process.env.BOROUGH_COORDS_BUCKET!;
        const key = process.env.BOROUGH_COORDS_FILENAME!;

        const s3Resp: GetObjectCommandOutput = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const jsonString: string = await streamToString(s3Resp.Body as Readable);
        const boroughs: Borough[] = JSON.parse(jsonString);

        console.log(`Loaded ${boroughs.length} boroughs from S3`);

        // Insert boroughs into DB
        if (boroughs.length > 0) {
            const now = new Date().toISOString();

            // Create inserting SQL clause for borough information
            const valuesClause = boroughs
                .map((_: Borough, i: number) => 
                    `($${i*7 + 1}, $${i*7 + 2}, POINT($${i*7 + 3}, $${i*7 + 4}), $${i*7 + 5}, $${i*7 + 6}, $${i*7 + 7})`
                )
                .join(', ');

            // Flatten parameters for all of the boråoughs
            const params = boroughs.flatMap((borough: Borough, i: number) => [
                i + 1, 
                borough.name, 
                borough.longitude, 
                borough.latitude, 
                now, 
                now, 
                borough.description || '' 
            ]);
            
            // Run query
            await client.query(
                `INSERT INTO boroughs (id, name, location, inserted_at, updated_at, description) VALUES ${valuesClause}`,
                params
            );

            console.log(`Inserted ${boroughs.length} boroughs successfully.`);
        }
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Schema setup completed successfully' }),
        };
    } catch (error) {
        if (client) await client.end();
        console.error('Schema migration failed', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: (error as Error).message }),
        };
    } finally {
        if (client) await client.end();
    }
};
