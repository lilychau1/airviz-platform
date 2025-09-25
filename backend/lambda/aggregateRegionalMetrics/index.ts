import { Client } from "pg";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { APIGatewayProxyEventV2 } from 'aws-lambda';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretId: string) {
    const data = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: secretId })
    );
    return JSON.parse(data.SecretString || "{}");
}

export interface AggregateRegionalMetricsInput {
    level: "borough"; // To be extended later
}

export const handler = async (event: APIGatewayProxyEventV2) => {
    let client: Client | undefined;

    const input: AggregateRegionalMetricsInput = JSON.parse(event.body || "{}");
    const level = input.level; 

    try {
        const dbCreds = await getSecret(process.env.DB_SECRET_ARN!);
        client = new Client({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password,
            database: process.env.DB_NAME,
            port: parseInt(dbCreds.port, 10),
            ssl: { rejectUnauthorized: false },
        });
        await client.connect();

        // Get last processed timestamp from aggregate_state
        const stateRes = await client.query(
            `SELECT last_processed_timestamp FROM aggregate_state WHERE level = $1 FOR UPDATE`,
            [level]
        );

        let lastProcessed: string;
        if (stateRes.rows.length === 0) {
            // First run fallback
            lastProcessed = new Date(0).toISOString();
            await client.query(
                `INSERT INTO aggregate_state(level, last_processed_timestamp) VALUES ($1, $2)`,
                [level, lastProcessed]
            );
        } else {
            lastProcessed = stateRes.rows[0].last_processed_timestamp;
        }

        // Aggregate all new tile data per borough
        const aggregationQuery = `
            WITH new_records AS (
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
            ),
            expanded AS (
                SELECT
                    nr.region_id,
                    kv.key,
                    kv.value::numeric AS value,
                    nr.pm25_value,
                    nr.pm10_value,
                    nr.no2_value,
                    nr.so2_value,
                    nr.o3_value,
                    nr.co_value,
                    nr.timestamp
                FROM new_records nr
                JOIN LATERAL jsonb_each_text(nr.aqi_json) AS kv(key, value) ON TRUE
            ),
            aggregated AS (
                SELECT
                    region_id,
                    jsonb_object_agg(key, value) AS aqi,
                    AVG(pm25_value) AS pm25_value,
                    AVG(pm10_value) AS pm10_value,
                    AVG(no2_value) AS no2_value,
                    AVG(so2_value) AS so2_value,
                    AVG(o3_value) AS o3_value,
                    AVG(co_value) AS co_value,
                    MIN(timestamp) AS timestamp
                FROM expanded
                GROUP BY region_id
            )
            INSERT INTO regional_aggregates(
                level, region_id, aqi, pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value, timestamp, update_timestamp
            )
            SELECT
                $2, region_id, aqi, pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value, timestamp, NOW()
            FROM aggregated
            RETURNING region_id, timestamp;
        `;

        const aggRes = await client.query(aggregationQuery, [lastProcessed, level]);

        // Update last_processed_timestamp in aggregate_state
        if (aggRes.rows.length > 0) {
            const maxTimestamp = aggRes.rows.reduce((max, row) => {
                const ts = new Date(row.timestamp).getTime();
                return ts > max ? ts : max;
            }, 0);

            await client.query(
                `UPDATE aggregate_state SET last_processed_timestamp = $1 WHERE level = $2`,
                [new Date(maxTimestamp).toISOString(), level]
            );
        }

        return { message: "Aggregation completed", aggregatedCount: aggRes.rows.length };

    } catch (err) {
        console.error(err);
        return { error: (err as Error).message };
    } finally {
        if (client) await client.end();
    }
};