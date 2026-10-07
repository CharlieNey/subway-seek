import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ErrorBoundary, PageBroke } from "./ErrorBoundary.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

// The homepage at /, the game at /play (DESIGN.md, Homepage: its doors are links there).
// Dev only: the component sheet at /sheet, compared by screenshot with the Deck page.
const path = location.pathname.replace(/\/+$/, "") || "/";
const page =
  import.meta.env.DEV && path === "/sheet"
    ? import("./Sheet.tsx").then(({ Sheet }) => <Sheet />)
    : path === "/play"
      ? Promise.resolve(<App />)
      : import("./home/Home.tsx").then(({ Home }) => <Home />);

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
