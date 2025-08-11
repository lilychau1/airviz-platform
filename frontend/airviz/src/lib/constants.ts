export const POLLUTANTS = {
  PM25: { id: "pm25", label: "PM 2.5" },
  PM10: { id: "pm10", label: "PM 10" },
  NO2:  { id: "no2",  label: "Nitrogen Dioxide" },
  O3:   { id: "o3",   label: "Ozone" },
  SO2:  { id: "so2",  label: "Sulfur Dioxide" },
  CO:   { id: "co",   label: "Carbon Monoxide" }
} as const;

export type PollutantKey = keyof typeof POLLUTANTS;

export type PollutantId = typeof POLLUTANTS[keyof typeof POLLUTANTS]["id"];

export type PollutantLabel = typeof POLLUTANTS[keyof typeof POLLUTANTS]["label"];
