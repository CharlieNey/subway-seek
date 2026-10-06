import { useEffect, useRef, useState } from "react";
import { fontsReady, paintAt, type TabletStyle, tablet } from "./tablet.ts";

/**
 * A mosaic name tablet (IRT tile: identity). `width` is the CSS width; the height follows
 * the name. Rendered once per name and style, then cached.
 */
export function NameTablet({
  text,
  width = 300,
  style = "irt",
  className,
}: {
  text: string;
  width?: number;
  style?: TabletStyle;
  className?: string;
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
  useEffect(() => {
    if (!fontsLoaded || !ref.current) return;
    paintAt(ref.current, tablet(text, style), width);
  }, [fontsLoaded, text, style, width]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={text}
      className={className}
      style={{ display: "block", maxWidth: "100%", height: "auto", width }}
    />
  );
}
