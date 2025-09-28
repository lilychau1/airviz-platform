"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const aqiBenchmark_1 = require("/opt/nodejs/aqiBenchmark");
const utils_1 = require("/opt/nodejs/utils");
const handler = async (event) => {
    let client;
    const input = JSON.parse(event.body || "{}");
    const level = input.level;
    try {
        const dbCreds = await (0, utils_1.getSecret)(process.env.DB_SECRET_ARN);
        client = new pg_1.Client({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password,
            database: process.env.DB_NAME,
            port: parseInt(dbCreds.port, 10),
            ssl: { rejectUnauthorized: false },
        });
        await client.connect();
        // Get last processed timestamp
        const stateRes = await client.query(`SELECT last_processed_timestamp FROM aggregate_state WHERE level = $1 FOR UPDATE`, [level]);
        let lastProcessed;
        if (stateRes.rows.length === 0) {
            lastProcessed = new Date(0).toISOString();
            await client.query(`INSERT INTO aggregate_state(level, last_processed_timestamp) VALUES ($1, $2)`, [level, lastProcessed]);
        }
        else {
            lastProcessed = stateRes.rows[0].last_processed_timestamp;
        }
        // Fetch new records for aggregation
        const recordsRes = await client.query(`
            SELECT
                t.borough_id AS region_id,
                jsonb_object_agg(aqi.index_type, aqi.value) AS aqi_json,
                p.pm25_value, p.pm10_value, p.no2_value, p.so2_value, p.o3_value, p.co_value,
                ar.timestamp
            FROM tiles t
            JOIN aq_records ar ON t.id = ar.tile_id
            JOIN air_quality_index aqi ON aqi.record_id = ar.id
            JOIN pollutant_concentration p ON p.record_id = ar.id
            WHERE ar.timestamp > $1
            GROUP BY t.borough_id, ar.timestamp, p.pm25_value, p.pm10_value, p.no2_value, p.so2_value, p.o3_value, p.co_value
        `, [lastProcessed]);
        // Group by region_id
        const aggregatesMap = {};
        const now = new Date();
        const THIRTY_DAYS_AGO = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        for (const row of recordsRes.rows) {
            const regionId = row.region_id;
            const aqi = row.aqi_json;
            const timestamp = new Date(row.timestamp);
            if (!aggregatesMap[regionId])
                aggregatesMap[regionId] = [];
            aggregatesMap[regionId].push({
                region_id: regionId,
                aqi,
                pm25_value: row.pm25_value,
                pm10_value: row.pm10_value,
                no2_value: row.no2_value,
                so2_value: row.so2_value,
                o3_value: row.o3_value,
                co_value: row.co_value,
                timestamp: row.timestamp,
                last30dUnhealthyAQIDays: null,
                last30dAQIMean: null,
                last30dAQIMax: null,
                last30dAQIMin: null,
            });
        }
        const finalAggregates = [];
        for (const [regionIdStr, records] of Object.entries(aggregatesMap)) {
            const regionId = parseInt(regionIdStr, 10);
            // Compute "current" values (most recent record)
            records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            const latest = records[0];
            // Compute 30-day metrics per index type
            const last30dRecords = records.filter(r => new Date(r.timestamp) >= THIRTY_DAYS_AGO);
            const indexTypes = new Set();
            last30dRecords.forEach(r => Object.keys(r.aqi).forEach(k => indexTypes.add(k)));
            const last30dUnhealthyAQIDays = {};
            const last30dAQIMean = {};
            const last30dAQIMax = {};
            const last30dAQIMin = {};
            indexTypes.forEach(indexType => {
                const values = last30dRecords.map(r => r.aqi[indexType]).filter(v => v != null);
                if (values.length === 0)
                    return;
                last30dAQIMean[indexType] = values.reduce((sum, v) => sum + v, 0) / values.length;
                last30dAQIMax[indexType] = Math.max(...values);
                last30dAQIMin[indexType] = Math.min(...values);
                // count "unhealthy" days using rateAqiDict
                last30dUnhealthyAQIDays[indexType] = values
                    .map(v => (0, aqiBenchmark_1.rateAqiDict)({ [indexType]: v })[indexType]) // !! because rateAqiDict returns Record<string, number | null>
                    .reduce((sum, level) => sum >= 1 ? sum + 1 : sum, 0);
            });
            finalAggregates.push({
                ...latest,
                last30dUnhealthyAQIDays,
                last30dAQIMean,
                last30dAQIMax,
                last30dAQIMin,
            });
        }
        // Insert/update regional_aggregates
        for (const agg of finalAggregates) {
            await client.query(`
                INSERT INTO regional_aggregates(
                    level, region_id, aqi, pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value, timestamp, update_timestamp,
                    last_30d_unhealthy_aqi_days, last_30d_aqi_mean, last_30d_aqi_max, last_30d_aqi_min
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11,$12,$13,$14)
                ON CONFLICT (level, region_id) DO UPDATE SET
                    aqi = EXCLUDED.aqi,
                    pm25_value = EXCLUDED.pm25_value,
                    pm10_value = EXCLUDED.pm10_value,
                    no2_value = EXCLUDED.no2_value,
                    so2_value = EXCLUDED.so2_value,
                    o3_value = EXCLUDED.o3_value,
                    co_value = EXCLUDED.co_value,
                    timestamp = EXCLUDED.timestamp,
                    update_timestamp = NOW(),
                    last_30d_unhealthy_aqi_days = EXCLUDED.last_30d_unhealthy_aqi_days,
                    last_30d_aqi_mean = EXCLUDED.last_30d_aqi_mean,
                    last_30d_aqi_max = EXCLUDED.last_30d_aqi_max,
                    last_30d_aqi_min = EXCLUDED.last_30d_aqi_min
            `, [
                level, agg.region_id, agg.aqi, agg.pm25_value, agg.pm10_value, agg.no2_value, agg.so2_value,
                agg.o3_value, agg.co_value, agg.timestamp,
                agg.last30dUnhealthyAQIDays,
                agg.last30dAQIMean,
                agg.last30dAQIMax,
                agg.last30dAQIMin
            ]);
        }
        // Update last_processed_timestamp
        if (recordsRes.rows.length > 0) {
            const maxTimestamp = recordsRes.rows.reduce((max, row) => {
                const ts = new Date(row.timestamp).getTime();
                return ts > max ? ts : max;
            }, 0);
            await client.query(`UPDATE aggregate_state SET last_processed_timestamp=$1 WHERE level=$2`, [new Date(maxTimestamp).toISOString(), level]);
        }
        return { message: "Aggregation completed", aggregatedCount: finalAggregates.length };
    }
    catch (err) {
        console.error(err);
        return { error: err.message };
    }
    finally {
        if (client)
            await client.end();
    }
};
exports.handler = handler;
