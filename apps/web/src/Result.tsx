/**
 * The result (DESIGN.md, Sidebar › Result; the Deck page, part four): a gold "Found"
 * tablet (or "Time's up"), the hider's station as its own tablet, the three numbers, the
 * score tally bar, the daily stats line, then Watch replay in ink with Share and Practice
 * round in white. Practice takes a difficulty: three Buttons, the chosen one ink.
 */
import { DIFFICULTIES, type Difficulty, questionBonusSeconds } from "@stand-clear/engine";
import { useState } from "react";
import { tallyTiles } from "./ask.ts";
import { hubName, useGame, type World } from "./game.ts";
import { HandReveal } from "./HiderCards.tsx";
import { dailyStats } from "./history.ts";
import { displayName } from "./names.ts";
import { useReplay } from "./replay.ts";
import { routesFor } from "./routes.ts";
import { shareText } from "./share.ts";
import { FAMILY_COLORS } from "./ui/family.ts";
import { NameTablet } from "./ui/NameTablet.tsx";
import { Bullets, Button } from "./ui/vocab.tsx";

/** "1:32": hours and minutes, as the result's numbers read. */
export const hm = (seconds: number) => {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

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
  const { view, send } = useGame();
  return (mode: "daily" | "practice", difficulty?: Difficulty) => {
    const inProgress = view && !view.result && view.asked.length > 0;
    if (inProgress && !window.confirm("Leave this round? It won't count.")) return;
    send(mode === "practice" ? { type: "newRound", mode, difficulty } : { type: "newRound", mode });
  };
}

function Numbers({ items }: { items: [string, string][] }) {
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

/** The score as tiles, one per 5 game-min: where it came from, not just the number. */
function Tally() {
  const view = useGame((s) => s.view);
  if (!view) return null;
  const tiles = tallyTiles(view);
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
          className="block h-2.5 w-2.5"
          style={{
            background:
              tile === "ink"
                ? "var(--color-ink)"
                : tile === "gold"
                  ? "var(--color-gold)"
                  : FAMILY_COLORS[tile].fill,
          }}
        />
      ))}
    </div>
  );
}

export function ResultCard({ world }: { world: World }) {
  const { view, busy, results, alreadyPlayed } = useGame();
  const newRound = useNewRound();
  const [difficulty, setDifficulty] = useState<Difficulty>(view?.difficulty ?? "normal");
  if (!view?.result || view.hider === null) return null;
  const hider = world.ds.complexes[view.hider];
  const elapsed = view.result.at - view.seekStart;
  const kind = view.result.kind;
  const stats = dailyStats(results);
  const questionMin = questionBonusSeconds(view.asked) / 60;
  // A replayed daily doesn't count, so share the result that does.
  const counted = view.daily && alreadyPlayed ? results[view.daily.date]?.share : undefined;
  const share = () => {
    const text = counted ?? shareText(view, hubName(world, view));
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
  return (
    <div className="flex flex-col items-center gap-2 border-b border-grout px-4 pt-3.5 pb-3">
      <NameTablet
        text={kind === "found" ? "Found" : kind === "timeout" ? "Time's up" : "Gave up"}
        style={kind === "found" ? "irt-gold" : "irt"}
        width={kind === "found" ? 170 : 210}
      />
      <p className="mt-1.5 text-[12.5px] text-ink-2">The hider was at</p>
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
          [hm(elapsed + view.bonusSeconds), "hider score"],
        ]}
      />
      <Tally />
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
        <Button onClick={share}>{counted ? "Share today's result" : "Share result"}</Button>
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
