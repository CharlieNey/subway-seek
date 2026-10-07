/**
 * The panel while the replay plays (the Deck page, part eight): "Replay" over the round,
 * the hider's station as a tablet with when they were found, the three numbers, and the
 * log, which follows the scrubber. The current event is the express band, later events
 * dim, and clicking a row jumps there. Hider moves carry a terra cotta dot, yours an ink
 * dot, questions their family square.
 */
import { useEffect, useRef } from "react";
import { hhmm } from "./ask.ts";
import { useGamePick, type World } from "./game.ts";
import { displayName } from "./names.ts";
import { hm, Numbers, shareFor, useNewRound } from "./Result.tsx";
import { REPLAY_REAL_SECONDS, useReplay } from "./replay.ts";
import { currentEvent, type LogEvent } from "./replayLog.ts";
import { NameTablet } from "./ui/NameTablet.tsx";
import { Button, FamilySquare, Wainscot } from "./ui/vocab.tsx";

function Mark({ e }: { e: LogEvent }) {
  const m = e.mark;
  if (m.kind === "hider") return <span className="sc-rp-dot" />;
  if (m.kind === "you") return <span className="sc-rp-dot ink" />;
  if (m.kind === "question") return <FamilySquare family={m.family} vetoed={m.vetoed} size={11} />;
  const [c, t] =
    m.kind === "curse"
      ? ["var(--color-terra)", "var(--color-terra)"]
      : m.kind === "found"
        ? ["var(--color-gold)", "var(--color-gold-deep)"]
        : ["var(--color-ink-3)", "var(--color-ink-3)"];
  return <span className="sc-rp-tile" style={{ "--c": c, "--t": t } as React.CSSProperties} />;
}

export function ReplayPanel({ world, roundLine }: { world: World; roundLine: string }) {
  const { view, results, alreadyPlayed, busy, replayOnly } = useGamePick(
    "view",
    "results",
    "alreadyPlayed",
    "busy",
    "replayOnly",
  );
  const newRound = useNewRound();
  const { log, t, seek } = useReplay();
  const box = useRef<HTMLDivElement>(null);
  const now = currentEvent(log, t);

  // Keep the current row in the middle of the log.
  useEffect(() => {
    const el = box.current;
    const row = el?.querySelector<HTMLElement>(`[data-i="${Math.max(0, now)}"]`);
    if (!el || !row) return;
    el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight / 2 + row.offsetHeight / 2);
  }, [now]);

  if (!view?.result) return null;
  const hider = view.hider === null ? undefined : world.ds.complexes[view.hider];
  const elapsed = view.result.at - view.seekStart;
  const bonusMin = Math.round(view.bonusSeconds / 60);
  const kind = view.result.kind;
  const { share } = shareFor(world, view, results, alreadyPlayed);
  return (
    <>
      <header className="flex items-start justify-between gap-2.5 px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <div className="font-display text-[12.5px] font-bold tracking-[0.12em] uppercase">
            Replay
          </div>
          <div className="text-[12px] text-ink-2">{roundLine}</div>
        </div>
        <small className="pt-0.5 text-[11.5px] text-ink-2">
          Plays the round in {REPLAY_REAL_SECONDS} s
        </small>
      </header>
      <div className="flex flex-col items-center gap-1.5 border-b border-grout px-4 pt-3 pb-2.5">
        {hider && (
          <>
            <span className="font-display text-[10px] font-bold tracking-[0.14em] text-ink-2 uppercase">
              The hider was at
            </span>
            <NameTablet text={displayName(hider.name)} tile={3.1} maxWidth={250} />
          </>
        )}
        <span className="text-[12.5px] text-ink-2">
          {kind === "found"
            ? `Found at ${hhmm(view.result.at)}`
            : kind === "timeout"
              ? `Time ran out at ${hhmm(view.result.at)}`
              : `You gave up at ${hhmm(view.result.at)}`}
        </span>
        <Numbers
          items={[
            [hm(elapsed), kind === "found" ? "found in" : "searched"],
            [`+${bonusMin}`, "min to their score"],
            [hm(elapsed + view.bonusSeconds), "hider score"],
          ]}
        />
      </div>
      <div ref={box} className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {log.map((e, i) => (
          <button
            type="button"
            key={`${e.t}-${e.text}`}
            data-i={i}
            className={`sc-rp-row sc-focus${i === now ? " now" : i > now ? " fut" : ""}`}
            onClick={() => {
              useReplay.setState({ playing: false });
              seek(e.t);
            }}
          >
            <span className="t">{hhmm(e.t)}</span>
            <span className="m">
              <Mark e={e} />
            </span>
            <b>{e.text}</b>
            {e.note && <em>{e.note}</em>}
          </button>
        ))}
      </div>
      <Wainscot>
        <Button
          kind="ink"
          disabled={busy}
          onClick={() => {
            // From the homepage's replay there's no round to replace: open one.
            if (replayOnly) location.assign("/play?practice");
            else {
              useReplay.getState().close();
              newRound("practice", view.difficulty);
            }
          }}
        >
          {view.daily ? "Practice round" : "Play again"}
        </Button>
        <Button onClick={share}>Share</Button>
      </Wainscot>
    </>
  );
}
