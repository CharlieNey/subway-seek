/**
 * The station stamp book at /stamps (DESIGN.md, Coming back; proposed 2026-11-27): all
 * 424 station complexes, a square each, ink where you found the hider as the seeker and
 * terra cotta where you hid. Totals for the book, each borough and each line. Kept in
 * this browser (stamps.ts); the list of complexes is built from the dataset at build time.
 */

import book from "virtual:complexes";
import { useEffect, useMemo, useState } from "react";
import { GAME_NAME } from "../brand.ts";
import { displayName } from "../names.ts";
import { bookTotals, loadStamps, type Stamps as StampBook, type Tally } from "../stamps.ts";
import { NameTablet } from "../ui/NameTablet.tsx";
import { Bullets, Caption } from "../ui/vocab.tsx";
import data from "./hardness.json";
import "./home.css";

const BOROUGH: Record<string, string> = {
  M: "Manhattan",
  Bk: "Brooklyn",
  Q: "Queens",
  Bx: "The Bronx",
};
const ROUTES = data.routes as Record<
  string,
  { letter: string; display: string; color: string; textColor: string; name: string }
>;
const bullet = (letter: string) => {
  const r = ROUTES[letter];
  return r ? [{ id: r.letter, diamond: false, ...r }] : [];
};

function Square({ found, hidden, name }: { found: boolean; hidden: boolean; name: string }) {
  const state =
    found && hidden ? "found and hidden in" : found ? "found" : hidden ? "hidden in" : "";
  return (
    <li
      title={state ? `${name}: ${state}` : name}
      aria-label={state ? `${name}, ${state}` : name}
      style={{
        width: 14,
        height: 14,
        background: found
          ? "var(--color-ink)"
          : hidden
            ? "var(--color-terra)"
            : "var(--color-glaze)",
        boxShadow:
          hidden && found
            ? "inset 0 0 0 3px var(--color-terra)"
            : "inset 0 0 0 1px var(--color-grout)",
      }}
    />
  );
}

const of = (t: Tally) => `${t.found} found · ${t.hidden} hidden in · ${t.total} stations`;

export function Stamps() {
  const [stamps, setStamps] = useState<StampBook>({ found: {}, hidden: {} });
  useEffect(() => {
    document.title = `Station stamp book · ${GAME_NAME}`;
    setStamps(loadStamps());
  }, []);
  const totals = useMemo(() => bookTotals(book, stamps), [stamps]);
  const byBorough = useMemo(() => {
    const m = new Map<string, typeof book>();
    for (const c of [...book].sort((a, b) => a[1].localeCompare(b[1]))) {
      if (!m.has(c[2])) m.set(c[2], []);
      m.get(c[2])?.push(c);
    }
    return m;
  }, []);
  const lines = totals.byRoute
    .filter((r) => ROUTES[r.route])
    .sort((a, b) => a.route.localeCompare(b.route, "en", { numeric: true }));
  const stampedNames = (borough: string) =>
    (byBorough.get(borough) ?? [])
      .filter(([id]) => stamps.found[id] || stamps.hidden[id])
      .map(([id, name]) => `${displayName(name)}${stamps.found[id] ? "" : " (hid)"}`);

  return (
    <div className="hp">
      <header className="hp-top">
        <div className="hp-wrap">
          <a className="hp-brand" href="/" aria-label={`${GAME_NAME} home`}>
            <i aria-hidden="true" />
            {GAME_NAME}
          </a>
          <nav aria-label="Main">
            <a href="/#record">Daily seeking record</a>
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
            <NameTablet text="Stamp book" rows={14} maxWidth={620} />
          </div>
          <div className="hp-page-lede">
            <h1>Every station, one stamp at a time.</h1>
            <p className="hp-lede">
              A station is stamped in ink when you find the hider there as the seeker, and in terra
              cotta when you hide there yourself. The book is kept in this browser, like your daily
              record: clearing site data or switching browsers starts a new one.
            </p>
          </div>
          <div className="hp-hero-wains sc-wains-field" />
        </div>

        <section className="hp-s" id="totals">
          <div className="hp-panel">
            <div className="hp-stats">
              <div>
                <b>{totals.found}</b>
                <span>found</span>
              </div>
              <div>
                <b>{totals.hidden}</b>
                <span>hidden in</span>
              </div>
              <div>
                <b>{totals.total}</b>
                <span>stations</span>
              </div>
              <div>
                <b>{lines.filter((l) => l.tally.found === l.tally.total).length}</b>
                <span>lines found end to end</span>
              </div>
            </div>
            {totals.found + totals.hidden === 0 && (
              <p className="hp-first">
                Find a hider in today's daily or a practice round for your first stamp.
              </p>
            )}
          </div>
        </section>

        {[...byBorough].map(([borough, list]) => {
          const t = totals.byBorough.find((b) => b.borough === borough)?.tally;
          const names = stampedNames(borough);
          return (
            <section className="hp-s" key={borough} aria-labelledby={`b-${borough}`}>
              <div className="hp-s-head">
                <h2 id={`b-${borough}`}>{BOROUGH[borough] ?? borough}</h2>
                <p>{t ? of(t) : null}</p>
              </div>
              <ul
                aria-label={`${BOROUGH[borough] ?? borough} stations`}
                style={{ display: "flex", flexWrap: "wrap", gap: 3, listStyle: "none", padding: 0 }}
              >
                {list.map(([id, name]) => (
                  <Square
                    key={id}
                    name={displayName(name)}
                    found={!!stamps.found[id]}
                    hidden={!!stamps.hidden[id]}
                  />
                ))}
              </ul>
              {names.length > 0 && (
                <p className="hp-first" style={{ marginTop: 10 }}>
                  {names.join(" · ")}
                </p>
              )}
            </section>
          );
        })}

        <section className="hp-s" id="lines">
          <div className="hp-s-head">
            <h2>By line</h2>
            <p>A station counts for every line that stops there.</p>
          </div>
          <ul
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: "6px 18px",
              listStyle: "none",
              padding: 0,
            }}
          >
            {lines.map(({ route, tally }) => (
              <li key={route} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bullets routes={bullet(route)} size={20} />
                <span className="n" style={{ fontSize: 14 }}>
                  {tally.found} of {tally.total}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="hp-foot" style={{ marginTop: 56 }}>
        <div className="band" />
        <div className="sc-wains-field">
          <div className="hp-wrap inner">
            <p className="fine">
              Station names from the MTA's open data. {GAME_NAME} is a fan-made game and isn't
              affiliated with the MTA.
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
