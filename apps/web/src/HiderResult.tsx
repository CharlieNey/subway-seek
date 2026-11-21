import {
  DIFFICULTIES,
  type Difficulty,
  type HiderView,
  questionBonusSeconds,
  SEEKER_LEVELS,
} from "@subway-seek/engine";
import { useState } from "react";
import { hhmm, hm, tallyTiles } from "./ask.ts";
import { useGamePick, type World } from "./game.ts";
import { HandReveal } from "./HiderCards.tsx";
import { SpotThumbnail } from "./HiderPhoto.tsx";
import { displayName } from "./names.ts";
import { Numbers, shareFor, Tally, useNewRound } from "./Result.tsx";
import { useReplay } from "./replay.ts";
import { routesFor } from "./routes.ts";
import { streetOn } from "./streetMode.ts";
import { NameTablet } from "./ui/NameTablet.tsx";
import { Bullets, Button } from "./ui/vocab.tsx";

export function HiderResult({ world, view }: { world: World; view: HiderView }) {
  const { busy, results, replayOnly } = useGamePick("busy", "results", "replayOnly");
  const [difficulty, setDifficulty] = useState<Difficulty>(view.difficulty);
  const newRound = useNewRound();
  if (!view.result) return null;
  const c = view.hider === null ? null : world.ds.complexes[view.hider];
  const elapsed = Math.max(0, view.result.at - view.seekStart);
  const { share } = shareFor(world, view, results, false);
  return (
    <section className="flex flex-col items-center gap-2 border-b border-grout px-4 py-4">
      <NameTablet
        text={view.incomplete ? "Incomplete" : view.result.kind === "found" ? "Found" : "Not found"}
        style={view.result.kind === "found" ? "irt-gold" : "irt"}
        maxWidth={320}
      />
      {view.incomplete ? (
        <p className="text-[13px]">
          {view.incomplete === "start" ? "You didn't leave the start." : "It won't count."}
        </p>
      ) : (
        <>
          <p className="text-[13px] text-ink-2">You hid at</p>
          {c && (
            <>
              <NameTablet text={displayName(c.name)} tile={3.1} maxWidth={320} />
              <Bullets routes={routesFor(world, c.routes)} size={18} />
            </>
          )}
          {view.result.kind === "found" && (
            <p className="text-[13px]">Caught at {hhmm(view.result.at)}</p>
          )}
          <div className="w-full text-center">
            <b className="block text-[38px] font-extrabold tabular-nums">
              {hm(view.scoreSeconds ?? 0)}
            </b>
            <span className="text-[13px]">Your score</span>
          </div>
          <Numbers
            items={[
              [hm(elapsed), "Seeker's time"],
              [`+${questionBonusSeconds(view.asked) / 60} min`, "Questions"],
              [`+${view.heldBonusSeconds / 60} min`, "Cards held"],
            ]}
          />
          <Tally tiles={tallyTiles(view)} play={false} delay={0} />
          {view.stationOnly && (
            <p className="max-w-[300px] text-center text-[12px] text-ink-2">
              This round ended at the station, on the free map: you stayed below until the seeker
              reached it.
            </p>
          )}
          <HandReveal hand={view.hand} own />
          <SpotThumbnail view={view} />
        </>
      )}
      <div className="my-2 flex flex-wrap justify-center gap-1.5">
        {view.replay && (
          <Button kind="ink" onClick={() => useReplay.getState().open(world, view)}>
            Watch replay
          </Button>
        )}
        {!view.incomplete && <Button onClick={share}>Share result</Button>}
        <Button
          disabled={busy}
          onClick={() => {
            if (replayOnly) location.assign(`/play?hide&difficulty=${difficulty}`);
            else newRound("hide", difficulty);
          }}
        >
          Play again
        </Button>
      </div>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Seeker difficulty">
        {DIFFICULTIES.map((d) => (
          <Button
            key={d}
            small
            kind={d === difficulty ? "ink" : "white"}
            disabled={busy}
            onClick={() => setDifficulty(d)}
          >
            {d[0]?.toUpperCase()}
            {d.slice(1)}
          </Button>
        ))}
      </div>
      <span className="text-[12px] text-ink-2">
        {streetOn()
          ? `Searches with ${SEEKER_LEVELS[difficulty].endgameAt} stations left.`
          : "On the free map every level hunts station by station."}
      </span>
    </section>
  );
}
