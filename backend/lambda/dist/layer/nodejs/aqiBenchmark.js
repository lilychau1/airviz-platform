"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollutantThresholds = exports.gbrDefraThresholds = exports.uaqiThresholds = void 0;
exports.rateUaqi = rateUaqi;
exports.rateGbrDefra = rateGbrDefra;
exports.rateAqiDict = rateAqiDict;
exports.ratePollutant = ratePollutant;
exports.uaqiThresholds = {
    excellent: 80,
    good: 60,
    moderate: 40,
    low: 20,
    poor: 1
};
exports.gbrDefraThresholds = {
    low: 3,
    moderate: 6,
    high: 10
};
// Function to rate AQI type
function rateUaqi(aqi) {
    if (aqi === null)
        return null;
    if (aqi >= exports.uaqiThresholds.excellent)
        return 1; // Low pollution
    if (aqi >= exports.uaqiThresholds.good)
        return 2; // Moderate
    return 3; // High
}
function rateGbrDefra(aqi) {
    if (aqi === null)
        return null;
    if (aqi <= exports.gbrDefraThresholds.low)
        return 1; // Low
    if (aqi <= exports.gbrDefraThresholds.moderate)
        return 2; // Moderate
    return 3; // High
}
// Generic rate function for a dictionary
function rateAqiDict(aqiDict) {
    if (!aqiDict)
        return null;
    const result = {};
    for (const [key, value] of Object.entries(aqiDict)) {
        if (key === "uaqi")
            result[key] = rateUaqi(value);
        else if (key === "gbr_defra")
            result[key] = rateGbrDefra(value);
    }
    return Object.keys(result).length ? result : null;
}
// Pollutant thresholds
exports.pollutantThresholds = {
    pm25: [15, 35],
    pm10: [30, 60],
    no2: [40, 90],
    o3: [50, 100],
    so2: [20, 80],
    co: [4, 10]
};
function ratePollutant(value, pollutant) {
    if (value === null)
        return null;
    const [low, medium] = exports.pollutantThresholds[pollutant];
    if (value <= low)
        return 1;
    if (value <= medium)
        return 2;
    return 3;
}
