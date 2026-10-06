import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

// Dev only: the component sheet at /sheet, compared by screenshot with the Deck page.
const page =
  import.meta.env.DEV && location.pathname === "/sheet"
    ? import("./Sheet.tsx").then(({ Sheet }) => <Sheet />)
    : Promise.resolve(<App />);

void page.then((el) => createRoot(root).render(<StrictMode>{el}</StrictMode>));
