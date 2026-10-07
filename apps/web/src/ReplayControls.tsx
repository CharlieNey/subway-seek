/**
 * The replay's bar over the map (the Deck page, part eight): play as an ink square, the
 * clock as a caption tile, the scrubber, and Close. The scrubber's band shows the three
 * phases (Hide, Seek, On foot); questions sit above it as family squares, curses as small
 * terra cotta squares, and the find in gold. It floats above Google's logo and
 * attribution and leaves room for the zoom buttons.
 */
import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { hhmm } from "./ask.ts";
import { useGame } from "./game.ts";
import { useReplay } from "./replay.ts";
import { FAMILY_COLORS } from "./ui/family.ts";
import { Button, Caption } from "./ui/vocab.tsx";

/** `credits`: how far up the map's own attribution reaches; the bar floats above it. */
export function ReplayControls({ credits = 0 }: { credits?: number }) {
  const { active, playing, start, end, t, toggle, seek, close, log, seekStart, footStart } =
    useReplay();
  const scrub = useRef<HTMLDivElement>(null);
  const replayOnly = useGame((s) => s.replayOnly);
  if (!active) return null;
  const span = Math.max(1, end - start);
  const at = (x: number) => `${(((x - start) / span) * 100).toFixed(3)}%`;
  const share = (t - start) / span;
  const phases: [string, string, number][] = [
    ["hide", "Hide", seekStart - start],
    ["seek", "Seek", (footStart ?? end) - seekStart],
    ...(footStart !== null
      ? [["foot", "On foot", end - footStart] as [string, string, number]]
      : []),
  ];
  const seekTo = (e: PointerEvent<HTMLDivElement>) => {
    const r = scrub.current?.getBoundingClientRect();
    if (!r) return;
    useReplay.setState({ playing: false });
    seek(start + ((e.clientX - r.left) / r.width) * span);
  };
  const onKey = (e: KeyboardEvent) => {
    // A game minute a press; Shift for ten.
    const step =
      (e.shiftKey ? 600 : 60) * (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0);
    if (!step) return;
    e.preventDefault();
    useReplay.setState({ playing: false });
    seek(t + step);
  };
  const finished = t >= end;
  return (
    <div className="sc-rp-bar z-10" style={{ bottom: Math.max(30, credits + 8) }}>
      <button
        type="button"
        className="sc-rp-play sc-focus"
        onClick={toggle}
        aria-label={playing ? "Pause" : finished ? "Play again" : "Play"}
      >
        {playing ? (
          <>
            <i />
            <i />
          </>
        ) : (
          <b />
        )}
      </button>
      <Caption>
        <span className="tabular-nums">{hhmm(t)}</span>
      </Caption>
      <div
        ref={scrub}
        className="sc-rp-scrub sc-focus"
        role="slider"
        tabIndex={0}
        aria-label="Replay time"
        aria-valuemin={0}
        aria-valuemax={Math.round(span / 60)}
        aria-valuenow={Math.round((t - start) / 60)}
        aria-valuetext={hhmm(t)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e);
        }}
        onKeyDown={onKey}
      >
        <div className="sc-rp-ticks">
          {log.map((e) => {
            const m = e.mark;
            if (m.kind === "question") {
              const { fill, trim } = FAMILY_COLORS[m.family];
              return (
                <i
                  key={`${e.t}-${e.text}`}
                  className={m.vetoed ? "veto" : undefined}
                  style={{ left: at(e.t), "--c": fill, "--t": trim } as React.CSSProperties}
                  title={`${e.text} · ${hhmm(e.t)}`}
                />
              );
            }
            if (m.kind === "curse" || m.kind === "found")
              return (
                <i
                  key={`${e.t}-${e.text}`}
                  className={m.kind}
                  style={{ left: at(e.t) }}
                  title={`${e.text} · ${hhmm(e.t)}`}
                />
              );
            return null;
          })}
        </div>
        <div className="sc-rp-track">
          {phases.map(([k, , w]) => (
            <span key={k} className={k} style={{ flex: Math.max(0, w) }} />
          ))}
        </div>
        <div className="sc-rp-fill" style={{ transform: `scaleX(${share})` }} />
        {/* The head moves by transform: a wrapper as wide as the scrubber slides along it. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ transform: `translateX(${(share * 100).toFixed(3)}%)` }}
        >
          <div className="sc-rp-head" />
        </div>
        <div className="sc-rp-phl">
          {phases.map(([k, label, w]) => (
            <span key={k} style={{ flex: Math.max(0, w) }}>
              {label}
            </span>
          ))}
        </div>
      </div>
      {/* The homepage's replay has no round behind it: Close goes home. */}
      <Button onClick={replayOnly ? () => location.assign("/") : close}>Close</Button>
    </div>
  );
}
