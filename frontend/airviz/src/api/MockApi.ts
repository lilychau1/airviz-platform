import type { PollutantId, Coordinate, PollutantRecord, Tile, TileInformation } from "../lib/constants";

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
    const resp = await fetch('/mock/tiles.json')
    if (!resp.ok) throw new Error("Failed to fetch tiles");
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
    tileId: number, 
    pollutantId: PollutantId
): Promise<PollutantRecord[]> {
    const resp = await fetch(`/mock/${tileId}/${pollutantId}.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load ${pollutantId} data for point ${tileId}`); 
    }

    return resp.json() as Promise<PollutantRecord[]>;
}

// Fetch tile information
export async function fetchTileInformation(
    tileId: number
): Promise<TileInformation> {
    const resp = await fetch(`/mock/${tileId}/tile-information.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load Tile ID ${tileId} data for point ${tileId}`); 
    }

    return resp.json() as Promise<TileInformation>;
}
