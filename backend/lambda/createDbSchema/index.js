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
            database: 'airquality',
            port: parseInt(dbCreds.port, 10),
            ssl: { rejectUnauthorized: false },
        });
        await client.connect();
        // Schema creation: tables based on your design
        await client.query(`
      CREATE TABLE IF NOT EXISTS AqiRecords (
        id SERIAL PRIMARY KEY,
        tileId VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        ingestionTimestamp TIMESTAMP NOT NULL
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS PollutantConcentration (
        id SERIAL PRIMARY KEY,
        recordId INT REFERENCES AqiRecords(id),
        tileId VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        ingestionTimestamp TIMESTAMP NOT NULL,
        pm25Value DOUBLE PRECISION,
        pm10Value DOUBLE PRECISION,
        no2Value DOUBLE PRECISION,
        so2Value DOUBLE PRECISION,
        o3Value DOUBLE PRECISION,
        coValue DOUBLE PRECISION
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS AirQualityIndex (
        id SERIAL PRIMARY KEY,
        recordId INT REFERENCES AqiRecords(id),
        tileId VARCHAR(255) NOT NULL,
        indexType VARCHAR(20),
        category TEXT,
        colourCode JSONB,
        dominantPollutant VARCHAR(50),
        timestamp TIMESTAMP NOT NULL,
        ingestionTimestamp TIMESTAMP NOT NULL,
        value INT
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS HealthRecommendation (
        id SERIAL PRIMARY KEY,
        recordId INT REFERENCES AqiRecords(id),
        tileId VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        ingestionTimestamp TIMESTAMP NOT NULL,
        populationGroup VARCHAR(50),
        value TEXT
      );
    `);
        await client.end();
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Schema setup completed successfully' }),
        };
    }
    catch (error) {
        if (client)
            await client.end();
        console.error('Schema migration failed', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=index.js.map