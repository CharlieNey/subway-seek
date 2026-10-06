import { useEffect, useRef, useState } from "react";

const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Keep showing the last value for `ms` after it goes away, flagged as leaving, so it can
 * collapse or lift rather than vanish (DESIGN.md, Motion rule 5: information that leaves
 * lifts off). With reduced motion it goes at once.
 */
export function useLeaving<T>(value: T | null, ms: number): { value: T | null; leaving: boolean } {
  const kept = useRef<T | null>(value);
  const [leaving, setLeaving] = useState(false);
  if (value !== null) kept.current = value;
  useEffect(() => {
    if (value !== null) {
      setLeaving(false);
      return;
    }
    if (kept.current === null) return;
    if (reduced()) {
      kept.current = null;
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const id = setTimeout(() => {
      kept.current = null;
      setLeaving(false);
    }, ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  if (value !== null) return { value, leaving: false };
  return { value: leaving ? kept.current : null, leaving };
}
