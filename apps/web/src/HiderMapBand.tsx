import { hhmm } from "./ask.ts";
import { useGame } from "./game.ts";
import { isHider } from "./hide.ts";
import { useReplay } from "./replay.ts";
import { Caption } from "./ui/vocab.tsx";

export function HiderMapBand() {
  const view = useGame((s) => s.view);
  const replay = useReplay((s) => s.active);
  if (!isHider(view) || replay || view.result) return null;
  return (
    <>
      <div className="absolute top-3 left-3 z-10">
        <Caption tone={view.zone && !view.lock ? "terra" : "light"}>
          {!view.zone
            ? "Your trail · only you see it"
            : !view.lock
              ? "Your zone · 400 m"
              : `${view.candidates.length} stations still possible`}
        </Caption>
      </div>
      {view.entered && (
        <div
          role="status"
          className="sc-grid-lines sc-anim-unroll absolute top-2 left-1/2 z-10 -translate-x-1/2 border-y-4 border-ink bg-terra px-5 py-3 text-center text-glaze-hi"
        >
          <b className="block font-display text-[14px] uppercase tracking-[0.08em]">
            Seeker is in your zone
          </b>
          <span className="text-[12px]">
            {view.entered.walked ? "Entered your zone" : `Came up at Exit ${view.entered.exit + 1}`}{" "}
            · {hhmm(view.entered.at)}
          </span>
        </div>
      )}
    </>
  );
}
