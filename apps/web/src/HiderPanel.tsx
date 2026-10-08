import {
  CARDS,
  describeAnswer,
  describeQuestion,
  distanceMeters,
  type HiderView,
  resolve,
  type SeenQuestion,
} from "@stand-clear/engine";
import { type ReactNode, useState } from "react";
import { QuestionLog } from "./AskPanel.tsx";
import { hhmm, hm } from "./ask.ts";
import { LostBand, ServerPlaque, TakenOverPlaque, useLinkScreen } from "./Connection.tsx";
import { useGamePick, type World } from "./game.ts";
import { CurseChips } from "./HiderCards.tsx";
import { HiderHand } from "./HiderHand.tsx";
import { HiderPhoto, SpotThumbnail } from "./HiderPhoto.tsx";
import { displayName } from "./names.ts";
import { routesFor } from "./routes.ts";
import { TravelAction, TravelPanel } from "./TravelPanel.tsx";
import { FAMILY_NAME, familyOf } from "./ui/family.ts";
import { NameTablet } from "./ui/NameTablet.tsx";
import {
  Bullets,
  Button,
  Lamp,
  Lamps,
  Line,
  LocalBand,
  Notice,
  Rule,
  TabRow,
  TileTimer,
  Wainscot,
  WainscotText,
} from "./ui/vocab.tsx";
import { LINES } from "./voice.ts";
import "./hide.css";

export function HiderPanel({
  world,
  view,
  t,
  top,
}: {
  world: World;
  view: HiderView;
  t: number;
  top: ReactNode;
}) {
  const { send, busy, notice, dismissNotice } = useGamePick(
    "send",
    "busy",
    "notice",
    "dismissNotice",
  );
  const [tab, setTab] = useState("zone");
  const [picked, setPicked] = useState<number | null>(null);
  const [photo, setPhoto] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const screen = useLinkScreen();
  const down = screen.kind !== "none";
  const hiding = t < view.seekStart;
  const s = resolve(view.self, t, world.idx);
  const station = view.station === null ? null : world.ds.stations[view.station];
  const complex = station ? world.ds.complexes[station.complex] : null;
  const exit =
    view.exits.find((e) => e.exit === picked && e.allowed) ??
    [...view.exits]
      .filter((e) => e.allowed)
      .sort((a, b) =>
        station ? distanceMeters(a, station) - distanceMeters(b, station) : a.exit - b.exit,
      )[0];
  const incoming = view.incoming.find(
    (x) => view.asked[x.index] && (view.asked[x.index] as SeenQuestion).answerAt > t,
  );
  const pendingPhoto =
    photo === null
      ? undefined
      : view.incoming.find(
          (x) =>
            x.index === photo &&
            view.asked[x.index]?.q.kind === "photo" &&
            (view.asked[x.index]?.answerAt ?? 0) > t,
        );
  const banked = view.bonusSeconds;
  const hand = tab === "hand" || !!view.draw;
  return (
    <aside className="flex h-full w-[370px] flex-none flex-col border-l border-grout bg-glaze-hi text-ink">
      {top}
      {screen.kind === "lost" && <LostBand screen={screen} />}
      {screen.kind === "unreachable" && <ServerPlaque screen={screen} />}
      {screen.kind === "takenOver" && <TakenOverPlaque />}
      <div className={`flex min-h-0 flex-1 flex-col${down ? " sc-frozen" : ""}`} inert={down}>
        {hiding ? (
          <section className="mx-4 border-t-2 border-ink pt-3">
            <div className="flex items-center justify-between">
              <Rule>Time to hide</Rule>
              <b className="text-[24px] tabular-nums">{Math.ceil((view.seekStart - t) / 60)} min</b>
            </div>
            <TileTimer total={20} left={Math.ceil((view.seekStart - t) / 60)} size={14} lastTerra />
            <p className="mt-2 text-[12px] text-ink-2">
              At 10:20 your station is where you are. If you're on a train, it's the last stop the
              train called at.
            </p>
          </section>
        ) : (
          <section className="mx-4 border-t-2 border-ink pt-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <b className="block text-[30px] font-extrabold tabular-nums">
                  {hm(Math.max(0, t - view.seekStart) + view.bonusSeconds + view.heldBonusSeconds)}
                </b>
                <span className="text-[12px]">Your score</span>
              </div>
              <div className="border-l border-grout pl-2">
                <b className="block text-[20px]">+{banked / 60}</b>
                <span className="text-[12px]">from questions, min</span>
              </div>
              <div className="border-l border-grout pl-2">
                <b className="block text-[20px]">{view.candidates.length}</b>
                <span className="text-[12px]">stations still possible</span>
              </div>
            </div>
            <p className="mt-1 text-[12px] text-ink-2">
              Time bonuses count if you're still holding them
            </p>
            <div className="mt-2">
              <TabRow
                tabs={[
                  { id: "zone", label: "Zone" },
                  { id: "hand", label: `Hand · ${view.hand.length}` },
                ]}
                active={hand ? "hand" : "zone"}
                onSelect={setTab}
              />
            </div>
          </section>
        )}
        <div className="flex justify-end px-4 pt-1">
          <button
            type="button"
            disabled={busy}
            className="text-[12px] text-ink-2 underline decoration-grout"
            onClick={() => setLeaving(true)}
          >
            Leave this round
          </button>
        </div>
        {leaving && (
          <div className="mx-4 mt-2">
            <Notice
              onDismiss={() => setLeaving(false)}
              dismissLabel="Stay"
              actions={
                <Button
                  small
                  kind="ink"
                  disabled={busy}
                  onClick={() => {
                    setLeaving(false);
                    send({ type: "leaveHide" });
                  }}
                >
                  Leave round
                </Button>
              }
            >
              Leave this round? It won't count.
            </Notice>
          </div>
        )}
        {notice && (
          <div className="mx-4 mt-2">
            <Notice onDismiss={dismissNotice}>{notice}</Notice>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {incoming && (
            <Incoming
              key={incoming.index}
              incoming={incoming}
              question={view.asked[incoming.index] as SeenQuestion}
              view={view}
              world={world}
              t={t}
              onPhoto={() => setPhoto(incoming.index)}
            />
          )}
          <CurseChips world={world} t={t} view={view} />
          {hiding ? (
            <>
              <TravelPanel world={world} t={t} />
              <section className="px-4 pt-4">
                <Rule>The seeker sees only this</Rule>
                <Lamps>
                  <Lamp lit={view.hideStatus === "riding"}>Riding</Lamp>
                  <Lamp lit={view.hideStatus === "changing"}>Changing trains</Lamp>
                  <Lamp lit={view.hideStatus === "walking"}>Walking</Lamp>
                </Lamps>
              </section>
            </>
          ) : hand ? (
            <HiderHand view={view} t={t} world={world} />
          ) : (
            <>
              {s.kind === "platform" && complex && (
                <>
                  <div className="sc-tilefield mx-4 mt-3 flex flex-col items-center gap-2 border border-grout p-3">
                    <span className="font-display text-[12px] font-bold uppercase tracking-[0.08em]">
                      Time's up · your station
                    </span>
                    <NameTablet text={displayName(complex.name)} tile={3.1} maxWidth={315} />
                    <Bullets routes={routesFor(world, complex.routes)} size={18} />
                  </div>
                  <div className="px-4 pt-2">
                    <Line>{LINES.hideDeadline}</Line>
                    <p className="mt-2 text-[13px]">
                      Walk anywhere within 400 m of it, but you can't leave.
                    </p>
                    <p className="mt-2 text-[12px] text-ink-2">
                      Come up by 10:35 or you'll be placed at the nearest exit and frozen.
                    </p>
                    <p className="mt-2 text-[12px] text-ink-2">
                      If the seeker enters your zone while you're underground, you're caught.
                    </p>
                  </div>
                  <section className="px-4 pt-4">
                    <Rule>Come up at</Rule>
                    {view.exits.map((e) => (
                      <button
                        type="button"
                        key={e.exit}
                        disabled={!e.allowed}
                        onClick={() => setPicked(e.exit)}
                        className={`sc-hide-exit sc-focus${exit?.exit === e.exit ? " sc-express-ink sc-grid-lines" : ""}`}
                      >
                        <b className="sc-hide-exit-number">{e.exit + 1}</b>
                        <span>Exit {e.exit + 1}</span>
                        <span className="ml-auto text-[12px]">
                          {!e.allowed ? "Outside your zone" : exit?.exit === e.exit ? "Picked" : ""}
                        </span>
                      </button>
                    ))}
                  </section>
                </>
              )}
              {s.kind === "walking" && s.reason === "exit" && <TravelPanel world={world} t={t} />}
              {(s.kind === "street" ||
                (s.kind === "walking" && s.reason === "street") ||
                view.lock) && (
                <section className="px-4 pt-4">
                  <div className={`sc-hide-lock${view.lock ? " locked" : ""}`}>
                    <i aria-hidden="true" />
                    <div>
                      <b className="font-display text-[12px] font-bold tracking-[0.08em] uppercase">
                        {view.lock
                          ? `${view.lock.cause === "hideHere" ? "Locked in" : "Frozen"} · since ${hhmm(view.lock.at)}`
                          : "Unlocked"}
                      </b>
                      <p className="mt-1 text-[12px] text-ink-2">
                        {view.lock
                          ? complex && displayName(complex.name)
                          : "Walk anywhere in your zone, then lock a spot."}
                      </p>
                    </div>
                  </div>
                  {view.lock ? (
                    <Line>{LINES.hideLocked}</Line>
                  ) : (
                    <div className="mt-4">
                      <Rule>You're locked when</Rule>
                      <ul className="sc-hide-rules">
                        <li>you press Hide here</li>
                        <li>the seeker comes up inside your zone</li>
                        <li>you answer a spot photo. They open at 10:35.</li>
                      </ul>
                    </div>
                  )}
                </section>
              )}
              <SeekerPosition view={view} world={world} t={t} />
              {view.entered && (
                <>
                  <SpotThumbnail view={view} />
                  <HiderHand view={view} world={world} t={t} />
                </>
              )}
            </>
          )}
          {!hiding && <QuestionLog world={world} />}
        </div>
        <Wainscot>
          {hiding ? (
            <TravelAction world={world} t={t} />
          ) : s.kind === "platform" && !view.lock ? (
            <>
              <Button
                kind="ink"
                keys="U"
                disabled={busy || !exit}
                onClick={() => exit && send({ type: "exit", exit: exit.exit })}
              >
                Up at Exit {(exit?.exit ?? 0) + 1}
              </Button>
              <WainscotText>2 min</WainscotText>
            </>
          ) : !view.lock && s.kind === "street" ? (
            <>
              <Button
                kind="terra"
                keys="H"
                disabled={busy || !view.spot}
                onClick={() => view.spot && send({ type: "hideHere", ...view.spot })}
              >
                Hide here
              </Button>
              <WainscotText>Locks you where you're standing</WainscotText>
            </>
          ) : (
            <div className="w-full">
              <button
                type="button"
                className="font-display text-[12px] font-bold uppercase tracking-[0.08em]"
                onClick={() => setTab("hand")}
              >
                Your hand · {view.hand.length}
              </button>
              <div className="mt-1 flex flex-wrap gap-1">
                {view.hand.map((c, i) => (
                  <span
                    className="border border-ink bg-glaze-hi px-1.5 py-1 text-[11px]"
                    // biome-ignore lint/suspicious/noArrayIndexKey: card indices identify copies within a hand revision
                    key={`${i}-${c}`}
                  >
                    {CARDS[c].title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Wainscot>
      </div>
      {pendingPhoto && (
        <HiderPhoto view={view} pending={pendingPhoto} t={t} onClose={() => setPhoto(null)} />
      )}
    </aside>
  );
}
export function Incoming({
  incoming,
  question,
  view,
  world,
  t,
  onPhoto,
}: {
  incoming: HiderView["incoming"][number];
  question: SeenQuestion;
  view: HiderView;
  world: World;
  t: number;
  onPhoto: () => void;
}) {
  const { send, busy, sync } = useGamePick("send", "busy", "sync");
  const left = Math.max(0, Math.ceil((question.answerAt - t) / (sync?.speed ?? 6)));
  const fam = familyOf(question.q);
  return (
    <section data-land="question" className="sc-anim-set mx-4 mt-3 border border-ink">
      <LocalBand
        family={fam}
        title={`Incoming · ${FAMILY_NAME[fam]} · from ${displayName(world.ds.complexes[question.ctx.origin.complex]?.name ?? "?")}`}
      />
      <div className="p-3">
        <b className="text-[14px]">{describeQuestion(question.q, world.ds, question.ctx)}</b>
        <p className="mt-2 text-[12px]">
          <b>{describeAnswer(incoming.trueAnswer, question.q, world.ds)}</b>
          {question.q.kind !== "photo" &&
            ` · would leave ${incoming.remaining} stations, yours among them`}
        </p>
        <div className="my-3 flex items-center justify-between text-[12px]">
          <span>Sent in {left} s</span>
          <TileTimer total={10} left={left} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {incoming.decision === null ? (
            <>
              {view.hand.includes("veto") && (
                <Button
                  keys="V"
                  disabled={busy}
                  onClick={() =>
                    send({ type: "answer", question: incoming.index, decision: "veto" })
                  }
                >
                  Play Veto
                </Button>
              )}
              {view.hand.includes("randomize") && (
                <Button
                  keys="R"
                  disabled={busy || !incoming.randomizable}
                  onClick={() =>
                    send({ type: "answer", question: incoming.index, decision: "randomize" })
                  }
                >
                  Randomize
                </Button>
              )}
              {question.q.kind === "photo" && (
                <Button kind="ink" onClick={onPhoto}>
                  Send photo
                </Button>
              )}
            </>
          ) : (
            <span className="text-[12px]">
              {incoming.decision === "true" ? "Answer" : CARDS[incoming.decision].title} ·{" "}
              {hhmm(question.answerAt)}
            </span>
          )}
        </div>
        <p className="mt-2 text-[12px] text-ink-2">
          It's sent when the window ends, whatever you do.
        </p>
      </div>
    </section>
  );
}
function SeekerPosition({ view, world, t }: { view: HiderView; world: World; t: number }) {
  const s = resolve(view.seeker, t, world.idx);
  const pos = world.geo.playerPosition(view.seeker, t);
  const own = view.spot ?? view.zone;
  const meters = own ? Math.round(distanceMeters(own, { lat: pos[1], lon: pos[0] })) : null;
  const location =
    s.kind === "platform"
      ? displayName(world.ds.stations[s.station]?.name ?? "")
      : s.kind === "train"
        ? `on the ${world.ds.routes[world.ds.trips[s.trip]?.route ?? -1]?.display ?? ""}`
        : "on foot";
  return (
    <section className="px-4 pt-4">
      <b className="text-[13px]">Seeker · {location}</b>
      {meters !== null && (
        <p className="mt-1 text-[12px] text-ink-2">
          {meters} m from you in a straight line.
          {view.entered && " They catch you within 25 m, once they see you."}
        </p>
      )}
      {view.entered && <Line>{LINES.hideZone}</Line>}
    </section>
  );
}
