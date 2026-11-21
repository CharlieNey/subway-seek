import { useEffect, useState } from "react";

/** Narrower than a round needs: 380 px of board plus 480 px of map (PlayPage, home.css). */
export const NARROW = "(width < 860px)";

export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => matchMedia(NARROW).matches);
  useEffect(() => {
    const media = matchMedia(NARROW);
    const changed = () => setNarrow(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  return narrow;
}
