export const Pollutants = {
  PM25: { id: "pm25", label: "PM 2.5" },
  PM10: { id: "pm10", label: "PM 10" },
  NO2:  { id: "no2",  label: "Nitrogen Dioxide" },
  O3:   { id: "o3",   label: "Ozone" },
  SO2:  { id: "so2",  label: "Sulfur Dioxide" },
  CO:   { id: "co",   label: "Carbon Monoxide" }
} as const;

export type PollutantKey = keyof typeof Pollutants;

export type PollutantId = typeof Pollutants[keyof typeof Pollutants]["id"];

export type PollutantLabel = typeof Pollutants[keyof typeof Pollutants]["label"];

export interface Coordinates {
  latitude: number;
  longitude: number; 
}

export interface Colour {
  red: number;
  green: number;
  blue: number;
}

export interface Tile {
  id: number;
  longitude: number; 
  latitude: number;
  currentAqiColour: Colour
}

export interface PollutantRecord {
  pollutantId: PollutantId; 
  timestamp: string; 
  value: number;
  unit: PollutantUnitId;
}

export interface PollutantCurrentRecord extends PollutantRecord {
  level: number;
  healthImpact: string;
}

export interface TileInformation {
  name: string; 
  region: string; 
  boroughRegion: string; 
  currentAqi: number; 
  currentAqiCategoryLevel: number;
  currentPm25Level: number; 
  currentPm10Level: number; 
  currentNo2Level: number; 
  currentO3Level: number; 
  currentSo2Level: number; 
  currentCoLevel: number; 
}

// Define allowed keys as a union type
type LevelKey = 1 | 2 | 3;

// Define the category structure
interface LevelInfo {
  readonly category: string;
  readonly colour: string;
}

export const LevelCategory: { readonly [key in LevelKey]: LevelInfo } = {
  1: {category: "Good", colour: "green"}, 
  2: {category: "Moderate", colour: "#FFAE42"}, 
  3: {category: "Poor", colour: "crimson"}, 
} as const; 

export interface TileDetails {
  id: number; 
  name: string;
  longitude: number;
  latitude: number; 
  region: string; 
  boroughRegion: string;
  zoneRegion: number;
  postcodeArea: string;
  Description: string;
}

export const PollutantUnit = {
  MICROGRAM_PER_CUBIC_METER: { id: "microgram_per_cubic_meter", label: "µg/m³" },
  PART_PER_MILLION: { id: "ppm", label: "ppm" },
  PART_PER_BILLION:  { id: "ppb",  label: "ppb" },
} as const;

export type PollutantUnitKey = keyof typeof Pollutants;

export type PollutantUnitId = typeof Pollutants[keyof typeof Pollutants]["id"];

export type PollutantUnitLabel = typeof Pollutants[keyof typeof Pollutants]["label"];


export const HealthImpacts = {
  "pm25": {
    1: "Low health impact",
    2: "Irritates lungs in sensitive groups",
    3: "Worsens asthma and heart disease"
  },
  "pm10": {
    1: "Low health impact",
    2: "Causes coughing in sensitive people",
    3: "Aggravates asthma and lung disease"
  },
  "no2": {
    1: "Low health impact",
    2: "Irritates eyes and throat",
    3: "Inflames lungs, reduces lung function"
  },
  "o3": {
    1: "Low health impact",
    2: "Causes chest tightness outdoors",
    3: "Triggers coughing and breathing pain"
  },
  "so2": {
    1: "Low health impact",
    2: "Irritates throat and eyes",
    3: "Severe breathing difficulty for asthmatics"
  },
  "co": {
    1: "Low health impact",
    2: "Causes mild headache and fatigue",
    3: "Reduces oxygen, dangerous to heart"
  }
}

export interface CurrentAirQualityInfo {
  aqi: number;
  aqiCategory: string;
  dominantPollutant: PollutantId;
  currentRecords: PollutantCurrentRecord[];
}