import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.SERVERLESS_LAMBDA_API_GATEWAY_BASE_URL;
if (!BASE_URL) {
    throw new Error("BASE_URL environment variable is not set");
}

function getFullHourUTC(date) {
    const d = new Date(date);
    d.setUTCMinutes(0, 0, 0);
    return d.getTime();
}

function getTimestampOneHourAgo() {
    const now = new Date();
    return getFullHourUTC(new Date(now.getTime() - 60 * 60 * 1000));
}

// FetchAllRegions function
export function fetchAllRegions() {
    const timestamp = getTimestampOneHourAgo();
    const payload = { level: 'tile', currentLongitude: -0.101923, currentLatitude: 51.503758, radius: 1, timestamp };

    const res = http.post(
        `${BASE_URL}/fetchAllRegions`,
        JSON.stringify(payload),
        { headers: { 'Content-Type': 'application/json' } }
    );
    check(res, { 'status 200': r => r.status === 200 });
    console.log(`fetchAllRegions (tile) latency: ${res.timings.duration} ms`);
}

// k6 test options
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
            iterations: 49,
            startTime: '30s',
            exec: 'warmStart',
        },
    },
};

export function coldStart() {
    fetchAllRegions();
}

export function warmStart() {
    fetchAllRegions();
}