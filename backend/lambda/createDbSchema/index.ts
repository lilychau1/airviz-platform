import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretId: string) {
    const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
    return JSON.parse(data.SecretString || '{}');
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
