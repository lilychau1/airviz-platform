import fs from "fs";
import path from "path";

const LOG_DIR = "./logs";
const OUTPUT_CSV = "benchmark_results.csv";

const filenamePattern = /^([a-zA-Z_]+)_run_(\d{8}_\d{6})\.log$/;

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return NaN;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sorted.length) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}


function fiveNumberSummary(arr: number[]): {
    min: number;
    Q1: number;
    median: number;
    Q3: number;
    max: number;
} {
    return {
        min: Math.min(...arr),
        Q1: percentile(arr, 0.25),
        median: percentile(arr, 0.5),
        Q3: percentile(arr, 0.75),
        max: Math.max(...arr),
    };
}

// Update metricsPatterns with the additional metrics
const metricsPatterns: Record<string, RegExp> = {
    "checks_total": /checks_total.*:\s([\d.]+)/,
    "checks_succeeded": /checks_succeeded.*:\s([\d.]+)/,
    "checks_failed": /checks_failed.*:\s([\d.]+)/,

    "http_req_duration.avg": /http_req_duration.*avg=([\d.]+)ms/,
    "http_req_duration.min": /http_req_duration.*min=([\d.]+)ms/,
    "http_req_duration.med": /http_req_duration.*med=([\d.]+)ms/,
    "http_req_duration.max": /http_req_duration.*max=([\d.]+)(ms|s)/,
    "http_req_duration.p90": /http_req_duration.*p\(90\)=([\d.]+)ms/,
    "http_req_duration.p95": /http_req_duration.*p\(95\)=([\d.]+)ms/,

    "http_req_failed": /http_req_failed.*:\s([\d.]+)%/,
    
    "iteration_duration.avg": /iteration_duration[.\s:]*avg=([\d.]+)(ms|s)/,
    "iteration_duration.min": /iteration_duration[.\s:]*.*min=([\d.]+)(ms|s)/,
    "iteration_duration.med": /iteration_duration[.\s:]*.*med=([\d.]+)(ms|s)/,
    "iteration_duration.max": /iteration_duration[.\s:]*.*max=([\d.]+)(ms|s)/,
    "iteration_duration.p90": /iteration_duration[.\s:]*.*p\(90\)=([\d.]+)(ms|s)/,
    "iteration_duration.p95": /iteration_duration[.\s:]*.*p\(95\)=([\d.]+)(ms|s)/,
    
    "iterations": /iterations.*:\s([\d.]+)/,
    "vus": /vus.*:\s([\d.]+)/,
    "vus_max": /vus_max.*:\s([\d.]+)/,
    
    "data_received": /data_received.*:\s([\d.]+)\s?([kM]?B)/,
    "data_sent": /data_sent.*:\s([\d.]+)\s?([kM]?B)/,
};

interface TrialResults {
    [trialNumber: number]: string | number;
}

interface MetricResults {
    [metric: string]: TrialResults;
}

interface Results {
    [setup: string]: MetricResults;
}

const results: Results = {};

const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith(".log"));
const groupedFiles: Record<string, { file: string; timestamp: string }[]> = {};

for (const file of files) {
    const match = file.match(filenamePattern);
    if (!match) {
        console.warn(`Skipping file (invalid name): ${file}`);
        continue;
    }
    const [_, setup, timestamp] = match;
    if (!groupedFiles[setup]) groupedFiles[setup] = [];
    groupedFiles[setup].push({ file, timestamp });
}

for (const setup of Object.keys(groupedFiles)) {
    groupedFiles[setup].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    groupedFiles[setup].forEach(({ file }, index) => {
        const trial = index + 1;
        const content = fs.readFileSync(path.join(LOG_DIR, file), "utf-8");

        for (const [metric, pattern] of Object.entries(metricsPatterns)) {
            const found = content.match(pattern);
            if (found) {
                let value = parseFloat(found[1]);
                let unit = found[2]; // ms or s, undefined for non-duration metrics

                // Convert iteration_duration from seconds to ms
                if (unit === "s") value *= 1000;

                // Handle data sizes
                if (metric === "data_received" || metric === "data_sent") {
                    const dataUnit = found[2];
                    if (dataUnit === "MB") value *= 1024;
                }

                if (!results[setup]) results[setup] = {};
                if (!results[setup][metric]) results[setup][metric] = {};
                results[setup][metric][trial] = value;
            }
        }

        const latencyMatches = Array.from(
            content.matchAll(/latency:\s([\d.]+)\s?ms/g)
        ).map((m) => parseFloat(m[1]));

        if (latencyMatches.length > 0) {
            const coldStart = latencyMatches[0];
            const subsequent = latencyMatches.slice(1);
            const subsequentAvg =
                subsequent.length > 0
                    ? subsequent.reduce((a, b) => a + b, 0) / subsequent.length
                    : NaN;

            if (!results[setup]) results[setup] = {};

            // Store cold start
            if (!results[setup]["latency_cold_start"])
                results[setup]["latency_cold_start"] = {};
            results[setup]["latency_cold_start"][trial] = coldStart;

            // Store subsequent average
            if (!results[setup]["latency_subsequent_avg"])
                results[setup]["latency_subsequent_avg"] = {};
            results[setup]["latency_subsequent_avg"][trial] = subsequentAvg;

            if (subsequent.length > 0) {
                const summary = fiveNumberSummary(subsequent);

                if (!results[setup]["latency_subsequent_min"])
                    results[setup]["latency_subsequent_min"] = {};
                if (!results[setup]["latency_subsequent_Q1"])
                    results[setup]["latency_subsequent_Q1"] = {};
                if (!results[setup]["latency_subsequent_median"])
                    results[setup]["latency_subsequent_median"] = {};
                if (!results[setup]["latency_subsequent_Q3"])
                    results[setup]["latency_subsequent_Q3"] = {};
                if (!results[setup]["latency_subsequent_max"])
                    results[setup]["latency_subsequent_max"] = {};

                results[setup]["latency_subsequent_min"][trial] = summary.min;
                results[setup]["latency_subsequent_Q1"][trial] = summary.Q1;
                results[setup]["latency_subsequent_median"][trial] = summary.median;
                results[setup]["latency_subsequent_Q3"][trial] = summary.Q3;
                results[setup]["latency_subsequent_max"][trial] = summary.max;
            }
        }
    });
}

// Gather all trial numbers
const allTrials = Array.from(
  new Set(
    Object.values(results)
      .flatMap((metrics) => Object.values(metrics))
      .flatMap((trials) => Object.keys(trials))
  )
)
  .map(Number)
  .sort((a, b) => a - b);

// Write CSV
const header = ["setup_name", "metric", ...allTrials.map((t) => `trial_${t}`)];
let csv = header.join(",") + "\n";

for (const [setup, metrics] of Object.entries(results)) {
  for (const [metric, trials] of Object.entries(metrics)) {
    const row = [
      setup,
      metric,
      ...allTrials.map((t) => (trials[t] !== undefined ? trials[t] : "")),
    ];
    csv += row.join(",") + "\n";
  }
}

fs.writeFileSync(OUTPUT_CSV, csv, "utf-8");
console.log(`CSV written to ${OUTPUT_CSV}`);
