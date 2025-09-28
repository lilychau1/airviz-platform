"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const aqiBenchmark_1 = require("/opt/nodejs/aqiBenchmark");
const utils_1 = require("/opt/nodejs/utils");
const handler = async (event) => {
    let client;
    try {
        const input = JSON.parse(event.body || "{}");
        const level = input.level;
        const secretId = process.env.DB_SECRET_ARN;
        const dbCreds = await (0, utils_1.getSecret)(secretId);
        if (typeof dbCreds === "string") {
            throw new Error("Expected DB secret to be a JSON object, got string instead");
        }
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
        if (level === "tile") {
            query = `
                SELECT 
                    t.id, 
                    t.name, 
                    'Greater London' AS region, 
                    b.name AS "boroughRegion",
                    aqi_json.aqi AS "currentAqi",
                    p.pm25_value, 
                    p.pm10_value, 
                    p.no2_value, 
                    p.so2_value, 
                    p.o3_value, 
                    p.co_value
                FROM tiles t
                LEFT JOIN boroughs b ON t.borough_id = b.id
                LEFT JOIN LATERAL (
                    SELECT id
                    FROM aq_records
                    WHERE tile_id = t.id
                    ORDER BY timestamp DESC, ingestion_timestamp DESC
                    LIMIT 1
                ) ar ON TRUE
                LEFT JOIN LATERAL (
                    SELECT jsonb_object_agg(index_type, value) AS aqi
                    FROM air_quality_index
                    WHERE record_id = ar.id
                ) aqi_json ON TRUE
                LEFT JOIN pollutant_concentration p ON p.record_id = ar.id
                WHERE t.id = $1;
            `;
        }
        else {
            query = `
                SELECT 
                    r.id, 
                    r.name, 
                    'Greater London' AS region,
                    ra.aqi AS "currentAqi",
                    ra.pm25_value, 
                    ra.pm10_value, 
                    ra.no2_value, 
                    ra.so2_value, 
                    ra.o3_value, 
                    ra.co_value,
                    ra.last_30d_unhealthy_aqi_days,
                    ra.last_30d_aqi_mean,
                    ra.last_30d_aqi_max,
                    ra.last_30d_aqi_min
                FROM ${level}s r
                LEFT JOIN LATERAL (
                    SELECT 
                        region_id,
                        aqi, 
                        pm25_value, 
                        pm10_value, 
                        no2_value, 
                        so2_value, 
                        o3_value, 
                        co_value,
                        last_30d_unhealthy_aqi_days,
                        last_30d_aqi_mean,
                        last_30d_aqi_max,
                        last_30d_aqi_min
                    FROM regional_aggregates
                    WHERE 
                        level = '${level}' AND region_id = r.id
                    ORDER BY timestamp DESC, update_timestamp DESC
                    LIMIT 1
                ) ra ON TRUE
                WHERE r.id = $1;
            `;
        }
        const res = await client.query(query, params);
        if (res.rows.length === 0) {
            return { error: `No data found for ${level} with id=${input.id}` };
        }
        const row = res.rows[0];
        // Parse currentAqi JSON if necessary
        const currentAqi = row.currentAqi
            ? typeof row.currentAqi === "string"
                ? JSON.parse(row.currentAqi)
                : row.currentAqi
            : null;
        const currentAqiCategoryLevel = (0, aqiBenchmark_1.rateAqiDict)(currentAqi);
        // Pollutant levels
        const currentPm25Level = (0, aqiBenchmark_1.ratePollutant)(row.pm25_value, "pm25");
        const currentPm10Level = (0, aqiBenchmark_1.ratePollutant)(row.pm10_value, "pm10");
        const currentNo2Level = (0, aqiBenchmark_1.ratePollutant)(row.no2_value, "no2");
        const currentO3Level = (0, aqiBenchmark_1.ratePollutant)(row.o3_value, "o3");
        const currentSo2Level = (0, aqiBenchmark_1.ratePollutant)(row.so2_value, "so2");
        const currentCoLevel = (0, aqiBenchmark_1.ratePollutant)(row.co_value, "co");
        if (level === "tile") {
            const result = {
                id: row.id,
                name: row.name,
                region: row.region,
                boroughRegion: row.boroughRegion,
                currentAqi,
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
                currentAqi,
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
