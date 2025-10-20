import { Client } from "pg";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { rateAqiDict, ratePollutant } from '/opt/nodejs/aqiBenchmark';
import { getSecret } from '/opt/nodejs/utils';

// Types
export type RegionLevel = "tile" | "borough";

export interface FetchPopupInput {
    level: RegionLevel;
    id: number;
    timestamp?: number;
}

export interface TilePopupInformation {
    id: number;
    name: string;
    region: string;
    boroughRegion: string | null;
    currentAqi: Record<string, number> | null;
    currentAqiCategoryLevel: Record<string, number | null> | null;
    currentPm25Level: number | null;
    currentPm10Level: number | null;
    currentNo2Level: number | null;
    currentO3Level: number | null;
    currentSo2Level: number | null;
    currentCoLevel: number | null;
}

export interface RegionPopupInformation {
    id: number;
    name: string;
    region: string;
    currentAqi: Record<string, number> | null;
    currentAqiCategoryLevel: Record<string, number | null> | null;
    currentPm25Level: number | null;
    currentPm10Level: number | null;
    currentNo2Level: number | null;
    currentO3Level: number | null;
    currentSo2Level: number | null;
    currentCoLevel: number | null;
    last30dUnhealthyAQIDays: number | null;
    last30dAQIMean: number | null;
    last30dAQIMax: number | null;
    last30dAQIMin: number | null;
}

export const handler = async (event: APIGatewayProxyEventV2) => {
    let client: Client | undefined;

    try {
        const input: FetchPopupInput = JSON.parse(event.body || "{}");
        const level: RegionLevel = input.level;
        // Compute the timestamp to use for the query
        let lastFullHour: Date;

        const inputTime = input.timestamp ? new Date(Number(input.timestamp)) : new Date();

        // Check if the input timestamp is already at the start of an hour
        const isExactHour = inputTime.getUTCMinutes() === 0 && inputTime.getUTCSeconds() === 0 && inputTime.getUTCMilliseconds() === 0;

        if (isExactHour) {
            lastFullHour = inputTime;
        } else {
            // Round down to the last full hour
            lastFullHour = new Date(inputTime);
            lastFullHour.setUTCMinutes(0, 0, 0);
        }

        console.log('Input timestamp:', inputTime.toISOString());
        console.log('Query timestamp (last full hour):', lastFullHour.toISOString());

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

        const params = [input.id, lastFullHour]; 

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
                    AND timestamp <= $2
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
        } else {
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
                    SELECT *
                    FROM regional_aggregates
                    WHERE level = '${level}' 
                    AND region_id = r.id
                    AND timestamp <= $2
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
        const currentAqi: Record<string, number> | null = row.currentAqi
            ? typeof row.currentAqi === "string"
                ? JSON.parse(row.currentAqi)
                : row.currentAqi
            : null;

        const currentAqiCategoryLevel = rateAqiDict(currentAqi);

        // Pollutant levels
        const currentPm25Level = ratePollutant(row.pm25_value, "pm25");
        const currentPm10Level = ratePollutant(row.pm10_value, "pm10");
        const currentNo2Level = ratePollutant(row.no2_value, "no2");
        const currentO3Level = ratePollutant(row.o3_value, "o3");
        const currentSo2Level = ratePollutant(row.so2_value, "so2");
        const currentCoLevel = ratePollutant(row.co_value, "co");

        if (level === "tile") {
            const result: TilePopupInformation = {
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
        } else {
            const result: RegionPopupInformation = {
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
    } catch (err) {
        console.error("Error in fetchPopupInformation:", err);
        return { error: (err as Error).message };
    } finally {
        if (client) await client.end();
    }
};
