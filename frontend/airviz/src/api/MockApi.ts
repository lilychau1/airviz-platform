import { type PollutantId, type Coordinates, type PollutantRecord, type Tile, type TileInformation, type TileDetails, type CurrentAirQualityInfo, HealthImpacts, type PollutantCurrentRecord, type AqiRecord, type AqiTypeId, type HealthRecommendationRecord } from "../lib/constants";

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
export async function fetchAllTiles(
    // Params not used for now in mock
    currentLongitude: number, 
    currentLatitude: number, 
    radius: number, 
    timestamp: number,     
): Promise<Tile[]> {
    const timestampDate = new Date(timestamp);
    timestampDate.setMinutes(0, 0, 0);
    const isoTimestampString = timestampDate.toISOString().replace(/\.\d{3}Z$/, 'Z');;

    const resp = await fetch('/mock/tiles.json')
    if (!resp.ok) throw new Error("Failed to fetch tiles");
    const data = await resp.json();
    const tileDataForTimestamp = data[isoTimestampString];

    if (tileDataForTimestamp) {
    console.log('Tiles for this hour:', tileDataForTimestamp);
    } else {
    console.log('No tile data found for timestamp:', isoTimestampString);
    }

    return tileDataForTimestamp.map((p: any) => ({
        id: p.id, 
        longitude: p.longitude, 
        latitude: p.latitude, 
        currentAqiColour: p.currentAqiColour
    }));
}

// Fetch pollutant records
export async function fetchPollutantData(
    tileId: number, 
    pollutantId: PollutantId
): Promise<PollutantRecord[]> {
    const resp = await fetch(`/mock/${tileId}/${pollutantId}.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load ${pollutantId} data for tile ${tileId}`); 
    }

    return resp.json() as Promise<PollutantRecord[]>;
}

// Fetch tile information
export async function fetchTileInformation(
    tileId: number
): Promise<TileInformation> {
    const resp = await fetch(`/mock/${tileId}/tile-information.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load data for tile ID ${tileId}`); 
    }

    return resp.json() as Promise<TileInformation>;
}

// Fetch tile details (on tile details page)
export async function fetchTileDetails(
    tileId: number
): Promise<TileDetails> {
    const resp = await fetch(`/mock/${tileId}/tile-details.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load Tile details for tile ID ${tileId}`); 
    }

    return resp.json() as Promise<TileDetails>;
}


export function getHealthImpact(
  pollutantId: PollutantId,
  level: number
): string {
  return HealthImpacts[pollutantId]?.[level as 1 | 2 | 3] ?? "Unknown health impact";
}


export async function fetchCurrentAirQualityInfo(
  tileId: number
): Promise<CurrentAirQualityInfo> {
  const resp = await fetch(`/mock/${tileId}/currentAirQualityInfo.json`);
  if (!resp.ok) {
    throw new Error(`Failed to load air quality info for tile ID ${tileId}`);
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
    tileId: number, 
    aqiTypeId: AqiTypeId
): Promise<AqiRecord[]> {
    const resp = await fetch(`/mock/${tileId}/aqi_${aqiTypeId}.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load AQI (${aqiTypeId}) data for tile ${tileId}`); 
    }

    return resp.json() as Promise<AqiRecord[]>;
}

// Fetch health recommendations
export async function fetchHealthRecommendations(
    tileId: number
): Promise<HealthRecommendationRecord[]> {
    const resp = await fetch(`/mock/${tileId}/health_recommendations.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load health recommendation data for tile ${tileId}`); 
    }

    return resp.json() as Promise<HealthRecommendationRecord[]>;
}