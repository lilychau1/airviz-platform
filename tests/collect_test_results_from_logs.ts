import fs from "fs";
import path from "path";

const LOG_DIR = "./logs";
const OUTPUT_CSV = "benchmark_results.csv";

const filenamePattern = /^([a-zA-Z_]+)_run_(\d{8}_\d{6})\.log$/;

// Update metricsPatterns with the additional metrics
const metricsPatterns: Record<string, RegExp> = {
  "checks_total": /checks_total.*:\s([\d.]+)/,
  "checks_succeeded": /checks_succeeded.*:\s([\d.]+)/,
  "checks_failed": /checks_failed.*:\s([\d.]+)/,
  "http_req_duration.avg": /http_req_duration.*avg=([\d.]+)ms/,
  "http_req_duration.p95": /http_req_duration.*p\(95\)=([\d.]+)ms/,
  "http_req_failed": /http_req_failed.*:\s([\d.]+)%/,
  "iteration_duration.avg": /iteration_duration.*avg=([\d.]+)s/,
  "iteration_duration.min": /iteration_duration.*min=([\d.]+)ms/,
  "iteration_duration.med": /iteration_duration.*med=([\d.]+)s/,
  "iteration_duration.max": /iteration_duration.*max=([\d.]+)s/,
  "iteration_duration.p90": /iteration_duration.*p\(90\)=([\d.]+)s/,
  "iteration_duration.p95": /iteration_duration.*p\(95\)=([\d.]+)s/,
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
        let value: string | number = found[1];

        // Convert data sizes to readable numeric value in KB
        if (metric === "data_received" || metric === "data_sent") {
          const unit = found[2];
          value = parseFloat(value);
          if (unit === "MB") value *= 1024;
        } else {
          value = parseFloat(value);
        }

        if (!results[setup]) results[setup] = {};
        if (!results[setup][metric]) results[setup][metric] = {};
        results[setup][metric][trial] = value;
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
