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
// Rate DEFRA AQI into 1–3
function rateDefraAqi(aqi) {
    if (aqi === null)
        return null;
    if (aqi <= 66)
        return 1; // Low
    if (aqi <= 149)
        return 2; // Medium
    return 3; // High
}
// Predefined pollutant boundaries for 1–3 scale
function ratePollutant(value, boundaries) {
    if (value === null)
        return null;
    if (value <= boundaries[0])
        return 1;
    if (value <= boundaries[1])
        return 2;
    return 3;
}
const handler = async (event) => {
    let client;
    try {
        const input = JSON.parse(event.body || "{}");
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
        let query;
        const params = [input.id];
        if (input.level === "tile") {
            query = `
                SELECT t.id, t.name, 'Greater London' AS region, b.name AS "boroughRegion",
                       aqi.value AS "currentAqi",
                       p.pm25_value, p.pm10_value, p.no2_value, p.so2_value, p.o3_value, p.co_value
                FROM tiles t
                LEFT JOIN boroughs b ON t.borough_id = b.id
                LEFT JOIN LATERAL (
                    SELECT id
                    FROM aq_records
                    WHERE tile_id = t.id
                    ORDER BY timestamp DESC, ingestion_timestamp DESC
                    LIMIT 1
                ) ar ON TRUE
                LEFT JOIN air_quality_index aqi ON aqi.record_id = ar.id
                LEFT JOIN pollutant_concentration p ON p.record_id = ar.id
                WHERE t.id = $1;
            `;
        }
        else if (input.level === "borough") {
            query = `
                SELECT t.id, t.name, 'Greater London' AS region,
                       aqi.value AS "currentAqi",
                       p.pm25_value, p.pm10_value, p.no2_value, p.so2_value, p.o3_value, p.co_value,
                       ra.last_30d_unhealthy_aqi_days,
                       ra.last_30d_aqi_mean,
                       ra.last_30d_aqi_max,
                       ra.last_30d_aqi_min
                FROM boroughs t
                LEFT JOIN LATERAL (
                    SELECT id
                    FROM aq_records
                    WHERE borough_id = t.id
                    ORDER BY timestamp DESC, ingestion_timestamp DESC
                    LIMIT 1
                ) ar ON TRUE
                LEFT JOIN air_quality_index aqi ON aqi.record_id = ar.id
                LEFT JOIN pollutant_concentration p ON p.record_id = ar.id
                LEFT JOIN LATERAL (
                    SELECT region_id,
                           last_30d_unhealthy_aqi_days,
                           last_30d_aqi_mean,
                           last_30d_aqi_max,
                           last_30d_aqi_min
                    FROM regional_aggregates
                    WHERE level = 'borough' AND region_id = t.id
                    ORDER BY timestamp DESC, update_timestamp DESC
                    LIMIT 1
                ) ra ON TRUE
                WHERE t.id = $1;
            `;
        }
        else {
            throw new Error(`Unsupported level: ${input.level}`);
        }
        const res = await client.query(query, params);
        if (res.rows.length === 0) {
            return { error: `No data found for ${input.level} with id=${input.id}` };
        }
        const row = res.rows[0];
        // Categorize pollutants into 1–3 levels
        const currentAqiCategoryLevel = rateDefraAqi(row.currentAqi);
        const currentPm25Level = ratePollutant(row.pm25_value, [15, 35]);
        const currentPm10Level = ratePollutant(row.pm10_value, [30, 60]);
        const currentNo2Level = ratePollutant(row.no2_value, [40, 90]);
        const currentO3Level = ratePollutant(row.o3_value, [50, 100]);
        const currentSo2Level = ratePollutant(row.so2_value, [20, 80]);
        const currentCoLevel = ratePollutant(row.co_value, [4, 10]);
        if (input.level === "tile") {
            const result = {
                id: row.id,
                name: row.name,
                region: row.region,
                boroughRegion: row.boroughRegion,
                currentAqi: row.currentAqi,
                currentAqiCategoryLevel,
                currentPm25Level,
                currentPm10Level,
                currentNo2Level,
                currentO3Level,
                currentSo2Level,
                currentCoLevel,
            };
            return result;
        }
        else {
            const result = {
                id: row.id,
                name: row.name,
                region: row.region,
                currentAqi: row.currentAqi,
                currentAqiCategoryLevel,
                currentPm25Level,
                currentPm10Level,
                currentNo2Level,
                currentO3Level,
                currentSo2Level,
                currentCoLevel,
                last30dUnhealthyAQIDays: row.last_30d_unhealthy_aqi_days,
                last30dAQIMean: row.last_30d_aqi_mean,
                last30dAQIMax: row.last_30d_aqi_max,
                last30dAQIMin: row.last_30d_aqi_min,
            };
            return result;
        }
    }
    catch (err) {
        console.error("Error in fetchPopupInformation:", err);
        return { error: err.message };
    }
    finally {
        if (client)
            await client.end();
    }
};
exports.handler = handler;
//# sourceMappingURL=index.js.map