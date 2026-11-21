import { lazy, Suspense, useEffect, useState } from "react";
import { GAME_NAME } from "./brand.ts";
import { NameTablet } from "./ui/NameTablet.tsx";
import "./playLayout.css";

const Game = lazy(() => import("./App.tsx").then(({ App }) => ({ default: App })));
// The widest board is 380 px; leave at least 480 px for the map and its controls.
const COMPUTER_WIDTH = "(min-width: 860px)";

export function PlayPage() {
  const [wide, setWide] = useState(() => matchMedia(COMPUTER_WIDTH).matches);
  const [tryAnyway, setTryAnyway] = useState(() =>
    new URLSearchParams(location.search).has("tryAnyway"),
  );
  // A replay is only the map and its log: it works on a phone, stacked (playLayout.css).
  const [replay] = useState(() => new URLSearchParams(location.search).has("replay"));
  const [started, setStarted] = useState(wide || tryAnyway || replay);
  const allowed = wide || tryAnyway || replay;

  useEffect(() => {
    const media = matchMedia(COMPUTER_WIDTH);
    const changed = () => setWide(media.matches);
    media.addEventListener("change", changed);
    changed();
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (allowed) setStarted(true);
  }, [allowed]);

  function proceed() {
    const url = new URL(location.href);
    url.searchParams.set("tryAnyway", "1");
    history.replaceState(null, "", url);
    setTryAnyway(true);
    setStarted(true);
  }

  return (
    <>
      {!allowed && (
        <main className="sc-computer-page">
          <div className="sc-computer-wall sc-tilefield">
            <a href="/" aria-label={`${GAME_NAME} home`}>
              <NameTablet text={GAME_NAME} rows={14} maxWidth={540} />
            </a>
            <h1>Play on a computer</h1>
            <p>
              {GAME_NAME} is played on a computer. The map, Street View and the board need room side
              by side. This screen is too narrow to play comfortably.
            </p>
            {started && <p>Your round's clock keeps running while this notice is open.</p>}
            <a className="sc-btn ink" href="/">
              Back to the homepage
            </a>
            <button type="button" className="sc-computer-escape" onClick={proceed}>
              Try anyway
            </button>
          </div>
        </main>
      )}
      {/* Keep an opened game mounted through resizes: no new round or billed map load. */}
      {started && (
        <div hidden={!allowed}>
          <Suspense fallback={<p className="p-6">Opening {GAME_NAME}…</p>}>
            <Game />
          </Suspense>
        </div>
      )}
    </>
  );
}
