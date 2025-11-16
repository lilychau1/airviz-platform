import fs from 'fs';
import path from 'path';

const logDir = './logs'; // directory with your log files
const outputFile = 'warm_start_latency_stats.csv';

// Regex to match latency lines
const latencyRegex = /time="([^"]+)" level=info msg=".* latency: ([\d.]+) ms"/;

// Helper functions
function median(arr: number[]): number {
const sorted = [...arr].sort((a, b) => a - b);
const mid = Math.floor(sorted.length / 2);
return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quartiles(arr: number[]): { Q1: number; Q3: number } {
const sorted = [...arr].sort((a, b) => a - b);
const mid = Math.floor(sorted.length / 2);
const lowerHalf = sorted.slice(0, mid);
const upperHalf = sorted.length % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
return { Q1: median(lowerHalf), Q3: median(upperHalf) };
}

// Read logs
const logFiles = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
console.log(`Found ${logFiles.length} log files.`);

// Group latencies by setup
const latenciesBySetup: Record<string, number[]> = {};

for (const file of logFiles) {
const setupName = file.split('run')[0]; 
const content = fs.readFileSync(path.join(logDir, file), 'utf-8');
const lines = content.split('\n');

for (const line of lines) {
    const match = line.match(latencyRegex);
    if (match) {
        const latency = parseFloat(match[2]);
        if (!latenciesBySetup[setupName]) latenciesBySetup[setupName] = [];
        latenciesBySetup[setupName].push(latency);
    }
}

}

// Compute statistics
const csvLines: string[] = ['setup,min,Q1,median,Q3,max'];

for (const setup in latenciesBySetup) {
const arr = latenciesBySetup[setup];
const min = Math.min(...arr);
const max = Math.max(...arr);
const med = median(arr);
const { Q1, Q3 } = quartiles(arr);
csvLines.push(`${setup},${min.toFixed(3)},${Q1.toFixed(3)},${med.toFixed(3)},${Q3.toFixed(3)},${max.toFixed(3)}`);
}

// Write CSV
fs.writeFileSync(outputFile, csvLines.join('\n'));
console.log(`CSV with latency statistics written to ${outputFile}`);