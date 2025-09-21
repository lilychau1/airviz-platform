import type { Coordinates } from "../constants";

export function filterByTimeRange<T extends { timestamp: string }>(
    data: T[],
    fromTimestamp: number,
    toTimestamp: number
): T[] {
    return data.filter(d => {
        const t = new Date(d.timestamp).getTime();
        return t >= fromTimestamp && t <= toTimestamp;
    });
}

export async function fetchCurrentLocation(): Promise<Coordinates>{
    const fallback: Coordinates = {
        longitude: -0.101923,
        latitude: 51.503758,
    }; 

    // Check if location is already stored
    const cached = localStorage.getItem("userLocation");
    if (cached) {
        try {
            return JSON.parse(cached);
        } catch {
        }
    }

    if (!("geolocation" in navigator)) {
        console.warn("Geolocation not supported, using fallback location.");
        return fallback;
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                // Obtain location lat and long
                const coords = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                };

                // Save to localStorage
                localStorage.setItem("userLocation", JSON.stringify(coords));
                
                resolve(coords);
            }, 
            (error) => {
                console.warn("Permission denied or error getting location:", error);
                resolve(fallback);
            }, 
            {
                enableHighAccuracy: true, 
                timeout: 5000, 
                maximumAge: 0, 
            }
        );
    });
}