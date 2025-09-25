import { APIGatewayProxyEventV2 } from "aws-lambda";
export type RegionLevel = "tile" | "borough";
export interface FetchPopupInput {
    level: RegionLevel;
    id: number;
}
export interface TilePopupInformation {
    id: number;
    name: string;
    region: string;
    boroughRegion: string | null;
    currentAqi: number | null;
    currentAqiCategoryLevel: number | null;
    currentPm25Level: number | null;
    currentPm10Level: number | null;
    currentNo2Level: number | null;
    currentO3Level: number | null;
    currentSo2Level: number | null;
    currentCoLevel: number | null;
}
export interface BoroughPopupInformation {
    id: number;
    name: string;
    region: string;
    currentAqi: number | null;
    currentAqiCategoryLevel: number | null;
    currentPm25Level: number | null;
    currentPm10Level: number | null;
    currentNo2Level: number | null;
    currentO3Level: number | null;
    currentSo2Level: number | null;
    currentCoLevel: number | null;
    last30dUnhealthyAQIDays: number | null;
    last30dAQIMean: number | null;
    last30dAQIMax: number | null;
    last30dAQIMin: number | null;
}
export declare const handler: (event: APIGatewayProxyEventV2) => Promise<TilePopupInformation | BoroughPopupInformation | {
    error: string;
}>;
//# sourceMappingURL=index.d.ts.map