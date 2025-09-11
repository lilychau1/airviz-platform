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
var csvParser = require("csv-parser");
var secretsClient = new client_secrets_manager_1.SecretsManagerClient({});
var s3Client = new client_s3_1.S3Client({});
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
        var url, resp;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "https://airquality.googleapis.com/v1/currentConditions?location=".concat(latitude, ",").concat(longitude, "&key=").concat(apiKey);
                    return [4 /*yield*/, fetch(url)];
                case 1:
                    resp = _a.sent();
                    if (!resp.ok)
                        throw new Error('Air Quality API error');
                    return [2 /*return*/, resp.json()];
            }
        });
    });
}
var handler = function () { return __awaiter(void 0, void 0, void 0, function () {
    var client, secretId, apiSecretId, bucket, key, dbCreds, apiSecret, coords, _i, coords_1, _a, latitude, longitude, apiData, error_1;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 10, , 13]);
                secretId = process.env.DB_SECRET_ARN;
                apiSecretId = process.env.GOOGLE_API_SECRET_ARN;
                bucket = process.env.TILE_COORDS_BUCKET;
                key = process.env.TILE_COORDS_FILENAME;
                return [4 /*yield*/, getSecret(secretId)];
            case 1:
                dbCreds = _b.sent();
                return [4 /*yield*/, getSecret(apiSecretId)];
            case 2:
                apiSecret = _b.sent();
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
                _b.sent();
                return [4 /*yield*/, getCoordsFromS3(bucket, key)];
            case 4:
                coords = _b.sent();
                _i = 0, coords_1 = coords;
                _b.label = 5;
            case 5:
                if (!(_i < coords_1.length)) return [3 /*break*/, 8];
                _a = coords_1[_i], latitude = _a.latitude, longitude = _a.longitude;
                return [4 /*yield*/, fetchAirQuality(apiSecret.apiKey, latitude, longitude)];
            case 6:
                apiData = _b.sent();
                _b.label = 7;
            case 7:
                _i++;
                return [3 /*break*/, 5];
            case 8: return [4 /*yield*/, client.end()];
            case 9:
                _b.sent();
                return [2 /*return*/, {
                        statusCode: 200,
                        body: JSON.stringify({ message: 'Batch ingestion succeeded.' }),
                    }];
            case 10:
                error_1 = _b.sent();
                if (!client) return [3 /*break*/, 12];
                return [4 /*yield*/, client.end()];
            case 11:
                _b.sent();
                _b.label = 12;
            case 12:
                console.error('Ingestion failed', error_1);
                return [2 /*return*/, {
                        statusCode: 500,
                        body: JSON.stringify({ error: error_1.message }),
                    }];
            case 13: return [2 /*return*/];
        }
    });
}); };
exports.handler = handler;
