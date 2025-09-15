"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var csvParser = require("csv-parser");
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
                    try {
                        // Try parsing as JSON (for DB secret or any structured secret)
                        return [2 /*return*/, JSON.parse(data.SecretString || '{}')];
                    }
                    catch (_b) {
                        // If parsing fails, treat as plain text (for your Google API key)
                        return [2 /*return*/, data.SecretString];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
;
function getCoordsFromS3(bucket, key) {
    return __awaiter(this, void 0, void 0, function () {
        var rows, command, response, stream;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    rows = [];
                    command = new client_s3_1.GetObjectCommand({ Bucket: bucket, Key: key });
                    return [4 /*yield*/, s3Client.send(command)];
                case 1:
                    response = _a.sent();
                    if (!response.Body) {
                        throw new Error('No Body in S3 response');
                    }
                    stream = response.Body;
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            stream
                                .pipe(csvParser())
                                .on('data', function (row) { return rows.push(row); })
                                .on('end', resolve)
                                .on('error', reject);
                        })];
                case 2:
                    _a.sent();
                    return [2 /*return*/, rows];
            }
        });
    });
}
function fetchAirQuality(apiKey, latitude, longitude) {
    return __awaiter(this, void 0, void 0, function () {
        var url, body, resp, errorText;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "https://airquality.googleapis.com/v1/currentConditions:lookup?key=".concat(apiKey);
                    body = JSON.stringify({
                        universalAqi: true,
                        location: {
                            latitude: Number(latitude),
                            longitude: Number(longitude)
                        },
                        extraComputations: [
                            "HEALTH_RECOMMENDATIONS",
                            "DOMINANT_POLLUTANT_CONCENTRATION",
                            "POLLUTANT_CONCENTRATION",
                            "LOCAL_AQI",
                            "POLLUTANT_ADDITIONAL_INFO"
                        ],
                        languageCode: "en"
                    });
                    return [4 /*yield*/, fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: body,
                        })];
                case 1:
                    resp = _a.sent();
                    if (!!resp.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, resp.text()];
                case 2:
                    errorText = _a.sent();
                    throw new Error("Air Quality API error: ".concat(errorText));
                case 3: return [2 /*return*/, resp.json()];
            }
        });
    });
}
// Batch insert function for AqRecords
function bulkInsertAqRecords(client, AqRecords) {
    return __awaiter(this, void 0, void 0, function () {
        var valuesClause, params, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (AqRecords.length === 0)
                        return [2 /*return*/, []];
                    valuesClause = AqRecords
                        .map(function (_, i) { return "($".concat(i * 3 + 1, ", $").concat(i * 3 + 2, ", $").concat(i * 3 + 3, ")"); }) // Parameter position fpr tileId, timestamp and ingestionTimestamp
                        .join(',');
                    params = AqRecords.flatMap(function (r) { return [r.tileId, r.timestamp, r.ingestionTimestamp]; });
                    return [4 /*yield*/, client.query("INSERT INTO aq_records (tile_id, timestamp, ingestion_timestamp) VALUES ".concat(valuesClause, " RETURNING id, tile_id AS \"tileId\""), params)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.rows];
            }
        });
    });
}
;
// Batch insert function for Pollutants
function bulkInsertPollutants(client, pollutantData) {
    return __awaiter(this, void 0, void 0, function () {
        var valuesClause, params;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (pollutantData.length === 0)
                        return [2 /*return*/];
                    console.log("Bulk inserting pollutant records:");
                    valuesClause = pollutantData
                        .map(function (_, i) {
                        return "($".concat(i * 10 + 1, ", $").concat(i * 10 + 2, ", $").concat(i * 10 + 3, ", $").concat(i * 10 + 4, ", $").concat(i * 10 + 5, ", $").concat(i * 10 + 6, ", $").concat(i * 10 + 7, ", $").concat(i * 10 + 8, ", $").concat(i * 10 + 9, ", $").concat(i * 10 + 10, ")");
                    })
                        .join(',');
                    params = pollutantData.flatMap(function (r) { return [
                        r.recordId,
                        r.tileId,
                        r.timestamp,
                        r.ingestionTimestamp,
                        r.pm25Value,
                        r.pm10Value,
                        r.no2Value,
                        r.so2Value,
                        r.o3Value,
                        r.coValue,
                    ]; });
                    return [4 /*yield*/, client.query("INSERT INTO pollutant_concentration\n            (record_id, tile_id, timestamp, ingestion_timestamp, pm25_value, pm10_value, no2_value, so2_value, o3_value, co_value)\n        VALUES ".concat(valuesClause, " ON CONFLICT DO NOTHING"), params)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Batch insert function for AirQualityIndex
function bulkInsertAirQualityIndex(client, indexData) {
    return __awaiter(this, void 0, void 0, function () {
        var valuesClause, params;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (indexData.length === 0)
                        return [2 /*return*/];
                    valuesClause = indexData
                        .map(function (_, i) {
                        return "($".concat(i * 9 + 1, ", $").concat(i * 9 + 2, ", $").concat(i * 9 + 3, ", $").concat(i * 9 + 4, ", $").concat(i * 9 + 5, ", $").concat(i * 9 + 6, ", $").concat(i * 9 + 7, ", $").concat(i * 9 + 8, ", $").concat(i * 9 + 9, ")");
                    })
                        .join(',');
                    params = indexData.flatMap(function (r) { return [
                        r.recordId,
                        r.tileId,
                        r.indexType,
                        r.category,
                        JSON.stringify(r.colourCode),
                        r.dominantPollutant,
                        r.timestamp,
                        r.ingestionTimestamp,
                        r.value,
                    ]; });
                    return [4 /*yield*/, client.query("INSERT INTO air_quality_index\n            (record_id, tile_id, index_type, category, colour_code, dominant_pollutant, timestamp, ingestion_timestamp, value)\n        VALUES ".concat(valuesClause, " ON CONFLICT DO NOTHING"), params)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Batch insert function for HealthRecommendations
function bulkInsertHealthRecommendations(client, healthData) {
    return __awaiter(this, void 0, void 0, function () {
        var valuesClause, params;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (healthData.length === 0)
                        return [2 /*return*/];
                    valuesClause = healthData
                        .map(function (_, i) {
                        return "($".concat(i * 5 + 1, ", $").concat(i * 5 + 2, ", $").concat(i * 5 + 3, ", $").concat(i * 5 + 4, ", $").concat(i * 5 + 5, ")");
                    })
                        .join(',');
                    params = healthData.flatMap(function (r) { return [
                        r.recordId,
                        r.tileId,
                        r.timestamp,
                        r.ingestionTimestamp,
                        JSON.stringify(r.recommendations),
                    ]; });
                    return [4 /*yield*/, client.query("INSERT INTO health_recommendation\n         (record_id, tile_id, timestamp, ingestion_timestamp, recommendations)\n         VALUES ".concat(valuesClause, " ON CONFLICT DO NOTHING"), params)];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// Limit concurrent API requests to 10
var BATCH_CONCURRENCY = 10;
// Set maximum retries upon fetch failures
var MAX_RETRIES = 4;
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
        });
    });
}
// Perform data fetch with retries
function fetchAqDataWithRetry(apiKey_1, latitude_1, longitude_1) {
    return __awaiter(this, arguments, void 0, function (apiKey, latitude, longitude, retries) {
        var lastError, attempt, aqData, error_1, delay;
        var _a, _b, _c;
        if (retries === void 0) { retries = MAX_RETRIES; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    attempt = 0;
                    _d.label = 1;
                case 1:
                    if (!(attempt < retries)) return [3 /*break*/, 9];
                    _d.label = 2;
                case 2:
                    _d.trys.push([2, 4, , 8]);
                    if (attempt > 0) {
                        console.log("Retry attempt ".concat(attempt, " for coordinates (").concat(latitude, ", ").concat(longitude, ")"));
                    }
                    return [4 /*yield*/, fetchAirQuality(apiKey, latitude, longitude)];
                case 3:
                    aqData = _d.sent();
                    // console.log(`Fetched AQ data for (${latitude}, ${longitude}):`, JSON.stringify(aqData, null, 2));
                    return [2 /*return*/, aqData];
                case 4:
                    error_1 = _d.sent();
                    lastError = error_1;
                    if (!(((_a = error_1.message) === null || _a === void 0 ? void 0 : _a.includes("rate limit")) || ((_b = error_1.message) === null || _b === void 0 ? void 0 : _b.includes("429")) || ((_c = error_1.cause) === null || _c === void 0 ? void 0 : _c.code) === "UND_ERR_SOCKET")) return [3 /*break*/, 6];
                    delay = Math.pow(2, attempt) * 500;
                    console.warn("Rate limit or socket error on attempt ".concat(attempt, " for coordinates (").concat(latitude, ", ").concat(longitude, "). Backing off for ").concat(delay, " ms."));
                    return [4 /*yield*/, sleep(delay)];
                case 5:
                    _d.sent();
                    return [3 /*break*/, 7];
                case 6:
                    console.error("Fetch error on attempt ".concat(attempt, " for coordinates (").concat(latitude, ", ").concat(longitude, "):"), error_1);
                    return [3 /*break*/, 9];
                case 7: return [3 /*break*/, 8];
                case 8:
                    attempt++;
                    return [3 /*break*/, 1];
                case 9:
                    console.error("All ".concat(retries, " attempts failed for coordinates (").concat(latitude, ", ").concat(longitude, ")"));
                    throw lastError;
            }
        });
    });
}
// Concurrency scheduler for batch (tiles)
// Concurrency scheduler for batch (tiles)
function rateLimitedBatchFetch(batch, apiSecret) {
    return __awaiter(this, void 0, void 0, function () {
        var results, _loop_1, i;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    results = [];
                    _loop_1 = function (i) {
                        var chunk, chunkResults;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    chunk = batch.slice(i, i + BATCH_CONCURRENCY);
                                    return [4 /*yield*/, Promise.allSettled(chunk.map(function (tile) { return __awaiter(_this, void 0, void 0, function () {
                                            var aqData;
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: return [4 /*yield*/, fetchAqDataWithRetry(apiSecret, tile.latitude, tile.longitude)];
                                                    case 1:
                                                        aqData = _a.sent();
                                                        return [2 /*return*/, { tile: tile, aqData: aqData }];
                                                }
                                            });
                                        }); }))];
                                case 1:
                                    chunkResults = _b.sent();
                                    // Keep only fulfilled results
                                    chunkResults.forEach(function (res, idx) {
                                        if (res.status === "fulfilled") {
                                            results.push(res.value);
                                        }
                                        else {
                                            console.error("Failed to fetch AQ data for tile ".concat(chunk[idx].id, " (").concat(chunk[idx].latitude, ", ").concat(chunk[idx].longitude, "):"), res.reason);
                                        }
                                    });
                                    // Add a small delay between chunks to further reduce burst load
                                    return [4 /*yield*/, sleep(500)];
                                case 2:
                                    // Add a small delay between chunks to further reduce burst load
                                    _b.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < batch.length)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(i)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    i += BATCH_CONCURRENCY;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, results];
            }
        });
    });
}
var handler = function () { return __awaiter(void 0, void 0, void 0, function () {
    var client, secretId, apiSecretId, bucket, key, dbCreds, apiSecret, coords, batchSize, _loop_2, i, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 10, , 13]);
                secretId = process.env.DB_SECRET_ARN;
                apiSecretId = process.env.GOOGLE_API_SECRET_ARN;
                bucket = process.env.TILE_COORDS_BUCKET;
                key = process.env.TILE_COORDS_FILENAME;
                return [4 /*yield*/, getSecret(secretId)];
            case 1:
                dbCreds = _a.sent();
                return [4 /*yield*/, getSecret(apiSecretId)];
            case 2:
                apiSecret = _a.sent();
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
                return [4 /*yield*/, getCoordsFromS3(bucket, key)];
            case 4:
                coords = _a.sent();
                batchSize = 1000;
                _loop_2 = function (i) {
                    var batch, batchedAqData, aqRecordsToInsert, insertedAqRecords, recordIdMap, pollutantData, aqiData, healthRecommendationData, _loop_3, _i, batchedAqData_1, _b, tile, aqData;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                batch = coords.slice(i, i + batchSize);
                                console.log("Starting bulk ingest of records from index ".concat(i, " to ").concat(Math.min(i + batchSize - 1, coords.length - 1)));
                                return [4 /*yield*/, rateLimitedBatchFetch(batch, apiSecret)];
                            case 1:
                                batchedAqData = _c.sent();
                                if (batchedAqData.length > 0) {
                                    console.log("First entry of batchedAqData:", JSON.stringify(batchedAqData[0], null, 2));
                                }
                                else {
                                    console.log("batchedAqData is empty");
                                }
                                aqRecordsToInsert = batchedAqData.map(function (_a) {
                                    var tile = _a.tile, aqData = _a.aqData;
                                    return ({
                                        tileId: tile.id,
                                        timestamp: aqData.dateTime,
                                        ingestionTimestamp: new Date().toISOString(),
                                    });
                                });
                                return [4 /*yield*/, bulkInsertAqRecords(client, aqRecordsToInsert)];
                            case 2:
                                insertedAqRecords = _c.sent();
                                recordIdMap = new Map();
                                insertedAqRecords.forEach(function (_a) {
                                    var id = _a.id, tileId = _a.tileId;
                                    recordIdMap.set(tileId, id);
                                });
                                console.log("recordIdMap contents:");
                                console.log(Array.from(recordIdMap.entries()).map(function (_a) {
                                    var tileId = _a[0], recordId = _a[1];
                                    return "".concat(tileId, " => ").concat(recordId);
                                }).join(", "));
                                pollutantData = [];
                                aqiData = [];
                                healthRecommendationData = [];
                                _loop_3 = function (tile, aqData) {
                                    var recordId = recordIdMap.get(Number(tile.id));
                                    // console.log(`recordId: ${recordId}`)
                                    if (!recordId) {
                                        console.warn("No record ID found for tile ".concat(tile.id, ", skipping child inserts"));
                                        return "continue";
                                    }
                                    var ingestionTimestamp = new Date().toISOString();
                                    var timestamp = aqData.dateTime;
                                    var pollutantsMap = {
                                        pm25: 'pm25Value',
                                        pm10: 'pm10Value',
                                        no2: 'no2Value',
                                        so2: 'so2Value',
                                        o3: 'o3Value',
                                        co: 'coValue',
                                    };
                                    // Initialise pollutant values by taking from the PollutantConcentrationRecord class
                                    // Any columns except for recordId, tileId, timestamp, ingestionTimestamp
                                    var pollutantValues = {
                                        pm25Value: null,
                                        pm10Value: null,
                                        no2Value: null,
                                        so2Value: null,
                                        o3Value: null,
                                        coValue: null,
                                    };
                                    //  Fill pollutant values from API data
                                    aqData.pollutants.forEach(function (p) {
                                        var col = pollutantsMap[p.code];
                                        if (col) {
                                            pollutantValues[col] = p.concentration.value;
                                        }
                                    });
                                    pollutantData.push(__assign({ recordId: recordId, tileId: tile.id, timestamp: timestamp, ingestionTimestamp: ingestionTimestamp }, pollutantValues));
                                    // Prepare AirQualityIndex rows
                                    aqData.indexes.forEach(function (idx) {
                                        aqiData.push({
                                            recordId: recordId,
                                            tileId: tile.id,
                                            indexType: idx.code,
                                            category: idx.category,
                                            colourCode: idx.color,
                                            dominantPollutant: idx.dominantPollutant,
                                            timestamp: timestamp,
                                            ingestionTimestamp: ingestionTimestamp,
                                            value: idx.aqi,
                                        });
                                    });
                                    // Prepare HealthRecommendation rows
                                    var recommendations = {};
                                    Object.entries(aqData.healthRecommendations)
                                        .forEach(function (_a) {
                                        var popGroup = _a[0], val = _a[1];
                                        if (typeof val === 'string' && val.trim().length > 0) {
                                            recommendations[popGroup] = val;
                                        }
                                    });
                                    healthRecommendationData.push({
                                        recordId: recordId,
                                        tileId: tile.id,
                                        timestamp: timestamp,
                                        ingestionTimestamp: ingestionTimestamp,
                                        recommendations: recommendations,
                                    });
                                };
                                for (_i = 0, batchedAqData_1 = batchedAqData; _i < batchedAqData_1.length; _i++) {
                                    _b = batchedAqData_1[_i], tile = _b.tile, aqData = _b.aqData;
                                    _loop_3(tile, aqData);
                                }
                                // Call bulk insert functions with typed arrays
                                console.log("Inserting ".concat(pollutantData.length, " pollutant records"));
                                return [4 /*yield*/, bulkInsertPollutants(client, pollutantData)];
                            case 3:
                                _c.sent();
                                console.log("Inserting ".concat(aqiData.length, " air quality index records"));
                                return [4 /*yield*/, bulkInsertAirQualityIndex(client, aqiData)];
                            case 4:
                                _c.sent();
                                console.log("Inserting ".concat(healthRecommendationData.length, " health recommendation records"));
                                return [4 /*yield*/, bulkInsertHealthRecommendations(client, healthRecommendationData)];
                            case 5:
                                _c.sent();
                                console.log("Completed ingestion of records from index ".concat(i, " to ").concat(Math.min(i + batchSize - 1, coords.length - 1)));
                                return [2 /*return*/];
                        }
                    });
                };
                i = 0;
                _a.label = 5;
            case 5:
                if (!(i < coords.length)) return [3 /*break*/, 8];
                return [5 /*yield**/, _loop_2(i)];
            case 6:
                _a.sent();
                _a.label = 7;
            case 7:
                i += batchSize;
                return [3 /*break*/, 5];
            case 8: return [4 /*yield*/, client.end()];
            case 9:
                _a.sent();
                return [2 /*return*/, {
                        statusCode: 200,
                        body: JSON.stringify({ message: 'Batch ingestion succeeded.' }),
                    }];
            case 10:
                error_2 = _a.sent();
                if (!client) return [3 /*break*/, 12];
                return [4 /*yield*/, client.end()];
            case 11:
                _a.sent();
                _a.label = 12;
            case 12:
                console.error('Ingestion failed', error_2);
                return [2 /*return*/, {
                        statusCode: 500,
                        body: JSON.stringify({ error: error_2.message }),
                    }];
            case 13: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
