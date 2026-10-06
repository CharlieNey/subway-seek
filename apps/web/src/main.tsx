import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

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

void page.then((el) => createRoot(root).render(<StrictMode>{el}</StrictMode>));
