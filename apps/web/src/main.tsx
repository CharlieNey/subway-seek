import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary, PageBroke } from "./ErrorBoundary.tsx";
import { migrateStorage } from "./storage.ts";

// Before any page reads storage: move keys saved under the game's former names (storage.ts).
migrateStorage();

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

// The homepage at /, the game at /play (DESIGN.md, Homepage: its doors are links there),
// and "Not in service" anywhere else. Every page is its own chunk, so the homepage never
// downloads the game's map stack (deck.gl, the Google loader, MapLibre).
// Dev only: the component sheet at /sheet, compared by screenshot with the Deck page.
const path = location.pathname.replace(/\/+$/, "") || "/";
const page =
  import.meta.env.DEV && path === "/sheet"
    ? import("./Sheet.tsx").then(({ Sheet }) => <Sheet />)
    : path === "/play"
      ? import("./PlayPage.tsx").then(({ PlayPage }) => <PlayPage />)
      : path === "/" || path === "/index.html"
        ? import("./home/Home.tsx").then(({ Home }) => <Home />)
        : path === "/hardest"
          ? import("./home/Hardest.tsx").then(({ Hardest }) => <Hardest />)
          : path === "/changelog"
            ? import("./home/Changelog.tsx").then(({ Changelog }) => <Changelog />)
            : import("./home/NotFound.tsx").then(({ NotFound }) => <NotFound />);

// What a broken page can promise: the game's round lives on the server, the homepage's
// results in this browser.
const safe =
  path === "/play"
    ? "Your round is kept on the server for 3 minutes, its clock running. Reload to pick it up."
    : "Nothing is lost. Your results are kept in this browser.";

void page.then((el) =>
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary fallback={(error) => <PageBroke error={error} safe={safe} />}>
        {el}
      </ErrorBoundary>
    </StrictMode>,
  ),
);
