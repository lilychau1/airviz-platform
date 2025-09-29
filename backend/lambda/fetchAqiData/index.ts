import { APIGatewayProxyEventV2 } from "aws-lambda";
import { Client } from "pg";
import { getSecret } from "/opt/nodejs/utils";

interface Input {
    level: "tile" | "borough";
    id: number;
    selectedPeriod: {
        start: string;
        end: string;
    };
}

export const handler = async (event: APIGatewayProxyEventV2) => {
    let client: Client | undefined;

    try {
        const input: Input = JSON.parse(event.body || "{}");

        if (!input.level || !input.id || !input.selectedPeriod?.start || !input.selectedPeriod?.end) {
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

        if (input.level === "tile") {
            query = `
                SELECT 
                    tile_id AS id,
                    timestamp,
                    index_type,
                    value
                FROM air_quality_index
                WHERE tile_id = $1
                  AND timestamp BETWEEN $2 AND $3
                ORDER BY index_type, timestamp ASC;
            `;
            params = [input.id, input.selectedPeriod.start, input.selectedPeriod.end];
        } else {
            query = `
                SELECT 
                    region_id AS id,
                    timestamp,
                    index_type,
                    value
                FROM regional_aggregates
                CROSS JOIN LATERAL jsonb_each_text(aqi) AS aqi(index_type, value)
                WHERE level = $1
                  AND region_id = $2
                  AND timestamp BETWEEN $3 AND $4
                ORDER BY index_type, timestamp ASC;
            `;
            params = [input.level, input.id, input.selectedPeriod.start, input.selectedPeriod.end];
        }

        const res = await client.query(query, params);

        // Group by index_type
        const grouped: Record<string, { timestamp: string; value: number }[]> = {};
        for (const row of res.rows) {
            const type = row.index_type;
            if (!grouped[type]) grouped[type] = [];
            grouped[type].push({
                timestamp: row.timestamp,
                value: parseFloat(row.value),
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                level: input.level,
                id: input.id,
                records: grouped, // grouped by index_type
            }),
        };
    } catch (err) {
        console.error("Error fetching AQI data:", err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: (err as Error).message }),
        };
    } finally {
        if (client) await client.end();
    }
};
