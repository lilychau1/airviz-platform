import { type PollutantId, type Coordinates, type PollutantRecord, type RegionUnit, type TilePopupInformation, type TileDetails, type CurrentAirQualityInfo, HealthImpacts, type PollutantCurrentRecord, type AqiRecord, type AqiTypeId, type HealthRecommendationRecord, type TileMetadata, type RegionPopupInformation, type RegionLevel, type DetailsReturnTypeForRegionLevel, type PopupInfoReturnTypeForRegionLevel} from "../lib/constants";
import type { FeatureCollection } from 'geojson';

// Fetch current location

export async function fetchCurrentLocation(): Promise<Coordinates> {
    const resp = await fetch('/mock/current-location.json');
    if (!resp.ok) throw new Error("Failed to fetch current locations");
    
    const data = await resp.json();

    return {
        longitude: data.longitude, 
        latitude: data.latitude, 
    }
}

// Fetch map radius
export async function fetchMapRadius(): Promise<number> {
    return 5
}

// Fetch all points
export async function fetchAllRegions(
    // Params not used for now in mock
    level: RegionLevel, 
    currentLongitude: number, 
    currentLatitude: number, 
    radius: number, 
    timestamp: number
): Promise<RegionUnit[]> {
    const timestampDate = new Date(timestamp);
    timestampDate.setMinutes(0, 0, 0);
    const isoTimestampString = timestampDate.toISOString().replace(/\.\d{3}Z$/, 'Z');;
    console.log(`/mock/${level}s.json`)
    const resp = await fetch(`/mock/${level}s.json`)
    if (!resp.ok) throw new Error("Failed to fetch tiles");
    const data = await resp.json();
    const regionDataForTimestamp = data[isoTimestampString];

    if (regionDataForTimestamp) {
        console.log('Tiles for this hour:', regionDataForTimestamp);
    } else {
        console.log('No tile data found for timestamp:', isoTimestampString);
    }

    return regionDataForTimestamp.map((p: any) => ({
        id: p.id, 
        longitude: p.longitude, 
        latitude: p.latitude, 
        currentAqiColour: p.currentAqiColour
    }));
}

// Fetch pollutant records
export async function fetchPollutantData(
    level: string, 
    id: number, 
    pollutantId: PollutantId
): Promise<PollutantRecord[]> {
    const resp = await fetch(`/mock/${level}/${id}/${pollutantId}.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load ${pollutantId} data for ${level} ${id}`); 
    }

    return resp.json() as Promise<PollutantRecord[]>;
}

// Fetch tile information
export async function fetchPopupInformation<L extends RegionLevel>(
    level: L, 
    id: number
): Promise<PopupInfoReturnTypeForRegionLevel<L>> {
    const resp = await fetch(`/mock/${level}/${id}/information.json`); 
    console.log(`/mock/${level}/${id}/information.json`)
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
    const resp = await fetch(`/mock/${level}/${id}/details.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load Tile details for ${level} ID ${id}`); 
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
  const resp = await fetch(`/mock/${level}/${id}/current-air-quality-info.json`);
  if (!resp.ok) {
    throw new Error(`Failed to load air quality info for tile ID ${id}`);
  }

  const raw = await resp.json();

  // normalize JSON keys and add new field "healthImpact"
  const currentRecords: PollutantCurrentRecord[] = raw.CurrentRecords.map(
    (r: any) => ({
      pollutantId: r.pollutantId,
      timestamp: r.timestamp,
      value: r.value,
      unit: r.unit,
      level: r.level,
      healthImpact: getHealthImpact(r.pollutantId, r.level)
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
    aqiTypeId: AqiTypeId
): Promise<AqiRecord[]> {
    const resp = await fetch(`/mock/${level}/${id}/aqi-${aqiTypeId}.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load AQI (${aqiTypeId}) data for ${level} ${id}`); 
    }

    return resp.json() as Promise<AqiRecord[]>;
}

// Fetch health recommendations
export async function fetchTileHealthRecommendations(
    tileId: number
): Promise<HealthRecommendationRecord[]> {
    const resp = await fetch(`/mock/tile/${tileId}/health-recommendations.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load health recommendation data for tile ${tileId}`); 
    }

    return resp.json() as Promise<HealthRecommendationRecord[]>;
}

// Fetch metadata
export async function fetchTileMetadata(
    tileId: number
): Promise<TileMetadata>{
    const resp = await fetch(`/mock/tile/${tileId}/metadata.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load metadata for tile ${tileId}`); 
    }

    return resp.json() as Promise<TileMetadata>;
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
