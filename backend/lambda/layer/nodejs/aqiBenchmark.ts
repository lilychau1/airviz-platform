export const uaqiThresholds = {
  excellent: 80,
  good: 60,
  moderate: 40,
  low: 20,
  poor: 1
};

export const gbrDefraThresholds = {
  low: 3,
  moderate: 6,
  high: 10
};

// Function to rate AQI type
export function rateUaqi(aqi: number | null): 1 | 2 | 3 | null {
  if (aqi === null) return null;
  if (aqi >= uaqiThresholds.excellent) return 1; // Low pollution
  if (aqi >= uaqiThresholds.good) return 2; // Moderate
  return 3; // High
}

export function rateGbrDefra(aqi: number | null): 1 | 2 | 3 | null {
  if (aqi === null) return null;
  if (aqi <= gbrDefraThresholds.low) return 1; // Low
  if (aqi <= gbrDefraThresholds.moderate) return 2; // Moderate
  return 3; // High
}

// Generic rate function for a dictionary
export function rateAqiDict(aqiDict: Record<string, number> | null): Record<string, number> | null {
  if (!aqiDict) return null;
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(aqiDict)) {
    if (key === "uaqi") result[key] = rateUaqi(value)!;
    else if (key === "gbr_defra") result[key] = rateGbrDefra(value)!;
  }
  return Object.keys(result).length ? result : null;
}

// Pollutant thresholds
export const pollutantThresholds: Record<string, [number, number]> = {
  pm25: [15, 35],
  pm10: [30, 60],
  no2: [40, 90],
  o3: [50, 100],
  so2: [20, 80],
  co: [4, 10]
};

export function ratePollutant(
  value: number | null, 
  pollutant: keyof typeof pollutantThresholds
): 1 | 2 | 3 | null {
  if (value === null) return null;
  const [low, medium] = pollutantThresholds[pollutant];
  if (value <= low) return 1;
  if (value <= medium) return 2;
  return 3;
}
