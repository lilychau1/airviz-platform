import { Client } from "pg";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { rateAqiDict, ratePollutant } from '/opt/nodejs/aqiBenchmark';
import { getSecret } from '/opt/nodejs/utils';

export type RegionLevel = "tile" | "borough";

export interface FetchCurrentAQInput {
    level: RegionLevel;
    id: number;
}

// Utility to safely parse JSON if possible
function safeParseJSON<T>(value: any): T | any {
    if (typeof value === "string") {
        try { 
            return JSON.parse(value); 
        } catch {
            return value; // return original string if not valid JSON
        }
    }
    return value;
}

export const handler = async (event: APIGatewayProxyEventV2) => {
    let client: Client | undefined;

    try {
        const input: FetchCurrentAQInput = JSON.parse(event.body || "{}");
        const level: RegionLevel = input.level;

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

        let query: string;
        const params = [input.id];

        if (level === "tile") {
            query = `
                SELECT 
                    ar.id AS record_id,
                    aqi_json.aqi,
                    aqi_json.category,
                    aqi_json.dominant_pollutant,
                    aqi_json.colour_code,
                    p.timestamp,
                    p.pm25_value, p.pm10_value, p.no2_value, p.so2_value, p.o3_value, p.co_value
                FROM tiles t
                JOIN LATERAL (
                    SELECT id
                    FROM aq_records
                    WHERE tile_id = t.id
                    ORDER BY timestamp DESC, ingestion_timestamp DESC
                    LIMIT 1
                ) ar ON TRUE
                LEFT JOIN LATERAL (
                    SELECT 
                        jsonb_object_agg(index_type, value) AS aqi,
                        jsonb_object_agg(index_type, category) AS category,
                        jsonb_object_agg(index_type, dominant_pollutant) AS dominant_pollutant,
                        jsonb_object_agg(index_type, colour_code) AS colour_code
                    FROM air_quality_index
                    WHERE record_id = ar.id
                ) aqi_json ON TRUE
                LEFT JOIN pollutant_concentration p ON p.record_id = ar.id
                WHERE t.id = $1;
            `;
        } else {
            query = `
                SELECT 
                    ra.aqi,
                    ra.category,
                    ra.dominant_pollutant,
                    ra.colour_code,
                    ra.pm25_value, ra.pm10_value, ra.no2_value, ra.so2_value, ra.o3_value, ra.co_value,
                    ra.timestamp
                FROM ${level}s r
                JOIN LATERAL (
                    SELECT *
                    FROM regional_aggregates
                    WHERE level = '${level}' AND region_id = r.id
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

        // Safe parsing
        const aqi: Record<string, number> | null = safeParseJSON(row.aqi) ?? null;
        const aqiCategory: Record<string, string> | string | null = safeParseJSON(row.category) ?? null;
        const dominantPollutant: Record<string, string> | string = safeParseJSON(row.dominant_pollutant ?? "unknown");
        const colourCode: Record<string, any> | null = safeParseJSON(row.colour_code) ?? null;

        // Pollutant records
        const pollutants = [
            { id: "pm25", value: row.pm25_value, unit: "microgram_per_cubic_meter" },
            { id: "pm10", value: row.pm10_value, unit: "microgram_per_cubic_meter" },
            { id: "no2", value: row.no2_value, unit: "ppb" },
            { id: "so2", value: row.so2_value, unit: "ppb" },
            { id: "o3", value: row.o3_value, unit: "ppb" },
            { id: "co", value: row.co_value, unit: "ppb" }
        ];

        const CurrentRecords = pollutants
            .filter(p => p.value !== null && p.value !== undefined)
            .map(p => ({
                pollutantId: p.id,
                timestamp: row.timestamp,
                value: p.value,
                unit: p.unit,
                level: ratePollutant(p.value, p.id)
            }));

        return {
            aqi,
            aqiCategory,
            dominantPollutant,
            colourCode,
            CurrentRecords
        };

    } catch (err) {
        return { error: (err as Error).message };
    } finally {
        if (client) await client.end();
    }
};
