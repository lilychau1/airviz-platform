import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.SERVERLESS_LAMBDA_API_GATEWAY_BASE_URL;


function getFullHourUTC(date) {
    const d = new Date(date);
    d.setUTCMinutes(0, 0, 0);
    return d.getTime();
}

// Returns object { start, end } for 2 hours ago to 1 hour ago
function getSelectedPeriod() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    return {
        start: getFullHourUTC(twoHoursAgo),
        end: getFullHourUTC(oneHourAgo),
    };
}

// Returns 1 hour ago timestamp
function getTimestampOneHourAgo() {
    const now = new Date();
    return getFullHourUTC(new Date(now.getTime() - 60 * 60 * 1000));
}

// Fetch functions for each lambda endpoint

export function fetchPopupInformation() {
    const payloads = [
        { level: 'borough', id: 1 },
        { level: 'tile', id: 1 },
    ];
    payloads.forEach(p => {
        const res = http.post(
            `${BASE_URL}/fetchPopupInformation`,
            JSON.stringify(p),
            { headers: { 'Content-Type': 'application/json' } }
        );
        check(res, { 'status 200': r => r.status === 200 });
        console.log(`fetchPopupInformation (${p.level}) latency: ${res.timings.duration} ms`);
    });
}

export function fetchPollutantData() {
    const period = getSelectedPeriod();
    const payloads = [
        { level: 'tile', id: 42, selectedTimestampPeriod: period },
        { level: 'borough', id: 1, selectedTimestampPeriod: period },
    ];
    payloads.forEach(p => {
        const res = http.post(
            `${BASE_URL}/fetchPollutantData`,
            JSON.stringify(p),
            { headers: { 'Content-Type': 'application/json' } }
        );
        check(res, { 'status 200': r => r.status === 200 });
        console.log(`fetchPollutantData (${p.level}) latency: ${res.timings.duration} ms`);
    });
}

export function fetchAqiData() {
    const period = getSelectedPeriod();
    const payloads = [
        { level: 'tile', id: 1, selectedTimestampPeriod: period },
        { level: 'borough', id: 1, selectedTimestampPeriod: period },
    ];
    payloads.forEach(p => {
        const res = http.post(
            `${BASE_URL}/fetchAqiData`,
            JSON.stringify(p),
            { headers: { 'Content-Type': 'application/json' } }
        );
        check(res, { 'status 200': r => r.status === 200 });
        console.log(`fetchAqiData (${p.level}) latency: ${res.timings.duration} ms`);
    });
}

export function fetchAllRegions() {
    const timestamp = getTimestampOneHourAgo();
    const payloads = [
        { level: 'borough', currentLongitude: -0.101923, currentLatitude: 51.503758, radius: 4, timestamp },
        { level: 'tile', currentLongitude: -0.101923, currentLatitude: 51.503758, radius: 1, timestamp },
    ];
    payloads.forEach(p => {
        const res = http.post(
            `${BASE_URL}/fetchAllRegions`,
            JSON.stringify(p),
            { headers: { 'Content-Type': 'application/json' } }
        );
        check(res, { 'status 200': r => r.status === 200 });
        console.log(`fetchAllRegions (${p.level}) latency: ${res.timings.duration} ms`);
    });
}

export function fetchCurrentAirQualityInfo() {
    const payloads = [
        { level: 'borough', id: 1 },
        { level: 'tile', id: 1 },
    ];
    payloads.forEach(p => {
        const res = http.post(
            `${BASE_URL}/fetchCurrentAirQualityInfo`,
            JSON.stringify(p),
            { headers: { 'Content-Type': 'application/json' } }
        );
        check(res, { 'status 200': r => r.status === 200 });
        console.log(`fetchCurrentAirQualityInfo (${p.level}) latency: ${res.timings.duration} ms`);
    });
}

export function fetchDetails() {
    const payloads = [
        { level: 'borough', id: 1 },
        { level: 'tile', id: 1 },
    ];
    payloads.forEach(p => {
        const res = http.post(
            `${BASE_URL}/fetchDetails`,
            JSON.stringify(p),
            { headers: { 'Content-Type': 'application/json' } }
        );
        check(res, { 'status 200': r => r.status === 200 });
        console.log(`fetchDetails (${p.level}) latency: ${res.timings.duration} ms`);
    });
}

export function fetchTileHealthRecommendations() {
    const payloads = [
        { tileId: 1 },
    ];
    payloads.forEach(p => {
        const res = http.post(
            `${BASE_URL}/fetchTileHealthRecommendations`,
            JSON.stringify(p),
            { headers: { 'Content-Type': 'application/json' } }
        );
        check(res, { 'status 200': r => r.status === 200 });
        console.log(`fetchTileHealthRecommendations latency: ${res.timings.duration} ms`);
    });
}

// k6 test scenarios

export let options = {
    scenarios: {
        cold_start: {
            executor: 'per-vu-iterations',
            vus: 1,
            iterations: 1,
            exec: 'coldStart',
        },
        warm_start: {
            executor: 'per-vu-iterations',
            vus: 1,
            iterations: 1,
            exec: 'warmStart',
            startTime: '30s',
        },
        load_test: {
            executor: 'constant-vus',
            vus: 5,
            duration: '30s',
            exec: 'loadTest',
            startTime: '1m',
        },
    },
};

export function coldStart() {
    fetchAllRegions();
}

export function warmStart() {
    fetchAllRegions();
}

export function loadTest() {
    fetchPopupInformation();
    fetchPollutantData();
    fetchAqiData();
    fetchAllRegions();
    fetchCurrentAirQualityInfo();
    fetchDetails();
    fetchTileHealthRecommendations();
}
