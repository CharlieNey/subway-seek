/**
 * The homepage (DESIGN.md, Homepage; the homepage mock). One job: get the visitor into
 * today's daily in one click. The page is a platform: the name tablet is the wall, the
 * modes are a departures board, the footer is the wainscot. It never connects to a round
 * (the server starts one the moment a page connects); its doors are links to /play.
 */

import {
  DAILY_EPOCH,
  dailyNumber,
  nyDate,
  RECONNECT_GRACE_MS,
  SEEKER_LEVELS,
} from "@subway-seek/engine";
import { useEffect, useState } from "react";
import { hm } from "../ask.ts";
import { GAME_NAME } from "../brand.ts";
import { cn } from "../cn.ts";
import { loadSession, loadWorld, useGame } from "../game.ts";
import { type DailyResult, loadReplay, loadResults } from "../history.ts";
import { displayName, formatDay } from "../names.ts";
import { REPLAY_REAL_SECONDS } from "../replay.ts";
import { routesFor } from "../routes.ts";
import { type StreetOff, useStreet } from "../streetMode.ts";
import { CopyButton } from "../ui/CopyButton.tsx";
import { FAMILY_NAME } from "../ui/family.ts";
import { NameTablet } from "../ui/NameTablet.tsx";
import { Bullets, Caption, FamilySquare } from "../ui/vocab.tsx";
import { type DailyFacts, useDailyFacts } from "./daily.ts";
import { HideHistory } from "./HideHistory.tsx";
import { HowItPlays } from "./HowItPlays.tsx";
import { LiveMap } from "./LiveMap.tsx";
import {
  familiesOf,
  friendLine,
  heroState,
  hoursMinutes,
  minutesToNextDaily,
  monthTiles,
  recordStats,
} from "./record.ts";
import "./home.css";

/** A button that copies, saying "Copied" for a moment; quiet if the clipboard says no. */
const foundLine = (r: DailyResult) =>
  r.found ? `found in ${Math.round(r.elapsedSeconds / 60)} min` : "not found";

function useNextDaily() {
  const [min, setMin] = useState(() => minutesToNextDaily(new Date()));
  useEffect(() => {
    const id = setInterval(() => setMin(minutesToNextDaily(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return hoursMinutes(min);
}

/** Under the doors, when rounds on this page end at the station (streetMode.ts). */
function homeStreetLine(off: StreetOff | null): string | null {
  if (off === "demo")
    return "Rounds here end when you reach the hider's station, on the free map. The full game goes on to search the street in Street View.";
  if (off === "phone")
    return "On a phone, rounds end when you reach the hider's station. On a computer they go on to search the street in Street View.";
  if (off === "refusedToday" || off === "refused")
    return "Google's map is resting until tomorrow, so today's rounds end at the station, on the free map.";
  return null;
}

export function Home() {
  const date = nyDate(new Date());
  const today = { date, number: dailyNumber(date) };
  const facts = useDailyFacts();
  const world = useGame((s) => s.world);
  const [results] = useState(loadResults);
  const [replay] = useState(loadReplay);
  const hero = heroState(results, today, loadSession(), Date.now(), RECONNECT_GRACE_MS);
  const friend = friendLine(location.search, today.number);
  const next = useNextDaily();
  useEffect(() => {
    document.title = GAME_NAME;
    void loadWorld();
  }, []);
  const start = facts?.start == null ? undefined : world?.ds.complexes[facts.start];
  const done = hero.kind === "done" ? hero.result : null;
  const watch = replay?.date === date ? "/play?replay" : null;
  const off = useStreet((s) => s.off);
  const streetLine = homeStreetLine(off);

  return (
    <div className="hp">
      <header className="hp-top">
        <div className="hp-wrap">
          <a className="hp-brand" href="/" aria-label={`${GAME_NAME} home`}>
            <i aria-hidden="true" />
            {GAME_NAME}
          </a>
          <nav aria-label="Main">
            <a href="#how">How it plays</a>
            <a href="#record">Daily seeking record</a>
            <a className="keep" href="#modes">
              <Caption tone="light">
                Daily <span className="n">#{today.number}</span>
              </Caption>
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        <div className="hp-wrap hp-hero">
          {friend && <p className="hp-friend">{friend}</p>}
          <div className="hp-wall sc-tilefield">
            <div className="hp-wall-tab">
              <NameTablet text={GAME_NAME} rows={14} maxWidth={760} />
            </div>
            <div className="hp-hero-grid">
              <div>
                <h1>Hide and seek on the real New York subway.</h1>
                <p className="hp-lede">
                  {off === null
                    ? "A hider went underground at 10:00 and got off somewhere. Ride the real timetable, ask questions that rule stations out, then come up and find them on the street."
                    : "A hider went underground at 10:00 and got off somewhere. Ride the real timetable and ask questions that rule stations out, until you reach their station."}
                </p>
                <div className="hp-ctas">
                  {done ? (
                    <>
                      <span className="sc-btn ink hp-btn-lg" style={{ cursor: "default" }}>
                        Today's done · {foundLine(done)}
                      </span>
                      {watch && (
                        <a className="sc-btn" href={watch}>
                          Watch replay
                        </a>
                      )}
                      <CopyButton text={done.share} label="Copy result" />
                    </>
                  ) : (
                    <>
                      <a className="sc-btn ink hp-btn-lg" href="/play?daily">
                        <span>
                          {hero.kind === "resume" ? "Resume daily" : "Play today's daily"} ·{" "}
                          <span className="n">#{today.number}</span>
                        </span>
                      </a>
                      <a className="hp-alt" href="/play?practice">
                        or a practice round
                      </a>
                    </>
                  )}
                </div>
                {streetLine && <p className="hp-street-off">{streetLine}</p>}
                {/* A first visit, or any phone: watch a whole round in 25 s before playing. */}
                {facts?.yesterday && (
                  <div
                    className={cn(
                      "hp-phone hp-phone-note",
                      Object.keys(results).length === 0 && "first",
                    )}
                  >
                    <b>New here?</b>Watch yesterday's daily played start to finish in{" "}
                    {REPLAY_REAL_SECONDS} seconds.
                    <div className="row">
                      <a className="sc-btn" href="/play?replay=yesterday">
                        Watch yesterday's daily
                      </a>
                      <a className="sc-btn" href="/hardest">
                        Hardest stations
                      </a>
                    </div>
                  </div>
                )}
                <div className="hp-meta">
                  <span>
                    <b>Daily #{today.number}</b> · {formatDay(date)}
                  </span>
                  <span>Everyone hunts the same hidden station</span>
                  {start && facts && (
                    <span>
                      Starts at <b>{displayName(start.name)}</b>,{" "}
                      {hm(facts.seekStart).padStart(5, "0")}
                    </span>
                  )}
                </div>
              </div>
              <LiveMap facts={facts} />
            </div>
            <div className="hp-hero-wains sc-wains-field" />
          </div>
        </div>

        <div className="hp-wrap">
          <Departures today={today.number} done={done} next={next} watch={watch} />

          <section className="hp-s" id="how">
            <div className="hp-s-head">
              <h2>How it plays</h2>
              <p>
                A round runs like a strip map, with three stops. Seeking lasts up to 2 game-hours,
                about 20 real minutes, because the clock runs at 6×.
              </p>
            </div>
            <HowItPlays />
          </section>

          <section className="hp-s" id="record">
            <div className="hp-s-head">
              <h2>Daily seeking record</h2>
              <p>Kept in this browser. Every day you play sets a tile.</p>
            </div>
            <div className="hp-record">
              <Record results={results} today={date} />
              {facts?.yesterday && (
                <Yesterday
                  y={facts.yesterday}
                  result={results[facts.yesterday.date]}
                  watch={replay?.date === facts.yesterday.date ? "/play?replay" : null}
                />
              )}
            </div>
          </section>
          <HideHistory />
        </div>
      </main>

      <footer className="hp-foot">
        <div className="band" />
        <div className="sc-wains-field">
          <div className="hp-wrap inner">
            <p className="fine">
              Timetable and station data from the MTA. Map and Street View imagery from Google. The
              places the questions ask about © OpenStreetMap contributors and NYC Parks. {GAME_NAME}
              is a fan-made game and isn't affiliated with the MTA. Daily{" "}
              <b className="n">#{today.number}</b>, running since {formatDay(DAILY_EPOCH)}.
            </p>
            <nav aria-label="Footer">
              <a href="#how">How it plays</a>
              <a href="#record">Daily seeking record</a>
              <a href="/play?practice">Practice</a>
              <a href="/hardest">Hardest stations</a>
              <a href="/changelog">Changelog</a>
              <a href="/terms.html">Terms, data and privacy</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** The modes as a departures board; the ones not built yet are "Not in service". */
function Departures({
  today,
  done,
  next,
  watch,
}: {
  today: number;
  done: DailyResult | null;
  next: string;
  watch: string | null;
}) {
  const daily = (
    <div className="hp-dep" key="daily">
      <span className="mk" aria-hidden="true">
        {today}
      </span>
      <div>
        <h3>Today's daily</h3>
        <p>One hidden station for everyone, from the same start. Your first finish counts.</p>
      </div>
      {done ? (
        <span className="st">
          Done · {done.found ? `${Math.round(done.elapsedSeconds / 60)} min` : "not found"}
        </span>
      ) : (
        <span className="st now">
          <i />
          Now boarding
        </span>
      )}
      {done ? (
        watch ? (
          <a className="sc-btn go" href={watch}>
            Watch replay
          </a>
        ) : (
          <span />
        )
      ) : (
        <a className="sc-btn ink go" href="/play?daily">
          Play
        </a>
      )}
    </div>
  );
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const practice = (
    <div className="hp-dep" key="practice">
      <span
        className="mk"
        aria-hidden="true"
        style={{ "--mk": "var(--color-buff)" } as React.CSSProperties}
      >
        P
      </span>
      <div>
        <h3>Practice</h3>
        <p>A random hidden station, as often as you like. Nothing is recorded.</p>
      </div>
      <span className="st">Any time</span>
      <a className={done ? "sc-btn ink go" : "sc-btn go"} href="/play?practice">
        Play
      </a>
    </div>
  );
  return (
    <section className="hp-s" id="modes">
      <div className="hp-s-head">
        <h2>Departures</h2>
        <p>Four ways to play.</p>
      </div>
      <div className="hp-board">
        <div className="hp-board-hd">
          <Caption>↓ All modes</Caption>
          <span className="clock">
            Next daily in{" "}
            <Caption tone="light">
              <span className="n">{next}</span>
            </Caption>
          </span>
        </div>
        {/* Once today's daily is done, practice moves up. */}
        {done ? [practice, daily] : [daily, practice]}
        <div className="hp-dep">
          <span
            className="mk"
            aria-hidden="true"
            style={{ "--mk": "var(--color-terra)" } as React.CSSProperties}
          >
            H
          </span>
          <div>
            <h3>You hide</h3>
            <p>You ride and hide, a bot seeks. Watch the net close around you.</p>
            {/* The buttons wrap, and the hint sits under them: at 360 px they ran into Play. */}
            <div className="mt-2 flex flex-wrap gap-1">
              {(["easy", "normal", "hard"] as const).map((d) => (
                <button
                  type="button"
                  className={`sc-btn sm${difficulty === d ? " ink" : ""}`}
                  key={d}
                  onClick={() => setDifficulty(d)}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
            <p>Searches with {SEEKER_LEVELS[difficulty].endgameAt} stations left.</p>
          </div>
          <span className="st">Now boarding</span>
          <a className="sc-btn go" href={`/play?hide&difficulty=${difficulty}`}>
            Play
          </a>
        </div>
        <div className="hp-dep off">
          <span
            className="mk"
            aria-hidden="true"
            style={{ "--mk": "var(--color-faience)" } as React.CSSProperties}
          >
            2
          </span>
          <div>
            <h3>Play a friend</h3>
            <p>
              One round each way: one of you hides, the other seeks, then you swap. Longest hide
              wins.
            </p>
          </div>
          <span className="st off">Not in service</span>
          <span className="sc-btn go" aria-disabled="true">
            Soon
          </span>
        </div>
      </div>
    </section>
  );
}

const MONTH = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

/** Stats and the tile wall: one tile per day, from this browser's results. */
function Record({ results, today }: { results: Record<string, DailyResult>; today: string }) {
  const stats = recordStats(results);
  const tiles = monthTiles(results, today);
  return (
    <div className="hp-panel">
      <div className="hp-stats">
        <div>
          <b>{stats.played}</b>
          <span>{stats.played === 1 ? "daily" : "dailies"} played</span>
        </div>
        <div>
          <b>{stats.found}</b>
          <span>found</span>
        </div>
        <div>
          <b>{stats.streak}</b>
          <span>day streak</span>
        </div>
        <div>
          <b>{stats.fastest === null ? "–" : `${Math.round(stats.fastest / 60)} min`}</b>
          <span>fastest find</span>
        </div>
      </div>
      {stats.played === 0 && <p className="hp-first">Play today's daily to set your first tile.</p>}
      <div className="hp-month">
        <div className="hp-month-hd">
          <b>{MONTH(today)}</b>
          <span className="n" style={{ fontSize: 12, color: "var(--color-ink-2)" }}>
            Dailies began Oct 5
          </span>
        </div>
        <div className="hp-dow" aria-hidden="true">
          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="hp-cal">
          {tiles.map((t, i) => {
            if (t.day === null)
              // biome-ignore lint/suspicious/noArrayIndexKey: the month's tiles are positional
              return <span key={i} className="hp-day pre" aria-hidden="true" />;
            const label = `${formatDay(t.date ?? today)}: ${
              t.kind === "pre"
                ? "before dailies began"
                : t.kind === "found" || t.kind === "fast"
                  ? `found in ${t.minutes} min`
                  : t.kind === "miss"
                    ? "not found"
                    : t.kind === "future"
                      ? "to come"
                      : t.today
                        ? "today, not played yet"
                        : "not played"
            }`;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the month's tiles are positional
                key={i}
                className={`hp-day ${t.kind}${t.today ? " today" : ""}`}
                title={label}
                role="img"
                aria-label={label}
              >
                <span className="d">{t.day}</span>
                {t.minutes !== null ? (
                  <span className="t">{t.minutes}</span>
                ) : t.today && t.kind === "skip" ? (
                  <span className="t">TODAY</span>
                ) : null}
              </span>
            );
          })}
        </div>
        <div className="hp-legend">
          <span>
            <i style={{ background: "var(--color-ink)" }} />
            Found, with time
          </span>
          <span>
            <i
              style={{
                background: "var(--color-ink)",
                boxShadow: "inset 0 0 0 2px var(--color-gold)",
              }}
            />
            Under 45 min
          </span>
          <span>
            <i
              style={{
                background: "var(--color-glaze-hi)",
                backgroundImage:
                  "linear-gradient(135deg,transparent 45%,var(--color-terra) 45% 55%,transparent 55%)",
              }}
            />
            Not found
          </span>
          <span>
            <i
              style={{
                background: "var(--color-glaze-hi)",
                boxShadow: "inset 0 0 0 1px var(--color-grout)",
              }}
            />
            Not played
          </span>
        </div>
      </div>
    </div>
  );
}

/** Yesterday's hider, revealed now its day is over, with your result if you played. */
function Yesterday({
  y,
  result,
  watch,
}: {
  y: NonNullable<DailyFacts["yesterday"]>;
  result: DailyResult | undefined;
  watch: string | null;
}) {
  const world = useGame((s) => s.world);
  const hider = world?.ds.complexes[y.hider];
  const families = result ? familiesOf(result) : [];
  return (
    <div className="hp-panel hp-yday">
      <h3>Yesterday's hider</h3>
      <p className="sub">
        Daily #{y.number} · {formatDay(y.date)}. Revealed now that the day is over.
      </p>
      <div className="tabwrap sc-tilefield">
        {hider ? (
          <>
            <NameTablet text={displayName(hider.name)} tile={3.1} maxWidth={360} />
            {world && <Bullets routes={routesFor(world, hider.routes)} size={20} />}
          </>
        ) : (
          <span className="hp-first">Loading the timetable…</span>
        )}
      </div>
      {result ? (
        <>
          <dl className="res">
            <dt>You</dt>
            <dd>
              {result.found ? (
                <>
                  Found it in <b className="n">{Math.round(result.elapsedSeconds / 60)} min</b>
                </>
              ) : (
                "Not found"
              )}{" "}
              · {result.questions} {result.questions === 1 ? "question" : "questions"}
            </dd>
            {families.length > 0 && (
              <>
                <dt>Asked</dt>
                <dd>
                  <span className="hp-trail">
                    {families.map((f, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: the trail is positional
                      <FamilySquare key={i} family={f} size={12} />
                    ))}
                  </span>
                  {[...new Set(families)].map((f) => FAMILY_NAME[f].toLowerCase()).join(", ")}
                </dd>
              </>
            )}
            <dt>Score</dt>
            <dd>
              Hider score <b className="n">{hm(result.scoreSeconds)}</b>
            </dd>
          </dl>
          <div className="acts">
            {watch && (
              <a className="sc-btn ink" href={watch}>
                Watch replay
              </a>
            )}
            <CopyButton text={result.share} label="Copy result" />
            <a className="hp-alt" href="/play?replay=yesterday">
              Watch the bot play it
            </a>
          </div>
        </>
      ) : (
        <>
          <p className="hp-first">You didn't play it.</p>
          <div className="acts">
            <a className="sc-btn" href="/play?replay=yesterday">
              Watch the bot play it
            </a>
          </div>
        </>
      )}
    </div>
  );
}
