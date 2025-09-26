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
// Universal AQI scaling: 1 = low, 3 = high
function rateUaqi(aqi) {
    if (aqi === null)
        return null;
    if (aqi >= 80)
        return 1; // Low
    if (aqi >= 60)
        return 2; // Moderate
    return 3; // High
}
// UK DEFRA AQI scaling: 1 = low, 3 = high
function rateGbrDefra(aqi) {
    if (aqi === null)
        return null;
    if (aqi <= 3)
        return 1; // Low
    if (aqi <= 6)
        return 2; // Moderate
    return 3; // High
}
// Convert AQI dict to category dict
function rateAqi(aqiDict) {
    if (!aqiDict)
        return null;
    var result = {};
    for (var _i = 0, _a = Object.entries(aqiDict); _i < _a.length; _i++) {
        var _b = _a[_i], indexType = _b[0], value = _b[1];
        if (indexType === "uaqi")
            result[indexType] = rateUaqi(value);
        else if (indexType === "gbr_defra")
            result[indexType] = rateGbrDefra(value);
        else
            result[indexType] = null;
    }
    return Object.keys(result).length ? result : null;
}
// Pollutant scaling
function ratePollutant(value, boundaries) {
    if (value === null)
        return null;
    if (value <= boundaries[0])
        return 1;
    if (value <= boundaries[1])
        return 2;
    return 3;
}
var handler = function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var client, input, level, secretId, dbCreds, query, params, res, row, currentAqi, currentAqiCategoryLevel, currentPm25Level, currentPm10Level, currentNo2Level, currentO3Level, currentSo2Level, currentCoLevel, result, result, err_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, 5, 8]);
                input = JSON.parse(event.body || "{}");
                level = input.level;
                secretId = process.env.DB_SECRET_ARN;
                return [4 /*yield*/, getSecret(secretId)];
            case 1:
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
            case 2:
                _a.sent();
                query = void 0;
                params = [input.id];
                if (level === "tile") {
                    query = "\n                SELECT \n                    t.id, \n                    t.name, \n                    'Greater London' AS region, \n                    b.name AS \"boroughRegion\",\n                    aqi_json.aqi AS \"currentAqi\",\n                    p.pm25_value, \n                    p.pm10_value, \n                    p.no2_value, \n                    p.so2_value, \n                    p.o3_value, \n                    p.co_value\n                FROM tiles t\n                LEFT JOIN boroughs b ON t.borough_id = b.id\n                LEFT JOIN LATERAL (\n                    SELECT id\n                    FROM aq_records\n                    WHERE tile_id = t.id\n                    ORDER BY timestamp DESC, ingestion_timestamp DESC\n                    LIMIT 1\n                ) ar ON TRUE\n                LEFT JOIN LATERAL (\n                    SELECT jsonb_object_agg(index_type, value) AS aqi\n                    FROM air_quality_index\n                    WHERE record_id = ar.id\n                ) aqi_json ON TRUE\n                LEFT JOIN pollutant_concentration p ON p.record_id = ar.id\n                WHERE t.id = $1;\n            ";
                }
                else {
                    query = "\n                SELECT \n                    r.id, \n                    r.name, \n                    'Greater London' AS region,\n                    ra.aqi AS \"currentAqi\",\n                    ra.pm25_value, \n                    ra.pm10_value, \n                    ra.no2_value, \n                    ra.so2_value, \n                    ra.o3_value, \n                    ra.co_value,\n                    ra.last_30d_unhealthy_aqi_days,\n                    ra.last_30d_aqi_mean,\n                    ra.last_30d_aqi_max,\n                    ra.last_30d_aqi_min\n                FROM ".concat(level, "s r\n                LEFT JOIN LATERAL (\n                    SELECT \n                        region_id,\n                        aqi, \n                        pm25_value, \n                        pm10_value, \n                        no2_value, \n                        so2_value, \n                        o3_value, \n                        co_value,\n                        last_30d_unhealthy_aqi_days,\n                        last_30d_aqi_mean,\n                        last_30d_aqi_max,\n                        last_30d_aqi_min\n                    FROM regional_aggregates\n                    WHERE \n                        level = '").concat(level, "' AND region_id = r.id\n                    ORDER BY timestamp DESC, update_timestamp DESC\n                    LIMIT 1\n                ) ra ON TRUE\n                WHERE r.id = $1;\n            ");
                }
                return [4 /*yield*/, client.query(query, params)];
            case 3:
                res = _a.sent();
                if (res.rows.length === 0) {
                    return [2 /*return*/, { error: "No data found for ".concat(level, " with id=").concat(input.id) }];
                }
                row = res.rows[0];
                currentAqi = row.currentAqi
                    ? typeof row.currentAqi === "string"
                        ? JSON.parse(row.currentAqi)
                        : row.currentAqi
                    : null;
                currentAqiCategoryLevel = rateAqi(currentAqi);
                currentPm25Level = ratePollutant(row.pm25_value, [15, 35]);
                currentPm10Level = ratePollutant(row.pm10_value, [30, 60]);
                currentNo2Level = ratePollutant(row.no2_value, [40, 90]);
                currentO3Level = ratePollutant(row.o3_value, [50, 100]);
                currentSo2Level = ratePollutant(row.so2_value, [20, 80]);
                currentCoLevel = ratePollutant(row.co_value, [4, 10]);
                if (level === "tile") {
                    result = {
                        id: row.id,
                        name: row.name,
                        region: row.region,
                        boroughRegion: row.boroughRegion,
                        currentAqi: currentAqi,
                        currentAqiCategoryLevel: currentAqiCategoryLevel,
                        currentPm25Level: currentPm25Level,
                        currentPm10Level: currentPm10Level,
                        currentNo2Level: currentNo2Level,
                        currentO3Level: currentO3Level,
                        currentSo2Level: currentSo2Level,
                        currentCoLevel: currentCoLevel,
                    };
                    return [2 /*return*/, result];
                }
                else {
                    result = {
                        id: row.id,
                        name: row.name,
                        region: row.region,
                        currentAqi: currentAqi,
                        currentAqiCategoryLevel: currentAqiCategoryLevel,
                        currentPm25Level: currentPm25Level,
                        currentPm10Level: currentPm10Level,
                        currentNo2Level: currentNo2Level,
                        currentO3Level: currentO3Level,
                        currentSo2Level: currentSo2Level,
                        currentCoLevel: currentCoLevel,
                        last30dUnhealthyAQIDays: row.last_30d_unhealthy_aqi_days,
                        last30dAQIMean: row.last_30d_aqi_mean,
                        last30dAQIMax: row.last_30d_aqi_max,
                        last30dAQIMin: row.last_30d_aqi_min,
                    };
                    return [2 /*return*/, result];
                }
                return [3 /*break*/, 8];
            case 4:
                err_1 = _a.sent();
                console.error("Error in fetchPopupInformation:", err_1);
                return [2 /*return*/, { error: err_1.message }];
            case 5:
                if (!client) return [3 /*break*/, 7];
                return [4 /*yield*/, client.end()];
            case 6:
                _a.sent();
                _a.label = 7;
            case 7: return [7 /*endfinally*/];
            case 8: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
