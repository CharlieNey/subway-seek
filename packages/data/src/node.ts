import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { withLandmarks } from "./index.ts";
import type { Dataset, LandmarkData, SubwayData } from "./types.ts";

export const DATASET_PATH = fileURLToPath(new URL("../dataset/nyc-subway.json", import.meta.url));
export const LANDMARKS_PATH = fileURLToPath(
  new URL("../dataset/nyc-landmarks.json", import.meta.url),
);

export function loadDataset(
  path: string = DATASET_PATH,
  landmarksPath: string = LANDMARKS_PATH,
): Dataset {
  const subway = JSON.parse(readFileSync(path, "utf8")) as SubwayData;
  const landmarks = JSON.parse(readFileSync(landmarksPath, "utf8")) as LandmarkData;
  return withLandmarks(subway, landmarks);
}
