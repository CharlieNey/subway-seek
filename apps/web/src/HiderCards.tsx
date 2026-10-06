import type { Dataset } from "@stand-clear/data";
import {
  type ActiveCurse,
  CARDS,
  type CardEvent,
  type CardId,
  handBonusSeconds,
  type SoloView,
  TOURIST_WALK_M,
} from "@stand-clear/engine";
import { useGame, type World } from "./game.ts";

/** What a card the hider just played means for you, for the notice. */
export function cardNotice(e: CardEvent): string {
  const card = CARDS[e.card];
  switch (e.card) {
    case "veto":
      return "The hider played Veto: no answer to that one. It still cost you the question.";
    case "randomize":
      return "The hider played Randomize: your question was swapped for another of the same type.";
    case "redraw":
      return "The hider swapped two cards for three.";
    default:
      return `The hider played ${card.title}! ${card.toSeeker ?? card.rule}`;
  }
}

/** One line on what a curse is doing to you right now. */
function curseNow(c: ActiveCurse, t: number, ds: Dataset, view: SoloView): string {
  const title = CARDS[c.card].title;
  switch (c.card) {
    case "fog":
    case "signalLoss":
    case "shed":
      return `${title} · ${Math.max(1, Math.ceil((c.until - t) / 60))} min left`;
    case "wrongWay":
      return `${title} · your next train has to run the other way`;
    case "tourist": {
      const off = ds.stations[c.station]?.name ?? "the next stop";
      return view.seeker.kind === "train"
        ? `${title} · off at ${off}, then walk ${TOURIST_WALK_M} m`
        : `${title} · walk ${TOURIST_WALK_M} m on the street before going back in`;
    }
  }
}

/** Under the round bar: the hider's hand size and any curse on you. */
export function HiderStrip({ world, t }: { world: World; t: number }) {
  const view = useGame((s) => s.view);
  if (!view || view.result) return null;
  return (
    <div className="mx-4 mb-3 -mt-1 space-y-1">
      <div className="text-xs text-stone-500">
        The hider holds {view.hiderHandSize} {view.hiderHandSize === 1 ? "card" : "cards"}
        {view.cardEvents.length > 0 && ` · played ${view.cardEvents.length}`}
      </div>
      {view.curses.map((c) => (
        <div
          key={`${c.card}-${c.at}`}
          className="rounded-md bg-orange-100 px-2.5 py-1.5 text-xs font-semibold text-orange-900"
        >
          {curseNow(c, t, world.ds, view)}
        </div>
      ))}
    </div>
  );
}

/** At the end: what the hider was holding, and what the time bonuses added. */
export function HandReveal({ hand }: { hand: CardId[] }) {
  if (hand.length === 0)
    return <p className="mt-2 text-xs text-stone-600">The hider held no cards.</p>;
  const bonus = handBonusSeconds(hand) / 60;
  return (
    <p className="mt-2 text-xs text-stone-600">
      The hider held {hand.map((c) => CARDS[c].title).join(", ")}
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
