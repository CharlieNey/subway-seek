/** Save changed session state, encoding a human round only when that round changes. */
import type { Dataset } from "@stand-clear/data";
import type { GameClock, SeekerDriver, SoloRound } from "@stand-clear/engine";
import { storeHideRound } from "./hidePersistence.ts";
import type { Session } from "./sessions.ts";
import type { SavedGame, SavedSession } from "./store.ts";

interface PersistentGame {
  round: SoloRound;
  clock: GameClock;
  driver?: SeekerDriver;
  lastSeq: number;
  log: { id: string };
  cardsLogged: number;
  stationLogged: boolean;
}
export function createSessionPersistence(
  ds: Dataset,
  save: (saved: SavedSession) => void,
  encode = storeHideRound,
) {
  const previous = new WeakMap<
    Session<PersistentGame>,
    {
      fields: unknown[];
      round: SoloRound;
      encoded: SavedGame["round"];
    }
  >();
  return (session: Session<PersistentGame>, now: number) => {
    const { game } = session;
    const last = previous.get(session);
    const fields = [
      game.round,
      game.clock,
      game.driver?.lastActionAt,
      game.lastSeq,
      game.log.id,
      game.cardsLogged,
      game.stationLogged,
      session.droppedAt,
    ];
    if (last && fields.every((v, i) => Object.is(v, last.fields[i]))) return;
    const encoded =
      last?.round === game.round
        ? last.encoded
        : game.round.human
          ? encode(game.round, ds)
          : game.round;
    save({
      token: session.token,
      game: {
        round: encoded,
        seekerLastActionAt: game.driver?.lastActionAt,
        clock: game.clock,
        lastSeq: game.lastSeq,
        logId: game.log.id,
        cardsLogged: game.cardsLogged,
        stationLogged: game.stationLogged,
      },
      droppedAt: session.droppedAt,
      updatedAt: now,
    });
    // Failed encoding or database writes remain dirty and retry at the next tick.
    previous.set(session, { fields, round: game.round, encoded });
  };
}
