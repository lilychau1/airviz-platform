import { Client } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

async function getSecret(secretId: string) {
  const data = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretId }));
  return JSON.parse(data.SecretString || '{}');
}

export const handler = async () => {
  let client: Client | undefined;
  try {
    const secretId = process.env.DB_SECRET_ARN!;
    const dbCreds = await getSecret(secretId);

    client = new Client({
      host: dbCreds.host,
      user: dbCreds.username,
      password: dbCreds.password,
      database: process.env.DB_NAME, 
      port: parseInt(dbCreds.port, 10),
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();

    // Schema creation: tables based on your design

    await client.query(`
      CREATE TABLE IF NOT EXISTS Boroughs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL, 
        location POINT NOT NULL, 
        insertedAt TIMESTAMP NOT NULL, 
        updatedAt TIMESTAMP NOT NULL, 
        description TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS Zones (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL, 
        location POINT NOT NULL, 
        insertedAt TIMESTAMP NOT NULL, 
        updatedAt TIMESTAMP NOT NULL, 
        description TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS PostcodeAreas (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL, 
        location POINT NOT NULL, 
        insertedAt TIMESTAMP NOT NULL, 
        updatedAt TIMESTAMP NOT NULL, 
        description TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS Tiles (
        id SERIAL PRIMARY KEY,
        boroughId INT REFERENCES Boroughs(id), 
        zoneId INT REFERENCES Zones(id), 
        postcodeAreaId INT REFERENCES postcodeAreas(id), 
        name VARCHAR(255) NOT NULL, 
        location POINT NOT NULL, 
        insertedAt TIMESTAMP NOT NULL, 
        updatedAt TIMESTAMP NOT NULL, 
        description TEXT
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS AqiRecords (
        id SERIAL PRIMARY KEY,
        tileId INT NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        ingestionTimestamp TIMESTAMP NOT NULL
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS PollutantConcentration (
        id SERIAL PRIMARY KEY,
        recordId INT REFERENCES AqiRecords(id),
        tileId INT REFERENCES Tiles(id),
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
        tileId INT REFERENCES Tiles(id),
        indexType VARCHAR(20) NOT NULL,
        category TEXT NOT NULL,
        colourCode JSONB NOT NULL,
        dominantPollutant VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        ingestionTimestamp TIMESTAMP NOT NULL,
        value INT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS HealthRecommendation (
        id SERIAL PRIMARY KEY,
        recordId INT REFERENCES AqiRecords(id),
        tileId INT REFERENCES Tiles(id),
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
  } catch (error) {
    if (client) await client.end();
    console.error('Schema migration failed', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
    };
  }
};
