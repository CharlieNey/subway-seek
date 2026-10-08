import {
  type ActiveCurse,
  CARDS,
  type CardId,
  handBonusSeconds,
  resolve,
  type SoloView,
  TOURIST_WALK_M,
} from "@stand-clear/engine";
import type { World } from "./game.ts";
import { isHider } from "./hide.ts";
import { useLanded } from "./landing.ts";
import { displayName } from "./names.ts";
import { CardEmblem } from "./ui/Card.tsx";
import { TileTimer } from "./ui/vocab.tsx";

/** What a curse is doing to you right now, and how long it has left (in game minutes). */
function curseLine(
  c: ActiveCurse,
  t: number,
  world: World,
  view: SoloView,
): { what: string; minutesLeft: number | null; total: number | null } {
  const def = CARDS[c.card];
  switch (c.card) {
    case "fog":
    case "signalLoss":
    case "shed": {
      const left = Math.max(1, Math.ceil((c.until - t) / 60));
      const what =
        c.card === "fog"
          ? "Street View is blurred"
          : c.card === "signalLoss"
            ? "Your map is hidden"
            : "Walking at half speed";
      return {
        what: `${what} · ${left} min`,
        minutesLeft: left,
        total: (def.durationSeconds ?? 600) / 60,
      };
    }
    case "wrongWay": {
      const s = resolve(view.seeker, t, world.idx);
      const station = s.kind === "platform" ? world.ds.stations[s.station] : undefined;
      const way = station ? (c.dir === 0 ? station.northLabel : station.southLabel) : null;
      return {
        what: way
          ? `Your next train runs ${way.toLowerCase()}`
          : "Your next train runs the other way",
        minutesLeft: null,
        total: null,
      };
    }
    case "tourist": {
      const off = displayName(world.ds.stations[c.station]?.name ?? "the next stop");
      return {
        what:
          view.seeker.kind === "train"
            ? `Off at ${off}, then walk ${TOURIST_WALK_M} m`
            : `Walk ${TOURIST_WALK_M} m on the street before going back in`,
        minutesLeft: null,
        total: null,
      };
    }
  }
}

/**
 * The curses on you, each a chip with its tile timer, in the panel and never over the
 * photo (DESIGN.md, Street endgame). Terra cotta is the curse's color. How many cards
 * the hider holds stays secret (Hidden information).
 */
export function CurseChips({ world, t, view }: { world: World; t: number; view: SoloView }) {
  if (view.result || view.curses.length === 0) return null;
  return (
    <div className="mx-4 mt-2.5 flex flex-col gap-1.5">
      {view.curses.map((c) => (
        <CurseChip
          key={`${c.card}-${c.at}`}
          c={c}
          line={
            isHider(view)
              ? { ...curseLine(c, t, world, view), what: CARDS[c.card].rule }
              : curseLine(c, t, world, view)
          }
        />
      ))}
    </div>
  );
}

/**
 * One curse: its emblem, what it's doing, and its tile timer. While its card is landing it
 * holds its place, empty, so the card has somewhere to shrink into (Motion: Curse lands).
 */
function CurseChip({ c, line }: { c: ActiveCurse; line: ReturnType<typeof curseLine> }) {
  const key = `${c.card}@${c.at}`;
  const landed = useLanded(key);
  return (
    <div
      data-land={key}
      className="flex items-center gap-2.5 bg-glaze-hi px-2.5 py-2 shadow-[inset_0_0_0_1.5px_var(--color-ink)]"
      style={{ opacity: landed ? 1 : 0 }}
    >
      <CardEmblem card={c.card} size={30} />
      <div className="min-w-0 flex-1">
        <b className="block font-display text-[12px] font-bold uppercase tracking-[0.08em]">
          {CARDS[c.card].title}
        </b>
        <span className="text-[11.5px] text-ink-2">{line.what}</span>
      </div>
      {line.total !== null && line.minutesLeft !== null && (
        <TileTimer total={line.total} left={line.minutesLeft} size={7} lastTerra />
      )}
    </div>
  );
}

/** At the end: what the hider was holding, and what the time bonuses added. */
export function HandReveal({ hand, own = false }: { hand: CardId[]; own?: boolean }) {
  if (hand.length === 0)
    return (
      <p className="text-[12px] text-ink-2">
        {own ? "Cards held · 0" : "The hider held no cards."}
      </p>
    );
  const bonus = handBonusSeconds(hand) / 60;
  return (
    <p className="text-[12px] text-ink-2">
      {own ? "Cards held · " : "The hider held "}
      {hand.map((c) => CARDS[c].title).join(", ")}
      {bonus > 0 ? ` · time bonuses +${bonus} min` : ""}
    </p>
  );
}

/** Whether a timed curse is on right now. */
export function cursed(view: SoloView | null, card: "fog" | "signalLoss", t: number | null) {
  if (!view || t === null || view.result) return null;
  const c = view.curses.find((x) => x.card === card);
  return c && "until" in c && t < c.until ? c : null;
}
