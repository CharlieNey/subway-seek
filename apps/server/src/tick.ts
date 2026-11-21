/** The server's discrete round tick. Effects are injected so failures and pacing are testable. */
import {
  advanceSolo,
  applySoloIntent,
  defaultHiderExit,
  driveSeeker,
  type GameClock,
  gameTime,
  rejectSeekerAction,
  type SeekerDriver,
  type SoloRound,
  setHiderExit,
  soloView,
  type TimetableIndex,
} from "@subway-seek/engine";
import type { exitSpot, seekerStreetTarget } from "./hideSpots.ts";
import type { MatchLog } from "./matchLog.ts";
import type { Session } from "./sessions.ts";

export interface TickGame {
  clock: GameClock;
  round: SoloRound;
  driver?: SeekerDriver;
  exitRetryAt?: number;
  lastSeq: number;
  log: Pick<MatchLog, "write">;
  stationLogged: boolean;
  shown: string;
}
export interface TickDependencies<G extends TickGame> {
  idx: TimetableIndex;
  exitSpot: typeof exitSpot;
  seekerStreetTarget: typeof seekerStreetTarget;
  persist: (session: Session<G>, now: number) => void;
  sendState: (session: Session<G>, seq: number, now: number) => void;
  viewNow: (game: G, now: number) => unknown;
  logCards: (game: G) => void;
  logEnd: (game: G) => void;
  wallTime?: () => number;
}

export async function tick<G extends TickGame>(
  session: Session<G>,
  now: number,
  deps: TickDependencies<G>,
) {
  const { idx, persist, sendState, viewNow, logCards, logEnd } = deps;
  const wallTime = deps.wallTime ?? Date.now;
  const { game } = session;
  if (game.clock.pausedAt !== null || game.round.result) return;
  const before = game.round;
  game.round = advanceSolo(game.round, gameTime(game.clock, now), idx);
  if (game.round.human && game.round.human.station !== null && !game.round.result) {
    const exit = defaultHiderExit(game.round, idx);
    // At the station only, the hider never comes up: no exit to look up.
    if (
      !game.round.stationOnly &&
      !game.round.human.exits[exit] &&
      now >= (game.exitRetryAt ?? 0)
    ) {
      const spot = await deps.exitSpot(idx.ds, game.round.hider, exit);
      game.exitRetryAt = wallTime() + 10_000;
      if (spot) game.round = setHiderExit(game.round, exit, spot);
      now = wallTime();
      game.round = advanceSolo(game.round, gameTime(game.clock, now), idx);
    }
    if (game.driver && !game.round.result) {
      let t = gameTime(game.clock, now);
      const view = soloView(game.round, t, idx);
      const step = driveSeeker(view, game.driver, t, idx, game.clock.speed);
      game.driver = step.driver;
      let intent = step.intent;
      if (intent?.type === "walkTo") {
        const spot = await deps.seekerStreetTarget(view, intent.lat, intent.lon, t, idx);
        now = wallTime();
        t = gameTime(game.clock, now);
        if (spot) intent = { type: "walkTo", ...spot };
        else {
          game.driver = rejectSeekerAction(game.driver, view, intent, "No street panorama", t, idx);
          intent = null;
        }
      }
      if (intent) {
        const out = applySoloIntent(game.round, intent, t, idx);
        game.log.write("intent", {
          t,
          side: "seeker",
          type: intent.type,
          ...(intent.type === "walkTo" ? { pano: intent.pano } : { intent }),
          ok: out.ok,
        });
        if (out.ok) game.round = out.round;
        else game.driver = rejectSeekerAction(game.driver, view, intent, out.error, t, idx);
      }
    }
  }
  const changed = game.round !== before;
  logCards(game);
  if (changed) logEnd(game);
  if (game.round.stationFoundAt !== null && !game.stationLogged) {
    game.stationLogged = true;
    game.log.write("station_found", { t: game.round.stationFoundAt });
  }
  if (changed || game.driver) {
    try {
      persist(session, now);
    } catch (error) {
      console.error("session save failed:", error);
    }
  }
  if (session.conn && JSON.stringify(viewNow(game, now)) !== game.shown) {
    sendState(session, game.lastSeq, now);
  }
}
