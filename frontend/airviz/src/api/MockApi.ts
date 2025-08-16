import type { PollutantId, Coordinate, PollutantRecord, Tile } from "../lib/constants";

// Fetch current location


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
export async function fetchAllTiles(
    // Params not used for now in mock
    currentLongitude: number, 
    currentLatitude: number, 
    radius: number): Promise<Tile[]> {
    const resp = await fetch('/mock/locations.json')
    if (!resp.ok) throw new Error("Failed to fetch locations");
    const data = await resp.json();

    return data.map((p: any) => ({
        id: p.id, 
        longitude: p.longitude, 
        latitude: p.latitude, 
        currentAqiColour: p.currentAqiColour
    }));
}

// Fetch pollutant records
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
