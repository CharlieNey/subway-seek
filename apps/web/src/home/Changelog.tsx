/**
 * What changed (DESIGN.md, Homepage: the two pages off it). The daily's number and the
 * timetable's day at the top, then the entries, newest first.
 */

import { DAILY_EPOCH, dailyNumber, nyDate } from "@stand-clear/engine";
import { useEffect } from "react";
import { GAME_NAME } from "../brand.ts";
import { formatDay } from "../names.ts";
import { NameTablet } from "../ui/NameTablet.tsx";
import { Caption } from "../ui/vocab.tsx";
import { CHANGELOG } from "./changelog.ts";
import data from "./hardness.json";
import "./home.css";

export function Changelog() {
  const today = nyDate(new Date());
  useEffect(() => {
    document.title = `Changelog · ${GAME_NAME}`;
  }, []);
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
            <a href="/hardest">Hardest stations</a>
            <a className="keep" href="/play?daily">
              <Caption tone="light">Play today's daily</Caption>
            </a>
          </nav>
        </div>
      </header>
      <main className="hp-wrap">
        <div className="hp-wall sc-tilefield hp-page-wall">
          <div className="hp-wall-tab">
            <NameTablet text="Changelog" rows={14} maxWidth={560} />
          </div>
          <div className="hp-page-lede">
            <h1>What changed.</h1>
            <p className="hp-lede">
              Daily <b className="n">#{dailyNumber(today)}</b> today, {formatDay(today)}. Dailies
              started on {formatDay(DAILY_EPOCH)}. The game runs on the MTA timetable for{" "}
              {formatDay(data.serviceDate)}, re-pinned about monthly.
            </p>
          </div>
          <div className="hp-hero-wains sc-wains-field" />
        </div>
        {CHANGELOG.map((e) => (
          <section className="hp-s hp-log" key={e.date}>
            <div className="hp-s-head">
              <h2>
                <span className="hp-eyebrow">{formatDay(e.date)}</span>
                {e.title}
              </h2>
              <ul>
                {e.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </main>
      <footer className="hp-foot">
        <div className="band" />
        <div className="sc-wains-field">
          <div className="hp-wrap inner">
            <p className="fine">
              {GAME_NAME} is a fan-made game and isn't affiliated with the MTA or with Jet Lag: The
              Game. The deck, the look and the rules are its own; the mechanics are the show's.
            </p>
            <nav aria-label="Footer">
              <a href="/">Home</a>
              <a href="/hardest">Hardest stations</a>
              <a href="/terms.html">Terms, data and privacy</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
