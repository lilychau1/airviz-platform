import {
    type PollutantId, 
    type PollutantRecord, 
    type RegionUnit, 
    HealthImpacts, 
    type AqiRecord, 
    type TileMetadata, 
    type RegionLevel, 
    type DetailsReturnTypeForRegionLevel, 
    type PopupInfoReturnTypeForRegionLevel, 
    type CurrentAirQualityInfo, 
    type PollutantCurrentRecord,
    type HealthRecommendationRecord
} from "../lib/constants";
import type { FeatureCollection } from 'geojson';
import Papa from "papaparse";

const LAMBDA_API_BASE_URL: string = import.meta.env.VITE_LAMBDA_API_BASE_URL;

// Fetch map radius
export async function fetchMapRadius(): Promise<number> {
    return 5
}

// Fetch all points
export async function fetchAllRegions(
    level: RegionLevel, 
    currentLongitude: number, 
    currentLatitude: number, 
    radius: number, 
    timestamp: number
): Promise<RegionUnit[]> {
    let attemptTimestamp = timestamp;
    while (true) {
        const resp = await fetch(`${LAMBDA_API_BASE_URL}/fetchAllRegions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                level,
                currentLongitude,
                currentLatitude,
                radius,
                timestamp: attemptTimestamp
            })
        });
        console.log(`curl -X POST '${LAMBDA_API_BASE_URL}/fetchAllRegions' -H 'Content-Type: application/json' -d '${JSON.stringify({
            level,
            currentLongitude,
            currentLatitude,
            radius,
            timestamp: attemptTimestamp
        })}'`);
        if (!resp.ok) throw new Error("Failed to fetch tiles");

        const data = await resp.json();
        const regions: RegionUnit[] = data.map((p: any) => ({
            id: p.id,
            longitude: p.longitude,
            latitude: p.latitude,
            currentAqiColour: p.currentAqiColour
                ? {
                    red: p.currentAqiColour.red,
                    green: p.currentAqiColour.green,
                    blue: p.currentAqiColour.blue
                }
                : {
                    red: 0.5,
                    green: 0.5,
                    blue: 0.5
                }
        }));

        // Check if any field is null in any region
        const hasNull = regions.some(region =>
            region.id == null ||
            region.longitude == null ||
            region.latitude == null ||
            region.currentAqiColour == null ||
            region.currentAqiColour.red == null ||
            region.currentAqiColour.green == null ||
            region.currentAqiColour.blue == null
        );

        if (!hasNull) {
            return regions;
        }

        // Subtract 1 hour (3600000 ms) and try again
        attemptTimestamp -= 3600000;
    }
}

// Fetch pollutant records
export async function fetchPollutantData(
    level: string, 
    id: number, 
    selectedTimestampPeriod: {start: number, end: number},
): Promise<PollutantRecord[]> {
    const selectedTimestampPeriodUtc = {
        start: new Date(selectedTimestampPeriod.start).getTime(),
        end: new Date(selectedTimestampPeriod.end).getTime()
    };

    const resp = await fetch(`${LAMBDA_API_BASE_URL}/fetchPollutantData`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            level,
            id,
            selectedTimestampPeriod: selectedTimestampPeriodUtc
        })
    });
    const data = await resp.json();
    const allRecords: PollutantRecord[] = data["records"];

    if (!resp.ok) {
        throw new Error(`Failed to load pollutant data for ${level} ${id}`); 
    }

    return allRecords;
}

// Fetch tile information
export async function fetchPopupInformation<L extends RegionLevel>(
    level: L, 
    id: number,
    timestamp: number
): Promise<PopupInfoReturnTypeForRegionLevel<L>> {

    const body = { level, id, timestamp } as Record<string, any>;

    const resp = await fetch(`${LAMBDA_API_BASE_URL}/fetchPopupInformation`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        throw new Error(`Failed to load data for ${level} ID ${id}`); 
    }

    return resp.json() as Promise<PopupInfoReturnTypeForRegionLevel<L>>;
}

// Fetch details (on tile/region details page)
export async function fetchDetails<L extends RegionLevel>(
    level: L, 
    id: number
): Promise<DetailsReturnTypeForRegionLevel<L>> {
    const resp = await fetch(`${LAMBDA_API_BASE_URL}/fetchDetails`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ level, id })
    });
    if (!resp.ok) {
        throw new Error(`Failed to load details for ${level} ID ${id}`); 
    }
    return resp.json() as Promise<DetailsReturnTypeForRegionLevel<L>>;
}

export function getHealthImpact(
    pollutantId: PollutantId,
    level: number
): string {
    return HealthImpacts[pollutantId]?.[level as 1 | 2 | 3] ?? "Unknown health impact";
}


export async function fetchCurrentAirQualityInfo(
    level: RegionLevel, 
    id: number
): Promise<CurrentAirQualityInfo> {
const resp = await fetch(`${LAMBDA_API_BASE_URL}/fetchCurrentAirQualityInfo`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({ level, id })
});

console.log(`curl -X POST '${LAMBDA_API_BASE_URL}/fetchCurrentAirQualityInfo' -H 'Content-Type: application/json' -d '${JSON.stringify({ level, id })}'`);
  if (!resp.ok) {
    throw new Error(`Failed to load air quality info for tile ID ${id}`);
  }

  const raw = await resp.json();

  // normalise JSON keys and add new field "healthImpact"
const currentRecords: PollutantCurrentRecord[] = raw.CurrentRecords.map(
    (r: any) => ({
        pollutantId: r.pollutantId,
        timestamp: r.timestamp,
        value: r.value,
        unit: r.unit,
        level: r.level,
        impact: r.impact ?? getHealthImpact(r.pollutantId, r.level)
    })
);

  return {
    aqi: raw.aqi,
    aqiCategory: raw.aqiCategory,
    dominantPollutant: raw.dominantPollutant,
    currentRecords
  };
}

// Fetch aqi records
export async function fetchAqiData(
    level: string, 
    id: number, 
    selectedTimestampPeriod: {start: number, end: number},
): Promise<Record<string, AqiRecord[]>> {
    // Convert start and end to UTC datetime numbers
    const selectedTimestampPeriodUtc = {
        start: new Date(selectedTimestampPeriod.start).getTime(),
        end: new Date(selectedTimestampPeriod.end).getTime()
    };

    const resp = await fetch(`${LAMBDA_API_BASE_URL}/fetchAqiData`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            level,
            id,
            selectedTimestampPeriod: selectedTimestampPeriodUtc
        })
    });
    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(`Failed to load AQI data for ${level} ${id}`); 
    }
    return data["records"];
}

// Fetch health recommendations
export async function fetchTileHealthRecommendations(
    tileId: number
): Promise<HealthRecommendationRecord[]> {
    const resp = await fetch(`${LAMBDA_API_BASE_URL}/fetchTileHealthRecommendations`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ tileId })
    });
    if (!resp.ok) {
        throw new Error(`Failed to load health recommendation data for tile ${tileId}`); 
    }

    const data = await resp.json();
    return data["recommendations"] as HealthRecommendationRecord[];
}

export async function fetchTileMetadata(tileId: number): Promise<TileMetadata> {

    // Load tile coordinates from csv
    const csvResp = await fetch("/data/tile-coordinates.csv");
    if (!csvResp.ok) throw new Error("Failed to load tile coordinates CSV");

    const csvText = await csvResp.text();
    const parsedCsv = Papa.parse(csvText, { header: true });
    const tileRow = (parsedCsv.data as Record<string, string>[]).find(
        row => Number(row.id) === tileId
    );

    if (!tileRow) throw new Error(`Coordinates not found for tile ${tileId}`);

    const latitude = Number(tileRow.latitude);
    const longitude = Number(tileRow.longitude);

    // Load static metadata from json
    const jsonResp = await fetch("/data/metadata.json");
    if (!jsonResp.ok) throw new Error("Failed to load static metadata");

    const staticMetadata = await jsonResp.json();

    // Get latest measurement timestamp (rounded to last full hour)
    const now = new Date();
    const rounded = new Date(now);
    rounded.setMinutes(0, 0, 0);

    return {
        ...staticMetadata,
        tileId,
        latitude,
        longitude,
        latestMeasurementTimestamp: rounded.toISOString(),
    };
}

// Fetch area aggregation data
export const boroughNames = [
    "Barking and Dagenham",
    "Barnet",
    "Bexley",
    "Brent",
    "Bromley",
    "Camden",
    "City of London",
    "Croydon",
    "Ealing",
    "Enfield",
    "Greenwich",
    "Hackney",
    "Hammersmith and Fulham",
    "Haringey",
    "Harrow",
    "Havering",
    "Hillingdon",
    "Hounslow",
    "Islington",
    "Kensington and Chelsea",
    "Kingston upon Thames",
    "Lambeth",
    "Lewisham",
    "Merton",
    "Newham",
    "Redbridge",
    "Richmond upon Thames",
    "Southwark",
    "Sutton",
    "Tower Hamlets",
    "Waltham Forest",
    "Wandsworth",
    "Westminster",
];

export async function loadRegionalGeoJSON(level: string): Promise<FeatureCollection> {
    const resp = await fetch(`/data/map-region-boundrary-json/${level}.geojson`); 
    if (!resp.ok) {
        throw new Error(`Failed to load ${level} GeoJSON data`); 
    }
    return resp.json() as Promise<FeatureCollection>;
}

export async function submitForm(name: string, email: string, message: string): Promise<void> {
    
}