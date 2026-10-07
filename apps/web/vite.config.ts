import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * MapLibre's worker (imported with `?url` in MapView.tsx) is an ES module that imports
 * `./maplibre-gl-shared.mjs` from its own folder. Dev serves the real dist folder, so that
 * resolves; in a build, emit the shared chunk next to the worker asset under its exact name.
 */
function maplibreWorkerChunk(): Plugin {
  const shared = createRequire(import.meta.url).resolve("maplibre-gl/dist/maplibre-gl-shared.mjs");
  return {
    name: "maplibre-worker-chunk",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "assets/maplibre-gl-shared.mjs",
        source: readFileSync(shared),
      });
    },
  };
}

/**
 * The timetable's size as the browser decodes it. Hosting compresses the download, so its
 * Content-Length can't measure progress; this can (DESIGN.md, Loading: progress is real).
 */
const datasetBytes = statSync(
  createRequire(import.meta.url).resolve("@stand-clear/data/dataset.json"),
).size;

export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreWorkerChunk()],
  define: { "import.meta.env.VITE_DATASET_BYTES": JSON.stringify(datasetBytes) },
  server: { port: 5173 },
});
