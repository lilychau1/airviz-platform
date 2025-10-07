import { Client } from "pg";
import { APIGatewayProxyEventV2 } from "aws-lambda";
import { getSecret } from '/opt/nodejs/utils';

// Types
type RegionLevel = "tile" | "borough";

interface RegionDetails {
    id: number; 
    name: string;
    longitude: number;
    latitude: number; 
    region: string; 
    description: string;
}

interface TileDetails extends RegionDetails{
    boroughRegion: string;
}

type DetailsReturnTypeForRegionLevel<L extends RegionLevel> = 
    L extends 'tile' ? TileDetails: 
    L extends 'borough' ? RegionDetails: 
    never; 

interface FetchDetailsInput {
    id: number;
    level: RegionLevel;
}


export const handler = async (event: APIGatewayProxyEventV2) => {
    let client: Client | undefined;

    try {
        const input: FetchDetailsInput = JSON.parse(event.body || "{}");
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
        query = `
            SELECT 
            t.id, 
            t.name, 
            t.location[0] AS longitude, 
            t.location[1] AS latitude,
            ${level === "tile" ? 'b' : "t"}.region, 
            ${level === "tile" ? 'b.name AS "borough_region",' : ""}
            ${level === "tile" ? 'b' : "t"}.description
            FROM ${level === "tile" ? "tiles t LEFT JOIN boroughs b ON t.borough_id = b.id" : `${level}s t`}
            WHERE t.id = $1;
        `;

        const res = await client.query(query, params);
        if (res.rows.length === 0) {
            return { error: `No data found for ${level} with id=${input.id}` };
        }
        const row = res.rows[0];
        const details: DetailsReturnTypeForRegionLevel<typeof level> = {
            id: row.id,
            name: row.name,
            longitude: row.longitude,
            latitude: row.latitude,
            region: row.region,
            description: row.description,
            ...(level === "tile" ? { boroughRegion: row.borough_region } : {})
        } as DetailsReturnTypeForRegionLevel<typeof level>;
        return details;
    } catch (err) {
        console.error("Error in fetchPopupInformation:", err);
        return { error: (err as Error).message };
    } finally {
        if (client) await client.end();
    }
};
