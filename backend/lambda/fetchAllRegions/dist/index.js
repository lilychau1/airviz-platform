"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
async function getSecret(secretId) {
    const data = await secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretId }));
    return JSON.parse(data.SecretString || "{}");
}
const levelTableMap = {
    tile: 'tiles',
    borough: 'boroughs',
    // to add later: postcode_area, zone
};
// Haversine formula (returns distance in km)
// https://stackoverflow.com/questions/14560999/using-the-haversine-formula-in-javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
const handler = async (event) => {
    let client;
    try {
        const secretId = process.env.DB_SECRET_ARN;
        const dbCreds = await getSecret(secretId);
        client = new pg_1.Client({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password,
            database: process.env.DB_NAME,
            port: parseInt(dbCreds.port, 10),
            ssl: { rejectUnauthorized: false },
        });
        await client.connect();
        // Pick the table to query from based on "level" parameter
        const table = levelTableMap[event.level];
        if (!table)
            throw new Error(`Unsupported level: ${event.level}`);
        // Get all tiles/boroughs with latitude and longitude
        const res = await client.query(`
            SELECT id, location[0] AS longitude, location[1] AS latitude
            FROM ${table};
        `);
        // Filter by radius in TypeScript
        const nearby = res.rows.filter((row) => {
            const dist = haversineDistance(event.currentLatitude, event.currentLongitude, row.latitude, row.longitude);
            return dist <= event.radius;
        });
        if (nearby.length === 0) {
            return { regions: [] };
        }
        const ids = nearby.map((r) => r.id);
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
        const records = latestRes.rows.map((row) => ({
            id: row.id,
            longitude: row.longitude,
            latitude: row.latitude,
            currentAqiColour: row.colour_code
                ? row.colour_code
                : null,
        }));
        return { regions: records };
    }
    catch (error) {
        console.error("Error in fetchAllRegions:", error);
        return { error: error.message };
    }
    finally {
        if (client)
            await client.end();
    }
};
exports.handler = handler;
//# sourceMappingURL=index.js.map