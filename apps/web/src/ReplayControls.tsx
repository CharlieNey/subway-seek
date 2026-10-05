import { useReplay } from "./replay.ts";
import { formatClock } from "./useGameTime.ts";

/** Play/pause, scrubber and legend over the map while a replay is open. */
export function ReplayControls() {
  const { active, playing, start, end, t, toggle, seek, close } = useReplay();
  if (!active) return null;
  return (
    <div className="absolute inset-x-4 bottom-8 z-10 flex items-center gap-3 rounded-lg bg-white/95 px-3 py-2 shadow">
      <button
        type="button"
        onClick={toggle}
        className="w-16 rounded-md bg-stone-900 px-2 py-1 text-xs font-semibold text-white"
      >
        {playing ? "Pause" : t >= end ? "Replay" : "Play"}
      </button>
      <span className="w-16 font-mono text-sm tabular-nums">{formatClock(t).slice(0, 5)}</span>
      <input
        type="range"
        min={start}
        max={end}
        step={1}
        value={t}
        onChange={(e) => {
          useReplay.setState({ playing: false });
          seek(Number(e.target.value));
        }}
        className="min-w-0 flex-1 accent-stone-900"
        aria-label="Replay time"
      />
      <span className="flex items-center gap-1 text-xs text-stone-600">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" /> Hider
        <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-stone-900" /> You
      </span>
      <button
        type="button"
        onClick={close}
        className="rounded-md border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700"
      >
        Close
      </button>
    </div>
  );
}
