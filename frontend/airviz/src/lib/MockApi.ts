import type { PollutantId } from "./constants";

// Fetch current location
export interface Coordinate {
    latitude: number;
    longitude: number; 
}

export async function fetchCurrentLocation(): Promise<Coordinate> {
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
export interface Location {
    id: number;
    // regionId: number; 
    // name: string; 
    longitude: number; 
    latitude: number; 
    // boroughRegion: string; 
    // zoneRegion: string; 
    // subBoroughRegion: string; 
    // postcodeArea: string; 
    // description: string; 
}

export async function fetchAllLocations(
    // Params not used for now in mock
    currentLongitude: number, 
    currentLatitude: number, 
    radius: number): Promise<Location[]> {
    const resp = await fetch('/mock/locations.json')
    if (!resp.ok) throw new Error("Failed to fetch locations");
    const data = await resp.json();

    return data.map((p: any) => ({
        id: p.id, 
        // regionId: p.regionId, 
        // name: p.name, 
        longitude: p.longitude, 
        latitude: p.latitude, 
        // boroughRegion: p.boroughRegion, 
        // zoneRegion: p.zoneRegion, 
        // subBoroughRegion: p.subBoroughRegion, 
        // postcodeArea: p.postcodeArea, 
        // description: p.description, 
    }));
}

// Fetch pollutant records
export interface PollutantRecord {
    pollutantId: PollutantId; 
    timestamp: string; 
    concentration_value: number;
    unit: string;
}

export async function fetchPollutantData(
    locationId: number, 
    pollutantId: PollutantId
): Promise<PollutantRecord[]> {
    const resp = await fetch(`/mock/${locationId}/${pollutantId}.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load ${pollutantId} data for point ${locationId}`); 
    }

    return resp.json() as Promise<PollutantRecord[]>;
}
