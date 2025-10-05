import { APIGatewayProxyEventV2 } from "aws-lambda";
import { Client } from "pg";
import { getSecret } from "/opt/nodejs/utils";

interface Input {
    level: "tile" | "borough";
    id: number;
    selectedTimestampPeriod: {
        start: number; // UTC timestamp of period start
        end: number; // UTC timestamp of period end
    };
}

export const handler = async (event: APIGatewayProxyEventV2) => {
    let client: Client | undefined;

    try {
        const input: Input = JSON.parse(event.body || "{}");

        if (!input.level || !input.id || !input.selectedTimestampPeriod?.start || !input.selectedTimestampPeriod?.end) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing required parameters" }) };
        }

        // Fetch DB creds
        const dbCreds = await getSecret(process.env.DB_SECRET_ARN!);
        if (typeof dbCreds === "string") {
            throw new Error("Expected DB secret to be a JSON object");
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
        let params: any[];
        let selectedPeriodStart = new Date(input.selectedTimestampPeriod.start).toISOString();
        let selectedPeriodEnd = new Date(input.selectedTimestampPeriod.end).toISOString();
        
        if (input.level === "tile") {
            query = `
            SELECT tile_id AS id, timestamp,
                pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value
            FROM pollutant_concentration
            WHERE tile_id = $1
              AND timestamp BETWEEN $2 AND $3
            ORDER BY timestamp ASC;
            `;
            params = [
                input.id,
                selectedPeriodStart,
                selectedPeriodEnd
            ];
        } else {
            query = `
            SELECT region_id AS id, timestamp,
                pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value
            FROM regional_aggregates
            WHERE level = $1
              AND region_id = $2
              AND timestamp BETWEEN $3 AND $4
            ORDER BY timestamp ASC;
            `;
            params = [
                input.level,
                input.id,
                selectedPeriodStart,
                selectedPeriodEnd
            ];
        }

        const res = await client.query(query, params);

        return {
            statusCode: 200,
            body: JSON.stringify({
                level: input.level,
                id: input.id,
                records: res.rows,
            }),
        };
    } catch (err) {
        console.error("Error fetching pollutant data:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: (err as Error).message }),
        };
    } finally {
        if (client) await client.end();
    }
};
