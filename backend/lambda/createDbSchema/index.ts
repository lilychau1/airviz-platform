import { Client } from 'pg';
import { S3Client, GetObjectCommand, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getSecret } from '/opt/nodejs/utils';

const s3Client = new S3Client({});

// Helper functions
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

interface TileCsvRecord {
    id: number; 
    latitude: number; 
    longitude: number; 
    boroughId: number;
}

export const handler = async () => {
    let client: Client | undefined;
    try {
        const secretId = process.env.DB_SECRET_ARN!;
        const dbCreds = await getSecret(secretId);

        if (typeof dbCreds === "string") {
            throw new Error("Expected DB secret to be a JSON object, got string instead");
        }
        
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
            'aggregate_state', 
            'regional_aggregates'
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
                region VARCHAR(255) NOT NULL,
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
                ingestion_timestamp TIMESTAMP NOT NULL,
                CONSTRAINT uq_aq_records_tile_timestamp UNIQUE (tile_id, timestamp)
            );
        `);
        
        // Add index for more efficient query
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_aq_records_tile_timestamp
            ON aq_records(tile_id, timestamp DESC, ingestion_timestamp DESC);
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
                co_value DOUBLE PRECISION, 
                pm25_impact TEXT,
                pm10_impact TEXT,
                no2_impact TEXT,
                so2_impact TEXT,
                o3_impact TEXT,
                co_impact TEXT, 
                CONSTRAINT uq_pollutant_record_tile UNIQUE (record_id, tile_id)
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
                value INT,
                CONSTRAINT uq_aqi_record_tile_index UNIQUE (record_id, tile_id, index_type)
            );
        `);

        // Add index for more efficient query
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_air_quality_index_record_id
            ON air_quality_index(record_id);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS health_recommendation (
                id SERIAL PRIMARY KEY,
                record_id INT REFERENCES aq_records(id),
                /* tile_id INT REFERENCES Tiles(id), */
                tile_id INT NOT NULL,
                timestamp TIMESTAMP NOT NULL,
                ingestion_timestamp TIMESTAMP NOT NULL,
                recommendations JSONB NOT NULL,
                CONSTRAINT uq_health_record_tile UNIQUE (record_id, tile_id)
            );
        `);

        // Initialise borough table contents
        // Read borough JSON from S3
        const bucket = process.env.BUCKET!;
        const key = process.env.BOROUGH_COORDS_FILENAME!;

        const s3Resp: GetObjectCommandOutput = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const jsonString: string = await streamToString(s3Resp.Body as Readable);
        const boroughs: Borough[] = JSON.parse(jsonString);
        const now = new Date().toISOString();

        console.log(`Loaded ${boroughs.length} boroughs from S3`);

        // Insert boroughs into DB
        if (boroughs.length > 0) {

            // Create inserting SQL clause for borough information
            const valuesClause = boroughs
                .map((_: Borough, i: number) => 
                    `($${i * 8 + 1}, $${i * 8 + 2}, $${i * 8 + 3}, POINT($${i * 8 + 4}, $${i * 8 + 5}), $${i * 8 + 6}, $${i * 8 + 7}, $${i * 8 + 8})`
                )
                .join(', ');

            // Flatten parameters for all of the boråoughs
            const params = boroughs.flatMap((borough: Borough, i: number) => [
                i + 1, // id
                borough.name, // name
                'Greater London', // region placeholder
                borough.longitude, // POINT X
                borough.latitude, // POINT Y
                now, // inserted_at
                now, // updated at
                borough.description || '' //description
            ]);
            
            // Run query
            await client.query(
                `INSERT INTO boroughs (id, name, region, location, inserted_at, updated_at, description) VALUES ${valuesClause}`,
                params
            );

            console.log(`Inserted ${boroughs.length} boroughs successfully.`);
        }

        // Initialise tile table content from tile coordinates with boroughId csv
        const tileKey = process.env.TILE_COORDS_FILENAME!;
        const tileResp: GetObjectCommandOutput = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: tileKey }));
        const csvString: string = await streamToString(tileResp.Body as Readable);

        // Parse the CSV file to fit the data to paramters
        const tileLines = csvString.trim().split('\n');
        const tileHeader = tileLines.shift()?.split(','); // Split the header to obtain ["id","latitude","longitude","boroughId"]

        // Catch missing tileHeader
        if (!tileHeader) throw new Error('Tile CSV header missing');

        const tiles: TileCsvRecord[] = tileLines.map(line => {
            const cols: string[] = line.split(',');

            return {
                id: Number(cols[0]),
                latitude: Number(cols[1]),
                longitude: Number(cols[2]),
                boroughId: Number(cols[3])
            };
        });

        console.log(`Loaded ${tiles.length} tiles from CSV`);

        // Insert tiles records into tiles table
        if (tiles.length > 0) {
        const valuesClause = tiles
            .map((tile: TileCsvRecord, i: number) =>
                `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, POINT($${i * 10 + 6}, $${i * 10 + 7}), $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`
            )
            .join(', ');

            const params = tiles.flatMap(tile => [
                tile.id, // id
                tile.boroughId || null, //borough_id
                null, // zone_id placeholder
                null, // postcode_area_id placeholder
                `Tile ${tile.id}`,  // name
                tile.longitude, // POINT X
                tile.latitude, // POINT Y
                now, // inserted_at
                now, // updated_at
                null, // description
            ]);

            await client.query(
                `INSERT INTO tiles (id, borough_id, zone_id, postcode_area_id, name, location, inserted_at, updated_at, description) VALUES ${valuesClause}`,
                params
            );

            console.log(`Inserted ${tiles.length} tiles successfully.`);
        }

        // Regional aggregates table
        await client.query(`
            CREATE TABLE IF NOT EXISTS regional_aggregates (
                id SERIAL PRIMARY KEY,
                level VARCHAR(20) NOT NULL,
                region_id INT NOT NULL,
                aqi JSONB,
                category VARCHAR(50),            
                dominant_pollutant VARCHAR(50), 
                colour_code JSONB,               
                pm25_value DOUBLE PRECISION,
                pm10_value DOUBLE PRECISION,
                no2_value DOUBLE PRECISION,
                so2_value DOUBLE PRECISION,
                o3_value DOUBLE PRECISION,
                co_value DOUBLE PRECISION,
                last_30d_unhealthy_aqi_days JSONB,
                last_30d_aqi_mean JSONB,
                last_30d_aqi_max JSONB,
                last_30d_aqi_min JSONB,
                timestamp TIMESTAMP NOT NULL,
                update_timestamp TIMESTAMP NOT NULL,
                CONSTRAINT unique_level_region UNIQUE (level, timestamp, region_id)
            );
        `);

        // Add an index to improve query performance on level + region_id
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_regional_aggregates_level_region
            ON regional_aggregates(level, region_id);
        `);

        // Aggregate state table (tracks last processed timestamp)
        await client.query(`
            CREATE TABLE IF NOT EXISTS aggregate_state (
                id SERIAL PRIMARY KEY,
                level VARCHAR(20) NOT NULL,
                last_processed_timestamp TIMESTAMP NOT NULL,
                UNIQUE(level)
            );
        `);

        // Index on aggregate_state
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_aggregate_state_level
            ON aggregate_state(level);
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
