import type { PollutantId } from "./constants";

export interface PollutantRecord {
    time: string; 
    value: number;
}

export async function fetchPollutantData(
    pointId: number, 
    pollutantId: PollutantId
): Promise<PollutantRecord[]> {
    const resp = await fetch(`/mock/point-${pointId}/${pollutantId}.json`); 
    if (!resp.ok) {
        throw new Error(`Failed to load ${pollutantId} data for point ${pointId}`); 
    }

    return resp.json() as Promise<PollutantRecord[]>;
}
