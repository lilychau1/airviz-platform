import { Client } from "pg";
import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getSecret } from '/opt/nodejs/utils';

export interface AggregateRegionalMetricsInput {
    level: "borough"; // Extendable later
}

export const handler = async (event: APIGatewayProxyEventV2) => {
    let client: Client | undefined;

    try {
        const input: AggregateRegionalMetricsInput = JSON.parse(event.body || "{}");
        const level = input.level;

        const dbCreds = await getSecret(process.env.DB_SECRET_ARN!);
        if (typeof dbCreds === "string") throw new Error("Expected DB secret to be JSON object");

        client = new Client({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password,
            database: process.env.DB_NAME,
            port: parseInt(dbCreds.port, 10),
            ssl: { rejectUnauthorized: false },
        });
        await client.connect();

        // Get last processed timestamp
        const stateRes = await client.query(
            `SELECT last_processed_timestamp FROM aggregate_state WHERE level = $1 FOR UPDATE`,
            [level]
        );

        let lastProcessed = stateRes.rows.length === 0
            ? new Date(0).toISOString()
            : stateRes.rows[0].last_processed_timestamp;

        if (stateRes.rows.length === 0) {
            await client.query(
                `INSERT INTO aggregate_state(level, last_processed_timestamp) VALUES ($1, $2)`,
                [level, lastProcessed]
            );
        }

        // SQL aggregation handles most computations
        const aggregationQuery = `
            WITH latest_records AS (
                SELECT DISTINCT ON (t.borough_id) 
                    t.borough_id AS region_id,
                    ar.id AS record_id,
                    ar.timestamp
                FROM tiles t
                JOIN aq_records ar ON ar.tile_id = t.id
                WHERE ar.timestamp > $1
                ORDER BY t.borough_id, ar.timestamp DESC
            )
            SELECT
                lr.region_id,
                jsonb_object_agg(aqi.index_type, aqi.value) AS aqi,
                mode() WITHIN GROUP (ORDER BY aqi.category) AS category,
                mode() WITHIN GROUP (ORDER BY aqi.dominant_pollutant) AS dominant_pollutant,
                jsonb_build_object(
                    'red', AVG((aqi.colour_code->>'red')::numeric),
                    'green', AVG((aqi.colour_code->>'green')::numeric),
                    'blue', AVG((aqi.colour_code->>'blue')::numeric)
                ) AS colour_code,
                AVG(p.pm25_value) AS pm25_value,
                AVG(p.pm10_value) AS pm10_value,
                AVG(p.no2_value) AS no2_value,
                AVG(p.so2_value) AS so2_value,
                AVG(p.o3_value) AS o3_value,
                AVG(p.co_value) AS co_value,
                MAX(lr.timestamp) AS timestamp
            FROM latest_records lr
            JOIN air_quality_index aqi ON aqi.record_id = lr.record_id
            JOIN pollutant_concentration p ON p.record_id = lr.record_id
            GROUP BY lr.region_id
        `;

        const res = await client.query(aggregationQuery, [lastProcessed]);
        const finalAggregates = res.rows;

        // Insert/update regional_aggregates table
        for (const agg of finalAggregates) {
            await client.query(`
                INSERT INTO regional_aggregates(
                    level, region_id, aqi, category, dominant_pollutant, colour_code,
                    pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value,
                    timestamp, update_timestamp
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()
                )
                ON CONFLICT (level, region_id) DO UPDATE SET
                    aqi = EXCLUDED.aqi,
                    category = EXCLUDED.category,
                    dominant_pollutant = EXCLUDED.dominant_pollutant,
                    colour_code = EXCLUDED.colour_code,
                    pm25_value = EXCLUDED.pm25_value,
                    pm10_value = EXCLUDED.pm10_value,
                    no2_value = EXCLUDED.no2_value,
                    so2_value = EXCLUDED.so2_value,
                    o3_value = EXCLUDED.o3_value,
                    co_value = EXCLUDED.co_value,
                    timestamp = EXCLUDED.timestamp,
                    update_timestamp = NOW()
            `, [
                level,
                agg.region_id,
                JSON.stringify(agg.aqi),
                agg.category,
                agg.dominant_pollutant,
                JSON.stringify({ red: agg.avg_red, green: agg.avg_green, blue: agg.avg_blue }),
                agg.pm25_value,
                agg.pm10_value,
                agg.no2_value,
                agg.so2_value,
                agg.o3_value,
                agg.co_value,
                agg.timestamp
            ]);
        }

        // Update last_processed_timestamp
        if (finalAggregates.length > 0) {
            const maxTimestamp = new Date(Math.max(...finalAggregates.map(a => new Date(a.timestamp).getTime())));
            await client.query(
                `UPDATE aggregate_state SET last_processed_timestamp=$1 WHERE level=$2`,
                [maxTimestamp.toISOString(), level]
            );
        }

        return { message: "Aggregation completed", aggregatedCount: finalAggregates.length };

    } catch (err) {
        console.error(err);
        return { error: (err as Error).message };
    } finally {
        if (client) await client.end();
    }
};
