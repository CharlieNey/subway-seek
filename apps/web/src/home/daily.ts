/**
 * Today's daily as the homepage sees it, from the server's GET /daily: where it starts,
 * the stations its hider could reach, and yesterday's hider, now its day is over. Public
 * facts only; today's hider never leaves the server.
 */
import { useEffect, useState } from "react";
import { serverHttpUrl } from "../game.ts";

export interface DailyFacts {
  date: string;
  number: number;
  /** The start: a complex index. */
  start: number | null;
  hideStart: number;
  seekStart: number;
  reachable: number[];
  yesterday: { date: string; number: number; hider: number } | null;
}

/** The facts, or null while they come (or if the server can't be reached). */
export function useDailyFacts(): DailyFacts | null {
  const [facts, setFacts] = useState<DailyFacts | null>(null);
  useEffect(() => {
    let live = true;
    fetch(serverHttpUrl("/daily"))
      .then((r) => (r.ok ? (r.json() as Promise<DailyFacts>) : null))
      .then((f) => live && f && setFacts(f))
      .catch(() => {
        // No server: the page still works, without the start and yesterday's hider.
      });
    return () => {
      live = false;
    };
  }, []);
  return facts;
}
