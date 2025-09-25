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
var handler = function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var client, input, level, dbCreds, stateRes, lastProcessed, aggregationQuery, aggRes, maxTimestamp, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                input = JSON.parse(event.body || "{}");
                level = input.level;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 11, 12, 15]);
                return [4 /*yield*/, getSecret(process.env.DB_SECRET_ARN)];
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
                return [4 /*yield*/, client.query("SELECT last_processed_timestamp FROM aggregate_state WHERE level = $1 FOR UPDATE", [level])];
            case 4:
                stateRes = _a.sent();
                lastProcessed = void 0;
                if (!(stateRes.rows.length === 0)) return [3 /*break*/, 6];
                // First run fallback
                lastProcessed = new Date(0).toISOString();
                return [4 /*yield*/, client.query("INSERT INTO aggregate_state(level, last_processed_timestamp) VALUES ($1, $2)", [level, lastProcessed])];
            case 5:
                _a.sent();
                return [3 /*break*/, 7];
            case 6:
                lastProcessed = stateRes.rows[0].last_processed_timestamp;
                _a.label = 7;
            case 7:
                aggregationQuery = "\n            WITH new_records AS (\n                SELECT\n                    t.borough_id AS region_id,\n                    jsonb_object_agg(aqi.index_type, aqi.value) AS aqi_json,\n                    p.pm25_value, p.pm10_value, p.no2_value, p.so2_value, p.o3_value, p.co_value,\n                    ar.timestamp\n                FROM tiles t\n                JOIN aq_records ar ON t.id = ar.tile_id\n                JOIN air_quality_index aqi ON aqi.record_id = ar.id\n                JOIN pollutant_concentration p ON p.record_id = ar.id\n                WHERE ar.timestamp > $1\n                GROUP BY t.borough_id, ar.timestamp, p.pm25_value, p.pm10_value, p.no2_value, p.so2_value, p.o3_value, p.co_value\n            ),\n            expanded AS (\n                SELECT\n                    nr.region_id,\n                    kv.key,\n                    kv.value::numeric AS value,\n                    nr.pm25_value,\n                    nr.pm10_value,\n                    nr.no2_value,\n                    nr.so2_value,\n                    nr.o3_value,\n                    nr.co_value,\n                    nr.timestamp\n                FROM new_records nr\n                JOIN LATERAL jsonb_each_text(nr.aqi_json) AS kv(key, value) ON TRUE\n            ),\n            aggregated AS (\n                SELECT\n                    region_id,\n                    jsonb_object_agg(key, value) AS aqi,\n                    AVG(pm25_value) AS pm25_value,\n                    AVG(pm10_value) AS pm10_value,\n                    AVG(no2_value) AS no2_value,\n                    AVG(so2_value) AS so2_value,\n                    AVG(o3_value) AS o3_value,\n                    AVG(co_value) AS co_value,\n                    MIN(timestamp) AS timestamp\n                FROM expanded\n                GROUP BY region_id\n            )\n            INSERT INTO regional_aggregates(\n                level, region_id, aqi, pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value, timestamp, update_timestamp\n            )\n            SELECT\n                $2, region_id, aqi, pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value, timestamp, NOW()\n            FROM aggregated\n            RETURNING region_id, timestamp;\n        ";
                return [4 /*yield*/, client.query(aggregationQuery, [lastProcessed, level])];
            case 8:
                aggRes = _a.sent();
                if (!(aggRes.rows.length > 0)) return [3 /*break*/, 10];
                maxTimestamp = aggRes.rows.reduce(function (max, row) {
                    var ts = new Date(row.timestamp).getTime();
                    return ts > max ? ts : max;
                }, 0);
                return [4 /*yield*/, client.query("UPDATE aggregate_state SET last_processed_timestamp = $1 WHERE level = $2", [new Date(maxTimestamp).toISOString(), level])];
            case 9:
                _a.sent();
                _a.label = 10;
            case 10: return [2 /*return*/, { message: "Aggregation completed", aggregatedCount: aggRes.rows.length }];
            case 11:
                err_1 = _a.sent();
                console.error(err_1);
                return [2 /*return*/, { error: err_1.message }];
            case 12:
                if (!client) return [3 /*break*/, 14];
                return [4 /*yield*/, client.end()];
            case 13:
                _a.sent();
                _a.label = 14;
            case 14: return [7 /*endfinally*/];
            case 15: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
