"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
var pg_1 = require("pg");
var client_secrets_manager_1 = require("@aws-sdk/client-secrets-manager");
var client_s3_1 = require("@aws-sdk/client-s3");
var secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
var s3Client = new client_s3_1.S3Client({});
// Helper functions
function getSecret(secretId) {
    return __awaiter(this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretId }))];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, JSON.parse(data.SecretString || '{}')];
            }
        });
    });
}
function streamToString(stream) {
    return __awaiter(this, void 0, void 0, function () {
        var chunks;
        return __generator(this, function (_a) {
            chunks = [];
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    stream.on('data', function (chunk) { return chunks.push(chunk); });
                    stream.on('error', reject);
                    stream.on('end', function () { return resolve(Buffer.concat(chunks).toString('utf-8')); });
                })];
        });
    });
}
var handler = function () { return __awaiter(void 0, void 0, void 0, function () {
    var client, secretId, dbCreds, res, tablesToDrop, _i, tablesToDrop_1, table, bucket, key, s3Resp, jsonString, boroughs, now_1, valuesClause, params, tileKey, tileResp, csvString, tileLines, tileHeader, tiles, valuesClause, params, error_1;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 24, 27, 30]);
                secretId = process.env.DB_SECRET_ARN;
                return [4 /*yield*/, getSecret(secretId)];
            case 1:
                dbCreds = _b.sent();
                client = new pg_1.Client({
                    host: dbCreds.host,
                    user: dbCreds.username,
                    password: dbCreds.password,
                    database: process.env.DB_NAME,
                    port: parseInt(dbCreds.port, 10),
                    ssl: { rejectUnauthorized: false },
                });
                return [4 /*yield*/, client.connect()];
            case 2:
                _b.sent();
                return [4 /*yield*/, client.query("\n            SELECT table_schema, table_name \n            FROM information_schema.tables \n            WHERE table_schema = 'public';\n        ")];
            case 3:
                res = _b.sent();
                console.log('Existing tables:', res.rows);
                tablesToDrop = [
                    'health_recommendation',
                    'air_quality_index',
                    'pollutant_concentration',
                    'aq_records',
                    'tiles',
                    'postcode_areas',
                    'zones',
                    'boroughs',
                ];
                _i = 0, tablesToDrop_1 = tablesToDrop;
                _b.label = 4;
            case 4:
                if (!(_i < tablesToDrop_1.length)) return [3 /*break*/, 7];
                table = tablesToDrop_1[_i];
                return [4 /*yield*/, client.query("DROP TABLE IF EXISTS public.".concat(table, " CASCADE;"))];
            case 5:
                _b.sent();
                console.log("Table ".concat(table, " dropped (if it existed)."));
                _b.label = 6;
            case 6:
                _i++;
                return [3 /*break*/, 4];
            case 7:
                // Create schema
                console.log('Creating new tables...');
                return [4 /*yield*/, client.query("\n            CREATE TABLE IF NOT EXISTS boroughs (\n                id SERIAL PRIMARY KEY,\n                name VARCHAR(255) NOT NULL, \n                location POINT NOT NULL, \n                inserted_at TIMESTAMP NOT NULL, \n                updated_at TIMESTAMP NOT NULL, \n                description TEXT\n            );\n        ")];
            case 8:
                _b.sent();
                return [4 /*yield*/, client.query("\n            CREATE TABLE IF NOT EXISTS zones (\n                id SERIAL PRIMARY KEY,\n                name VARCHAR(255) NOT NULL, \n                location POINT NOT NULL, \n                inserted_at TIMESTAMP NOT NULL, \n                updated_at TIMESTAMP NOT NULL, \n                description TEXT\n            );\n        ")];
            case 9:
                _b.sent();
                return [4 /*yield*/, client.query("\n            CREATE TABLE IF NOT EXISTS postcode_areas (\n                id SERIAL PRIMARY KEY,\n                name VARCHAR(255) NOT NULL, \n                location POINT NOT NULL, \n                inserted_at TIMESTAMP NOT NULL, \n                updated_at TIMESTAMP NOT NULL, \n                description TEXT\n            );\n        ")];
            case 10:
                _b.sent();
                return [4 /*yield*/, client.query("\n            CREATE TABLE IF NOT EXISTS tiles (\n                id SERIAL PRIMARY KEY,\n                /* borough_id INT REFERENCES boroughs(id), */\n                borough_id INT, \n                /* zone_id INT REFERENCES zones(id), */ \n                zone_id INT, \n                /* postcode_area_id INT REFERENCES postcode_areas(id), */\n                postcode_area_id INT, \n                name VARCHAR(255) NOT NULL, \n                location POINT NOT NULL, \n                inserted_at TIMESTAMP NOT NULL, \n                updated_at TIMESTAMP NOT NULL, \n                description TEXT\n            );\n        ")];
            case 11:
                _b.sent();
                return [4 /*yield*/, client.query("\n            CREATE TABLE IF NOT EXISTS aq_records (\n                id SERIAL PRIMARY KEY,\n                tile_id INT NOT NULL,\n                timestamp TIMESTAMP NOT NULL,\n                ingestion_timestamp TIMESTAMP NOT NULL\n            );\n        ")];
            case 12:
                _b.sent();
                return [4 /*yield*/, client.query("\n            CREATE TABLE IF NOT EXISTS pollutant_concentration (\n                id SERIAL PRIMARY KEY,\n                record_id INT REFERENCES aq_records(id),\n                /* tile_id INT REFERENCES Tiles(id), */\n                tile_id INT NOT NULL,\n                timestamp TIMESTAMP NOT NULL,\n                ingestion_timestamp TIMESTAMP NOT NULL,\n                pm25_value DOUBLE PRECISION,\n                pm10_value DOUBLE PRECISION,\n                no2_value DOUBLE PRECISION,\n                so2_value DOUBLE PRECISION,\n                o3_value DOUBLE PRECISION,\n                co_value DOUBLE PRECISION\n            );\n        ")];
            case 13:
                _b.sent();
                return [4 /*yield*/, client.query("\n            CREATE TABLE IF NOT EXISTS air_quality_index (\n                id SERIAL PRIMARY KEY,\n                record_id INT REFERENCES aq_records(id),\n                /* tile_id INT REFERENCES Tiles(id), */\n                tile_id INT NOT NULL,\n                index_type VARCHAR(20) NOT NULL,\n                category TEXT NOT NULL,\n                colour_code JSONB NOT NULL,\n                dominant_pollutant VARCHAR(50) NOT NULL,\n                timestamp TIMESTAMP NOT NULL,\n                ingestion_timestamp TIMESTAMP NOT NULL,\n                value INT\n            );\n        ")];
            case 14:
                _b.sent();
                return [4 /*yield*/, client.query("\n            CREATE TABLE IF NOT EXISTS health_recommendation (\n                id SERIAL PRIMARY KEY,\n                record_id INT REFERENCES aq_records(id),\n                /* tile_id INT REFERENCES Tiles(id), */\n                tile_id INT NOT NULL,\n                timestamp TIMESTAMP NOT NULL,\n                ingestion_timestamp TIMESTAMP NOT NULL,\n                recommendations JSONB NOT NULL\n            );\n        ")];
            case 15:
                _b.sent();
                bucket = process.env.BUCKET;
                key = process.env.BOROUGH_COORDS_FILENAME;
                return [4 /*yield*/, s3Client.send(new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key }))];
            case 16:
                s3Resp = _b.sent();
                return [4 /*yield*/, streamToString(s3Resp.Body)];
            case 17:
                jsonString = _b.sent();
                boroughs = JSON.parse(jsonString);
                now_1 = new Date().toISOString();
                console.log("Loaded ".concat(boroughs.length, " boroughs from S3"));
                if (!(boroughs.length > 0)) return [3 /*break*/, 19];
                valuesClause = boroughs
                    .map(function (_, i) {
                    return "($".concat(i * 7 + 1, ", $").concat(i * 7 + 2, ", POINT($").concat(i * 7 + 3, ", $").concat(i * 7 + 4, "), $").concat(i * 7 + 5, ", $").concat(i * 7 + 6, ", $").concat(i * 7 + 7, ")");
                })
                    .join(', ');
                params = boroughs.flatMap(function (borough, i) { return [
                    i + 1, // id
                    borough.name, // name
                    borough.longitude, // POINT X
                    borough.latitude, // POINT Y
                    now_1, // inserted_at
                    now_1, // updated at
                    borough.description || '' //description
                ]; });
                // Run query
                return [4 /*yield*/, client.query("INSERT INTO boroughs (id, name, location, inserted_at, updated_at, description) VALUES ".concat(valuesClause), params)];
            case 18:
                // Run query
                _b.sent();
                console.log("Inserted ".concat(boroughs.length, " boroughs successfully."));
                _b.label = 19;
            case 19:
                tileKey = process.env.TILE_COORDS_FILENAME;
                return [4 /*yield*/, s3Client.send(new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: tileKey }))];
            case 20:
                tileResp = _b.sent();
                return [4 /*yield*/, streamToString(tileResp.Body)];
            case 21:
                csvString = _b.sent();
                tileLines = csvString.trim().split('\n');
                tileHeader = (_a = tileLines.shift()) === null || _a === void 0 ? void 0 : _a.split(',');
                // Catch missing tileHeader
                if (!tileHeader)
                    throw new Error('Tile CSV header missing');
                tiles = tileLines.map(function (line) {
                    var cols = line.split(',');
                    return {
                        id: Number(cols[0]),
                        latitude: Number(cols[1]),
                        longitude: Number(cols[2]),
                        boroughId: Number(cols[3])
                    };
                });
                console.log("Loaded ".concat(tiles.length, " tiles from CSV"));
                if (!(tiles.length > 0)) return [3 /*break*/, 23];
                valuesClause = tiles
                    .map(function (tile, i) {
                    return "($".concat(i * 10 + 1, ", $").concat(i * 10 + 2, ", $").concat(i * 10 + 3, ", $").concat(i * 10 + 4, ", $").concat(i * 10 + 5, ", POINT($").concat(i * 10 + 6, ", $").concat(i * 10 + 7, "), $").concat(i * 10 + 8, ", $").concat(i * 10 + 9, ", $").concat(i * 10 + 10, ")");
                })
                    .join(', ');
                params = tiles.flatMap(function (tile) { return [
                    tile.id, // id
                    tile.boroughId || null, //borough_id
                    null, // zone_id placeholder
                    null, // postcode_area_id placeholder
                    "Tile ".concat(tile.id), // name
                    tile.longitude, // POINT X
                    tile.latitude, // POINT Y
                    now_1, // inserted_at
                    now_1, // updated_at
                    null, // description
                ]; });
                return [4 /*yield*/, client.query("INSERT INTO tiles (id, borough_id, zone_id, postcode_area_id, name, location, inserted_at, updated_at, description) VALUES ".concat(valuesClause), params)];
            case 22:
                _b.sent();
                console.log("Inserted ".concat(tiles.length, " tiles successfully."));
                _b.label = 23;
            case 23: return [2 /*return*/, {
                    statusCode: 200,
                    body: JSON.stringify({ message: 'Schema setup completed successfully' }),
                }];
            case 24:
                error_1 = _b.sent();
                if (!client) return [3 /*break*/, 26];
                return [4 /*yield*/, client.end()];
            case 25:
                _b.sent();
                _b.label = 26;
            case 26:
                console.error('Schema migration failed', error_1);
                return [2 /*return*/, {
                        statusCode: 500,
                        body: JSON.stringify({ error: error_1.message }),
                    }];
            case 27:
                if (!client) return [3 /*break*/, 29];
                return [4 /*yield*/, client.end()];
            case 28:
                _b.sent();
                _b.label = 29;
            case 29: return [7 /*endfinally*/];
            case 30: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
