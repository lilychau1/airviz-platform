import { Client } from "pg";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { getSecret } from "/opt/nodejs/utils";

export interface FetchHealthRecommendationInput {
    tileId: number;
}

function safeParseJSON<T>(value: any): T | any {
    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    return value;
}

export const handler = async (event: APIGatewayProxyEventV2) => {
    let client: Client | undefined;

    try {
        const input: FetchHealthRecommendationInput = JSON.parse(event.body || "{}");
        if (!input.tileId) {
            return { error: "Missing tileId in request body" };
        }

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

        const query = `
            SELECT recommendations
            FROM health_recommendation
            WHERE tile_id = $1
            ORDER BY timestamp DESC, ingestion_timestamp DESC
            LIMIT 1;
        `;

        const res = await client.query(query, [input.tileId]);
        if (res.rows.length === 0) {
            return { error: `No health recommendation found for tile_id=${input.tileId}` };
        }

        const recommendations = safeParseJSON(res.rows[0].recommendations);

        return {
            tileId: input.tileId,
            recommendations,
        };
    } catch (err) {
        return { error: (err as Error).message };
    } finally {
        if (client) await client.end();
    }
};
