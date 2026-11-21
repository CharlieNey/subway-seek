/**
 * A card as it lands on the seeker (DESIGN.md, Cards › Card faces: full size, 264 × 372):
 * the tile frame naming its kind, the kind's caption, the cost in the corner, the mosaic
 * emblem, the title, the exact rule, the conductor's line, and when it's played.
 */
import { CARDS, type CardId } from "@subway-seek/engine";
import { useEffect, useRef, useState } from "react";
import { cardFrame, emblem } from "./cards.ts";
import { fontsReady, paintAt } from "./tablet.ts";

const KIND = {
  powerup: { label: "Powerup", frame: "power" as const, when: "Played when a question arrives" },
  curse: { label: "Curse", frame: "curse" as const, when: "Played any time while seeking" },
};

function useFonts() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void fontsReady().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/** The card's emblem alone, for a curse chip (30 px). */
export function CardEmblem({ card, size = 30 }: { card: CardId; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = CARDS[card];
  useEffect(() => {
    if (!ref.current || def.kind === "bonus") return;
    const model = emblem(card, def.kind === "curse" ? "curse" : "power");
    if (model) paintAt(ref.current, model, size);
  }, [card, def.kind, size]);
  return (
    <span aria-hidden="true" className="block flex-none">
      <canvas ref={ref} style={{ width: size, height: size, display: "block" }} />
    </span>
  );
}

export function CardFace({ card, hider = false }: { card: CardId; hider?: boolean }) {
  const def = CARDS[card];
  const frameRef = useRef<HTMLCanvasElement>(null);
  const embRef = useRef<HTMLCanvasElement>(null);
  const fonts = useFonts();
  const kind = def.kind === "curse" ? KIND.curse : KIND.powerup;
  useEffect(() => {
    if (!fonts || !frameRef.current || !embRef.current) return;
    const frame = cardFrame(kind.frame);
    paintAt(frameRef.current, frame, 264);
    // The frame's inner field, flat so the text stays legible.
    const ctx = frameRef.current.getContext("2d");
    if (ctx) {
      const s = frameRef.current.width / frame.W;
      ctx.fillStyle = frame.fill;
      ctx.fillRect(
        frame.inset * s,
        frame.inset * s,
        (frame.W - 2 * frame.inset) * s,
        (frame.H - 2 * frame.inset) * s,
      );
    }
    const model = emblem(card, kind.frame);
    if (model) paintAt(embRef.current, model, 126);
  }, [fonts, card, kind.frame]);
  return (
    <article className="sc-card" aria-label={`${kind.label}: ${def.title}. ${def.rule}`}>
      <canvas ref={frameRef} className="sc-card-frame" />
      <div className="sc-card-in">
        <div className="sc-card-hd">
          <span className="sc-cap">{kind.label}</span>
          {def.cost !== undefined && <span className="sc-card-cost">Discard {def.cost}</span>}
        </div>
        <canvas ref={embRef} className="sc-card-emb" />
        <h4>{def.title}</h4>
        <p className="sc-card-rule">{hider ? def.rule : (def.toSeeker ?? def.rule)}</p>
        <p className="sc-card-line">“{def.line}”</p>
        <span className="sc-card-when">{kind.when}</span>
      </div>
    </article>
  );
}
