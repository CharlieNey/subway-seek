import { useEffect, useRef, useState } from "react";
import { fontsReady, paintAt, setIn, type TabletStyle, tablet } from "./tablet.ts";

/**
 * A mosaic name tablet (IRT tile: identity). Sized by `width` (CSS px), or by `tile` (CSS px
 * per tessera, so names of different lengths share a tile size) up to `maxWidth`. The
 * height follows the name. Rendered once per name and style, then cached.
 */
export function NameTablet({
  text,
  width,
  tile,
  maxWidth = 360,
  style = "irt",
  className,
  setMs,
}: {
  text: string;
  width?: number;
  tile?: number;
  maxWidth?: number;
  style?: TabletStyle;
  className?: string;
  /** Set tile by tile, left to right, over this many ms when it first shows. */
  setMs?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    void fontsReady().then(() => live && setFontsLoaded(true));
    return () => {
      live = false;
    };
  }, []);
  const [cssW, setCssW] = useState(width ?? 300);
  useEffect(() => {
    if (!fontsLoaded || !ref.current) return;
    const model = tablet(text, style);
    const w = width ?? Math.min(maxWidth, model.W * (tile ?? 3));
    setCssW(w);
    const still =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (setMs && !still) return setIn(ref.current, model, w, setMs);
    paintAt(ref.current, model, w);
  }, [fontsLoaded, text, style, width, tile, maxWidth, setMs]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={text}
      className={className}
      style={{ display: "block", maxWidth: "100%", height: "auto", width: cssW }}
    />
  );
}
