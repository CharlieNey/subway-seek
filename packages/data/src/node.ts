import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Dataset } from "./types.ts";

export const DATASET_PATH = fileURLToPath(new URL("../dataset/nyc-subway.json", import.meta.url));

export function loadDataset(path: string = DATASET_PATH): Dataset {
  return JSON.parse(readFileSync(path, "utf8")) as Dataset;
}
