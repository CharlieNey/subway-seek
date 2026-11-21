/**
 * The hardest stations to hide at (DESIGN.md, Homepage: the two pages off it): every
 * station the hider could reach from each hub, ranked by the questions a strong seeker
 * needs to pin it, from the engine's hardness table (the one the bot hider picks its
 * station from). Static data from scripts/hardness.ts; no timetable, no engine.
 */

import { useEffect, useState } from "react";
import { GAME_NAME } from "../brand.ts";
import { displayName } from "../names.ts";
import { NameTablet } from "../ui/NameTablet.tsx";
import { Bullets, Caption } from "../ui/vocab.tsx";
import data from "./hardness.json";
import "./home.css";

type Band = "easy" | "normal" | "hard" | null;
interface Station {
  name: string;
  routes: string[];
  questions: number | null;
  twins: number;
  band: Band;
}
interface Hub {
  id: string;
  name: string;
  reachable: number;
  byQuestions: Record<string, number>;
  stations: Station[];
}

const HUBS = data.hubs as Hub[];
const ROUTES = data.routes as Record<
  string,
  { letter: string; display: string; color: string; textColor: string; name: string }
>;
const BAND_WORD: Record<Exclude<Band, null>, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};

function bullets(letters: string[]) {
  return letters
    .map((l) => ROUTES[l])
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ id: r.letter, diamond: false, ...r }));
}

/** "7% in 1–3, 14% in 4, 35% in 5–6, 39% in 7–8" */
function spread(h: Hub): string {
  const n = (keys: string[]) => keys.reduce((s, k) => s + (h.byQuestions[k] ?? 0), 0);
  const pct = (x: number) => `${Math.round((100 * x) / h.reachable)}%`;
  return [
    `${pct(n(["1", "2", "3"]))} in 1–3`,
    `${pct(n(["4"]))} in 4`,
    `${pct(n(["5", "6"]))} in 5–6`,
    `${pct(n(["7", "8", "9"]))} in 7–8`,
  ].join(", ");
}

export function Hardest() {
  const [hubId, setHubId] = useState(HUBS[0]?.id ?? "");
  const hub = HUBS.find((h) => h.id === hubId) ?? HUBS[0];
  useEffect(() => {
    document.title = `The hardest stations to hide at · ${GAME_NAME}`;
  }, []);
  if (!hub) return null;
  const hardest = hub.stations.filter((s) => s.questions !== null);
  const unpinned = hub.stations.filter((s) => s.questions === null);
  return (
    <div className="hp">
      <header className="hp-top">
        <div className="hp-wrap">
          <a className="hp-brand" href="/" aria-label={`${GAME_NAME} home`}>
            <i aria-hidden="true" />
            {GAME_NAME}
          </a>
          <nav aria-label="Main">
            <a href="/#how">How it plays</a>
            <a href="/changelog">Changelog</a>
            <a className="keep" href="/play?daily">
              <Caption tone="light">Play today's daily</Caption>
            </a>
          </nav>
        </div>
      </header>
      <main className="hp-wrap">
        <div className="hp-wall sc-tilefield hp-page-wall">
          <div className="hp-wall-tab">
            <NameTablet text="Hard to find" rows={14} maxWidth={620} />
          </div>
          <div className="hp-page-lede">
            <h1>The hardest stations to hide at, measured.</h1>
            <p className="hp-lede">
              The hider leaves a hub at {data.hideStart} and has {data.hideMinutes} minutes on the
              real timetable. For every station they could reach, a strong seeker asks the game's
              questions in the best order from the hub, moving toward what's left. The count is how
              many questions it takes to pin the station. A twin is another station that answers
              every question from that hub the same way, so no question can tell them apart.
            </p>
          </div>
          <div className="hp-hero-wains sc-wains-field" />
        </div>

        <section className="hp-s" id="hubs">
          <div className="hp-s-head">
            <h2>Start from</h2>
            <p>
              The daily picks one of these thirteen hubs by date. The search space depends on it:{" "}
              {HUBS.reduce((m, h) => Math.min(m, h.reachable), 999)} to{" "}
              {HUBS.reduce((m, h) => Math.max(m, h.reachable), 0)} stations within{" "}
              {data.hideMinutes} minutes.
            </p>
          </div>
          <div className="hp-hubs" role="tablist" aria-label="Hub">
            {HUBS.map((h) => (
              <button
                key={h.id}
                type="button"
                role="tab"
                aria-selected={h.id === hub.id}
                className={`sc-btn${h.id === hub.id ? " ink" : ""}`}
                onClick={() => setHubId(h.id)}
              >
                {displayName(h.name)}
              </button>
            ))}
          </div>
        </section>

        <section className="hp-s" id="ranking">
          <div className="hp-s-head">
            <h2>{displayName(hub.name)}</h2>
            <p>
              <b className="n">{hub.reachable}</b> stations reachable by 10:{data.hideMinutes}.
              Questions to pin one: {spread(hub)}. The bot hider picks from the Easy band (3–4
              questions), Normal (5–6, the daily) or Hard (7–8, twins first).
            </p>
          </div>
          <ol className="hp-rank">
            {hardest.map((s, i) => (
              <li
                // Names repeat within a hub (three 86 Sts), so the lines are the identity.
                key={`${s.name}|${s.routes.join("")}`}
                className={`hp-rank-row band-${s.band ?? "none"}`}
              >
                <span className="rk n">{i + 1}</span>
                <span className="nm">
                  <b>{displayName(s.name)}</b>
                  <Bullets routes={bullets(s.routes)} size={16} />
                </span>
                <span className="q">
                  <b className="n">{s.questions}</b> {s.questions === 1 ? "question" : "questions"}
                </span>
                <span className="tw">
                  {s.twins > 0 ? `${s.twins} ${s.twins === 1 ? "twin" : "twins"}` : ""}
                </span>
                <span className="bd">
                  <Caption>{s.band ? BAND_WORD[s.band] : ""}</Caption>
                </span>
              </li>
            ))}
          </ol>
          {unpinned.length > 0 && (
            <p className="hp-rank-note">
              Never pinned by questions alone from here:{" "}
              {unpinned.map((s) => displayName(s.name)).join(", ")}. The seeker has to go and look.
            </p>
          )}
        </section>

        <section className="hp-s" id="method">
          <div className="hp-s-head">
            <h2>How it's measured</h2>
            <p>
              The seeker is the game's own: it asks the question with the most information per
              minute, honours each category's cooldown and the five-minute gap, rides toward the
              stations still possible, and never sees the hider. Thermometers are left out because
              they depend on where the seeker has been. The table is recomputed whenever the
              timetable is re-pinned; this one is for the weekday of {data.serviceDate}. The same
              table is how the bot hider chooses its difficulty, and how the daily's station is
              drawn from the Normal band.
            </p>
          </div>
          <div className="hp-ctas">
            <a className="sc-btn ink hp-btn-lg" href="/play?daily">
              Play today's daily
            </a>
            <a className="sc-btn hp-btn-lg" href="/play?practice&difficulty=hard">
              A Hard practice round
            </a>
          </div>
        </section>
      </main>
      <footer className="hp-foot">
        <div className="band" />
        <div className="sc-wains-field">
          <div className="hp-wrap inner">
            <p className="fine">
              Timetable and station data from the MTA. {GAME_NAME} is a fan-made game and isn't
              affiliated with the MTA.
            </p>
            <nav aria-label="Footer">
              <a href="/">Home</a>
              <a href="/changelog">Changelog</a>
              <a href="/terms.html">Terms, data and privacy</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
