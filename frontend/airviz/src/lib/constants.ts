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

export interface Coordinate {
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
    concentration_value: number;
    unit: string;
}

export interface Tile {
    id: number;
    longitude: number; 
    latitude: number;
    currentAqiColour: Colour
}