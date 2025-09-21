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
var secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
function getSecret(secretId) {
    return __awaiter(this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, secretsClient.send(new client_secrets_manager_1.GetSecretValueCommand({ SecretId: secretId }))];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, JSON.parse(data.SecretString || "{}")];
            }
        });
    });
}
var levelTableMap = {
    tile: 'tiles',
    borough: 'boroughs',
    // to add later: postcode_area, zone
};
// Haversine formula (returns distance in km)
// https://stackoverflow.com/questions/14560999/using-the-haversine-formula-in-javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
    var R = 6371; // Earth radius in km
    var dLat = ((lat2 - lat1) * Math.PI) / 180;
    var dLon = ((lon2 - lon1) * Math.PI) / 180;
    var a = Math.pow(Math.sin(dLat / 2), 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.pow(Math.sin(dLon / 2), 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
var handler = function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var client, input, secretId, dbCreds, table, res, nearby, ids, query, latestRes, records, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                input = JSON.parse(event.body || "{}");
                _a.label = 1;
            case 1:
                _a.trys.push([1, 6, 7, 10]);
                secretId = process.env.DB_SECRET_ARN;
                return [4 /*yield*/, getSecret(secretId)];
            case 2:
                dbCreds = _a.sent();
                client = new pg_1.Client({
                    host: dbCreds.host,
                    user: dbCreds.username,
                    password: dbCreds.password,
                    database: process.env.DB_NAME,
                    port: parseInt(dbCreds.port, 10),
                    ssl: { rejectUnauthorized: false },
                });
                return [4 /*yield*/, client.connect()];
            case 3:
                _a.sent();
                table = levelTableMap[input.level];
                if (!table)
                    throw new Error("Unsupported level: ".concat(input.level));
                return [4 /*yield*/, client.query("\n            SELECT id, location[0] AS longitude, location[1] AS latitude\n            FROM ".concat(table, ";\n        "))];
            case 4:
                res = _a.sent();
                nearby = res.rows.filter(function (row) {
                    var dist = haversineDistance(input.currentLatitude, input.currentLongitude, row.latitude, row.longitude);
                    return dist <= input.radius;
                });
                if (nearby.length === 0) {
                    return [2 /*return*/, { regions: [] }];
                }
                ids = nearby.map(function (r) { return r.id; });
                query = "\n            WITH latest_records AS (\n                SELECT DISTINCT ON (tile_id) id, tile_id\n                FROM aq_records\n                WHERE tile_id = ANY($1::int[])\n                ORDER BY tile_id, timestamp DESC, ingestion_timestamp DESC\n            )\n            SELECT t.id, t.location[0] AS longitude, t.location[1] AS latitude,\n                   aqi.colour_code\n            FROM ".concat(table, " t\n            LEFT JOIN latest_records ar ON t.id = ar.tile_id\n            LEFT JOIN air_quality_index aqi ON aqi.record_id = ar.id\n            WHERE t.id = ANY($1::int[]);\n        ");
                return [4 /*yield*/, client.query(query, [ids])];
            case 5:
                latestRes = _a.sent();
                records = latestRes.rows.map(function (row) { return ({
                    id: row.id,
                    longitude: row.longitude,
                    latitude: row.latitude,
                    currentAqiColour: row.colour_code
                        ? row.colour_code
                        : null,
                }); });
                return [2 /*return*/, { regions: records }];
            case 6:
                error_1 = _a.sent();
                console.error("Error in fetchAllRegions:", error_1);
                return [2 /*return*/, { error: error_1.message }];
            case 7:
                if (!client) return [3 /*break*/, 9];
                return [4 /*yield*/, client.end()];
            case 8:
                _a.sent();
                _a.label = 9;
            case 9: return [7 /*endfinally*/];
            case 10: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
