/**
 * The result (DESIGN.md, Sidebar › Result; the Deck page, part four): a gold "Found"
 * tablet (or "Time's up"), the hider's station as its own tablet, the three numbers, the
 * score tally bar, the daily stats line, then Watch replay in ink with Share and Practice
 * round in white. Practice takes a difficulty: three Buttons, the chosen one ink.
 */
import {
  DIFFICULTIES,
  type Difficulty,
  questionBonusSeconds,
  type SoloView,
} from "@stand-clear/engine";
import { useEffect, useState } from "react";
import { hm, type TallyTile, tallyTiles } from "./ask.ts";
import { reducedMotion, useMotion } from "./clearings.ts";
import { hubName, useGame, useGamePick, type World } from "./game.ts";
import { HandReveal } from "./HiderCards.tsx";
import { dailyStats } from "./history.ts";
import { displayName } from "./names.ts";
import { useReplay } from "./replay.ts";
import { routesFor } from "./routes.ts";
import { shareText } from "./share.ts";
import { FAMILY_COLORS } from "./ui/family.ts";
import { NameTablet } from "./ui/NameTablet.tsx";
import { Bullets, Button, Line } from "./ui/vocab.tsx";
import { LINES, lineFor, roundKey } from "./voice.ts";

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};
const DIFFICULTY_HINT: Record<Difficulty, string> = {
  easy: "A station 3–4 good questions find, and the hider plays no curses.",
  normal: "5–6 questions, like the daily. Curses once you're closing in.",
  hard: "7–8 questions, often a station with a look-alike. Curses from the first ride.",
};

/** Start a round; confirms before leaving one in progress. */
export function useNewRound() {
  const { view, send } = useGamePick("view", "send");
  return (mode: "daily" | "practice" | "hide", difficulty?: Difficulty) => {
    const inProgress = view && !view.result && view.asked.length > 0;
    if (inProgress && !window.confirm("Leave this round? It won't count.")) return;
    send(mode !== "daily" ? { type: "newRound", mode, difficulty } : { type: "newRound", mode });
  };
}

export function Numbers({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2.5 grid w-full grid-cols-3 border-t-2 border-ink">
      {items.map(([value, label], i) => (
        <div
          key={label}
          className={
            i > 0 ? "py-2 pl-2.5 shadow-[inset_1px_0_0_var(--color-grout)]" : "py-2 pr-1.5"
          }
        >
          <b
            className={`block leading-[1.15] font-extrabold tabular-nums ${i === 0 ? "text-[27px]" : "text-[20px]"}`}
          >
            {value}
          </b>
          <span className="block text-[11px] leading-[1.3] text-ink-2">{label}</span>
        </div>
      ))}
    </div>
  );
}

/** The Found tablet sets over 900 ms; the tally follows it (one choreography at a time). */
const FOUND_SET_MS = 900;
const TALLY_STEP_MS = 40;

/** Whether the round ended while you watched, so its result sets rather than just being there. */
function useEndedLive(): boolean {
  const ended = useMotion((s) => s.ended);
  const [live] = useState(
    () => ended !== null && performance.now() - ended < 4000 && !reducedMotion(),
  );
  return live;
}

/**
 * How many of the tally's tiles have set: left to right at 40 ms each, after `delay`
 * (DESIGN.md, Motion › Score tally). All of them at once if it isn't playing.
 */
function useTallyCount(total: number, play: boolean, delay: number): number {
  const [n, setN] = useState(play ? 0 : total);
  useEffect(() => {
    if (!play) return;
    const start = performance.now() + delay;
    const id = setInterval(() => {
      const k = Math.max(0, Math.floor((performance.now() - start) / TALLY_STEP_MS) + 1);
      setN(Math.min(total, k));
      if (k >= total) clearInterval(id);
    }, TALLY_STEP_MS / 2);
    return () => clearInterval(id);
  }, [total, play, delay]);
  return n;
}

/** The score as tiles, one per 5 game-min: where it came from, not just the number. */
export function Tally({
  tiles,
  play,
  delay,
}: {
  tiles: TallyTile[];
  play: boolean;
  delay: number;
}) {
  return (
    <div
      className="mt-2.5 flex flex-wrap gap-px bg-grout p-px"
      role="img"
      aria-label="The score, in 5-minute tiles"
    >
      {tiles.map((tile, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional
          key={i}
          className={play ? "block h-2.5 w-2.5 sc-anim-set" : "block h-2.5 w-2.5"}
          style={{
            background:
              tile === "ink"
                ? "var(--color-ink)"
                : tile === "gold"
                  ? "var(--color-gold)"
                  : FAMILY_COLORS[tile].fill,
            animationDelay: play ? `${delay + i * TALLY_STEP_MS}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}

/** Share the result: a replayed daily shares the result that counts. "Copied" for 2 s. */
export function shareFor(
  world: World,
  view: SoloView,
  results: ReturnType<typeof useGame.getState>["results"],
  alreadyPlayed: boolean,
) {
  const counted = view.daily && alreadyPlayed ? results[view.daily.date]?.share : undefined;
  const share = () => {
    const text = counted ?? shareText(view, hubName(world, view), location.origin);
    const copied = () => {
      useGame.setState({ notice: "Copied" });
      setTimeout(() => {
        if (useGame.getState().notice === "Copied") useGame.setState({ notice: null });
      }, 2000);
    };
    navigator.clipboard
      .writeText(text)
      .then(copied)
      .catch(() => window.prompt("Copy your result:", text));
  };
  return { share, counted };
}

export function ResultCard({ world }: { world: World }) {
  const { view, busy, results, alreadyPlayed } = useGamePick(
    "view",
    "busy",
    "results",
    "alreadyPlayed",
  );
  const newRound = useNewRound();
  const [difficulty, setDifficulty] = useState<Difficulty>(view?.difficulty ?? "normal");
  const live = useEndedLive();
  const tiles = view?.result ? tallyTiles(view) : [];
  const tallyDelay = view?.result?.kind === "found" ? FOUND_SET_MS : 0;
  const tallied = useTallyCount(tiles.length, live, tallyDelay);
  if (!view?.result) return null;
  const hider = view.hider === null ? undefined : world.ds.complexes[view.hider];
  const elapsed = view.result.at - view.seekStart;
  const kind = view.result.kind;
  const stats = dailyStats(results);
  const questionMin = questionBonusSeconds(view.asked) / 60;
  const { share } = shareFor(world, view, results, alreadyPlayed);
  return (
    <div className="flex flex-col items-center gap-2 border-b border-grout px-4 pt-3.5 pb-3">
      <NameTablet
        text={kind === "found" ? "Found" : kind === "timeout" ? "Time's up" : "Gave up"}
        style={kind === "found" ? "irt-gold" : "irt"}
        width={kind === "found" ? 170 : 210}
        setMs={live && kind === "found" ? FOUND_SET_MS : undefined}
      />
      {/* The conductor (Voice): last stop on a find; service ended when time runs out. */}
      {kind === "found" && lineFor(roundKey(view), "found", view.result.at) && (
        <Line>{LINES.found}</Line>
      )}
      {kind === "timeout" && lineFor(roundKey(view), "timeUp", view.result.at) ? (
        <div className="mt-1.5">
          <Line>{LINES.timeUp}</Line>
        </div>
      ) : (
        hider && <p className="mt-1.5 text-[12.5px] text-ink-2">The hider was at</p>
      )}
      {hider && <NameTablet text={displayName(hider.name)} tile={3.1} maxWidth={320} />}
      <div className="flex flex-wrap items-center justify-center gap-2 text-[12.5px] text-ink-2">
        {hider && <Bullets routes={routesFor(world, hider.routes)} size={18} />}
        <span>
          {view.daily
            ? `Daily #${view.daily.number}`
            : `Practice round${view.difficulty === "normal" ? "" : ` · ${DIFFICULTY_LABEL[view.difficulty]}`}`}
        </span>
      </div>
      <Numbers
        items={[
          [hm(elapsed), kind === "found" ? "found in" : "searched"],
          [
            String(view.asked.length),
            `${view.asked.length === 1 ? "question" : "questions"}, +${questionMin} min`,
          ],
          [
            // The total counts up with the tally, then lands on the exact score.
            tallied < tiles.length ? hm(tallied * 300) : hm(elapsed + view.bonusSeconds),
            "hider score",
          ],
        ]}
      />
      <Tally tiles={tiles} play={live} delay={tallyDelay} />
      {view.stationOnly && (
        <p className="max-w-[300px] text-center text-[12px] text-ink-2">
          This round ended at the station, on the free map. The full game goes on to search the
          street in Street View.
        </p>
      )}
      {view.hiderHand && <HandReveal hand={view.hiderHand} />}
      {view.daily && (
        <p className="text-[12px] text-ink-2">
          {alreadyPlayed
            ? "Played again: your first result today is the one that counts."
            : `Daily stats: ${stats.played} played · ${stats.found} found · streak ${stats.streak}`}
        </p>
      )}
      <div className="my-1 flex flex-wrap justify-center gap-1.5">
        {view.replay && (
          <Button kind="ink" onClick={() => useReplay.getState().open(world, view)}>
            Watch replay
          </Button>
        )}
        <Button onClick={share}>Share result</Button>
        <Button disabled={busy} onClick={() => newRound("practice", difficulty)}>
          {view.daily ? "Practice round" : "Play again"}
        </Button>
        {!view.daily && (
          <Button disabled={busy} onClick={() => newRound("daily")}>
            Today's daily
          </Button>
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="flex gap-1.5" role="radiogroup" aria-label="Practice difficulty">
          {DIFFICULTIES.map((d) => (
            <Button
              key={d}
              small
              kind={d === difficulty ? "ink" : "white"}
              disabled={busy}
              onClick={() => setDifficulty(d)}
            >
              {DIFFICULTY_LABEL[d]}
            </Button>
          ))}
        </div>
        <span className="text-center text-[11.5px] text-ink-2">{DIFFICULTY_HINT[difficulty]}</span>
      </div>
    </div>
  );
}
