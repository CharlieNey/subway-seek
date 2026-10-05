export type * from "./types.ts";

import type { Dataset, LandmarkData, SubwayData } from "./types.ts";

/** Join the two dataset files (the browser fetches them separately). */
export function withLandmarks(subway: SubwayData, landmarks: LandmarkData): Dataset {
  return { ...subway, landmarks: landmarks.kinds, landmarkAttribution: landmarks.meta.attribution };
}

/** Seconds since service-day midnight → "HH:MM" (hours can exceed 23 for after-midnight service). */
export function formatServiceTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
