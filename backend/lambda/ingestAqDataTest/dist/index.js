"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const pg_1 = require("pg");
const client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
const secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
async function getSecret(secretId) {
    const data = await secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretId }));
    return JSON.parse(data.SecretString || '{}');
}
const handler = async () => {
    let client;
    try {
        const secretId = process.env.DB_SECRET_ARN;
        const dbCreds = await getSecret(secretId);
        client = new pg_1.Client({
            host: dbCreds.host,
            user: dbCreds.username,
            password: dbCreds.password,
            database: process.env.DB_NAME,
            port: parseInt(dbCreds.port, 10),
            ssl: { rejectUnauthorized: false },
        });
        await client.connect();
        // Insert a single tile record (change as appropriate)
        const tileResult = await client.query(`INSERT INTO Tiles (boroughId, zoneId, postcodeAreaId, name, location, insertedAt, updatedAt, description)
       VALUES ($1, $2, $3, $4, POINT($5, $6), NOW(), NOW(), $7) RETURNING id`, [1, 1, 1, 'Test Tile', 37.42, -122.08, 'Test tile description']);
        const tileId = tileResult.rows[0].id;
        console.log(`Inserted Tile with id: ${tileId}`);
        // Insert a single AqRecord related to that tile
        const aqRecordResult = await client.query(`INSERT INTO AqRecords (tileId, timestamp, ingestionTimestamp)
       VALUES ($1, NOW(), NOW()) RETURNING id`, [tileId]);
        const recordId = aqRecordResult.rows[0].id;
        console.log(`Inserted AqRecord with id: ${recordId}`);
        // Insert related PollutantConcentration
        await client.query(`INSERT INTO PollutantConcentration
       (recordId, tileId, timestamp, ingestionTimestamp, pm25Value, pm10Value, no2Value, so2Value, o3Value, coValue)
       VALUES ($1, $2, NOW(), NOW(), $3, $4, $5, $6, $7, $8)`, [recordId, tileId, 12.34, 56.78, 1.23, 4.56, 7.89, 0.12, 0.34]);
        console.log('Inserted PollutantConcentration');
        // Insert related AirQualityIndex
        await client.query(`INSERT INTO AirQualityIndex
       (recordId, tileId, indexType, category, colourCode, dominantPollutant, timestamp, ingestionTimestamp, value)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)`, [recordId, tileId, 'LOCAL_AQI', 'Good', JSON.stringify({ red: 0, green: 255, blue: 0, alpha: 1 }), 'pm25', 42]);
        console.log('Inserted AirQualityIndex');
        // Insert related HealthRecommendation
        await client.query(`INSERT INTO HealthRecommendation
       (recordId, tileId, timestamp, ingestionTimestamp, populationGroup, value)
       VALUES ($1, $2, NOW(), NOW(), $3, $4)`, [recordId, tileId, 'General Population', 'Air quality is good. No precautions needed.']);
        console.log('Inserted HealthRecommendation');
        await client.end();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Single full record inserted successfully.' }),
        };
    }
    catch (error) {
        if (client)
            await client.end();
        console.error('Insertion failed', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=index.js.map