import { Client } from "pg";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { getSecret } from '/opt/nodejs/utils';

// Interfaces
export interface Colour {
    red: number;
    green: number;
    blue: number;
}

export interface FetchAllRegionsInput {
    level: "tile" | "borough";
    currentLongitude: number;
    currentLatitude: number;
    radius: number; // in km
    timestamp: number;
}

export interface RegionRow {
    id: number;
    longitude: number;
    latitude: number;
    colour_code: Colour | null;
}

export interface RegionRecord {
    id: number;
    longitude: number;
    latitude: number;
    currentAqiColour: Colour | null;
}

const levelTableMap: Record<string, string> = {
    tile: 'tiles',
    borough: 'boroughs',
    // to add later: postcode_area, zone
};

// Haversine formula (returns distance in km)
// https://stackoverflow.com/questions/14560999/using-the-haversine-formula-in-javascript
function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export const handler = async (event: APIGatewayProxyEventV2) => {
    let client: Client | undefined;

    // Parse the event body into json input for later use
    const input: FetchAllRegionsInput = JSON.parse(event.body || "{}");

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

        // Pick the table to query from based on "level" parameter
        const table = levelTableMap[input.level];
        if (!table) throw new Error(`Unsupported level: ${input.level}`);

        // Get all tiles/boroughs with latitude and longitude
        const res = await client.query(`
            SELECT id, location[0] AS longitude, location[1] AS latitude
            FROM ${table};
        `);

        // Filter by radius in TypeScript
        const nearby = res.rows.filter((row: RegionRow) => {
            const dist = haversineDistance(
                input.currentLatitude,
                input.currentLongitude,
                row.latitude,
                row.longitude
            );
            return dist <= input.radius;
        });

        if (nearby.length === 0) {
            return { regions: [] };
        }

        const ids = nearby.map((r: RegionRow) => r.id);

        // Query latest AQI for those ids
        const query = `
            WITH latest_records AS (
                SELECT DISTINCT ON (tile_id) id, tile_id
                FROM aq_records
                WHERE tile_id = ANY($1::int[])
                ORDER BY tile_id, timestamp DESC, ingestion_timestamp DESC
            )
            SELECT t.id, t.location[0] AS longitude, t.location[1] AS latitude,
                   aqi.colour_code
            FROM ${table} t
            LEFT JOIN latest_records ar ON t.id = ar.tile_id
            LEFT JOIN air_quality_index aqi ON aqi.record_id = ar.id
            WHERE t.id = ANY($1::int[]);
        `;

        const latestRes = await client.query(query, [ids]);

        const records: RegionRecord[] = latestRes.rows.map((row: RegionRow) => ({
            id: row.id,
            longitude: row.longitude,
            latitude: row.latitude,
            currentAqiColour: row.colour_code
                ? (row.colour_code as Colour)
                : null,
        }));

        return { regions: records };
    } catch (error) {
        console.error("Error in fetchAllRegions:", error);
        return { error: (error as Error).message };
    } finally {
        if (client) await client.end();
    }
};
