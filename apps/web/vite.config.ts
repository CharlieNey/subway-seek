import { readFileSync } from "node:fs";
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

export default defineConfig({
  plugins: [react(), tailwindcss(), maplibreWorkerChunk()],
  server: { port: 5173 },
});
