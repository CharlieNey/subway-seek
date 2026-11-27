/**
 * The Ask tab (DESIGN.md, Questions and Interaction; the Deck page, parts four, nine and
 * ten). Asking is select, see, confirm: a chip arms its question (ink), the map draws its
 * shape, a hint says what it does, and the wainscot confirms with the price. Ready
 * categories are blocks with their price band; a category that's cooling down collapses to
 * one rule-row with its next time, and opens for planning. No outcome counts, ever.
 */
import type { LandmarkKind, Route } from "@subway-seek/data";
import {
  categoryOf,
  describeQuestion,
  isAnswered,
  LANDMARK_KINDS,
  LANDMARK_WORDS,
  landmarksWithin,
  milesText,
  ON_FOOT_RANGE_M,
  QUESTION_RULES,
  type Question,
  type QuestionCategory,
  questionKey,
  questionOrigin,
  RADAR_MILES,
  resolve,
  type SeenQuestion,
  type SoloView,
  SPOT_PHOTOS_OPEN_SECONDS,
  SPOT_RADAR_METERS,
  searchGrid,
  TENTACLE_MILES,
  ZONE_RADIUS_M,
} from "@subway-seek/engine";
import { type ReactNode, useState } from "react";
import { create } from "zustand";
import {
  answerWord,
  chipState,
  closedKeys,
  distanceText,
  gapEndsAt,
  hhmm,
  metersText,
  questionHint,
  radarLabel,
  readyAt,
  shortQuestion,
  toggleArm,
} from "./ask.ts";
import { cn } from "./cn.ts";
import { useGame, useGamePick, type World } from "./game.ts";
import { canHover } from "./layout.ts";
import { useFirstRound } from "./learn.ts";
import { useIsNextQuestion, useNextTarget } from "./NextMove.tsx";
import { boroughName, displayName } from "./names.ts";
import { useNotHereList } from "./notHere.ts";
import {
  type ArrivedPhoto,
  arrivedPhotos,
  Compass,
  Lightbox,
  PendingPhoto,
  PhotoImage,
} from "./Photos.tsx";
import { searchScene } from "./searchArea.ts";
import { onStreet } from "./street.ts";
import { FAMILY_NAME, type Family, familyOf, familyOfCategory } from "./ui/family.ts";
import {
  AnswerWindow,
  Button,
  Chip,
  CoolRow,
  ExpressBand,
  FamilySquare,
  Line,
  LocalBand,
  Pict,
  RouteBullet,
  Rule,
  TileTimer,
} from "./ui/vocab.tsx";
import { LINES, lineFor, roundKey } from "./voice.ts";

const STATION_CATEGORIES = [
  "matching",
  "measuring",
  "radar",
  "thermometer",
  "tentacles",
  "photo",
] as const;
const TENTACLE_KINDS = LANDMARK_KINDS.filter((k) => TENTACLE_MILES[k] !== undefined);
const LANDMARK_CHIP: Record<LandmarkKind, string> = {
  park: "Big park",
  museum: "Museum",
  library: "Library",
  hospital: "Hospital",
  zoo: "Zoo",
  airport: "Airport",
};

const capital = (s: string) => (s[0]?.toUpperCase() ?? "") + s.slice(1);

/** The lines at the station you're asking from, one bullet per letter. */
function linesHere({ ds }: World, complex: number): Route[] {
  const letters = ds.complexes[complex]?.routes ?? [];
  const seen = new Set<string>();
  return ds.routes.filter(
    (r) => letters.includes(r.letter) && !seen.has(r.letter) && seen.add(r.letter),
  );
}

/** Everything a chip needs to know: its state, and the store's arm and hover. */
function useAsking(view: SoloView) {
  const armed = useGame((s) => s.armed);
  const hovered = useGame((s) => s.hovered);
  const arm = useGame((s) => s.arm);
  const hover = useGame((s) => s.hover);
  const closed = closedKeys(view);
  return {
    armed,
    hovered,
    state: (q: Question, cooling: boolean) => chipState(q, { armed, closed, cooling }),
    toggle: (q: Question) => arm(toggleArm(armed, q)),
    // A tap fires enter and focus too: on a touch screen only the armed question draws.
    hover: (q: Question | null) => (q === null || canHover()) && hover(q),
  };
}

/** A question chip with a family square (or a landmark's plaque). */
function QChip({
  q,
  cooling,
  children,
  pict,
  count,
  keys,
  dim,
  title,
  view,
  wide,
}: {
  q: Question;
  cooling: boolean;
  children: ReactNode;
  wide?: boolean;
  pict?: LandmarkKind;
  count?: ReactNode;
  keys?: string;
  /** Can't be asked from here at all (no landmarks in range): dimmed, with its reason. */
  dim?: string;
  title?: string;
  view: SoloView;
}) {
  const a = useAsking(view);
  const state = a.state(q, cooling || !!dim);
  const next = useIsNextQuestion(q);
  return (
    <Chip
      family={familyOf(q)}
      state={state}
      next={next && state === "ready"}
      wide={wide}
      pict={pict}
      count={count}
      keys={keys}
      title={dim ?? title}
      onClick={() => a.toggle(q)}
      onHover={(on) => a.hover(on ? q : null)}
    >
      {children}
    </Chip>
  );
}

/** A route bullet as a chip: route choices stay MTA circles. */
function RouteChip({ route, cooling, view }: { route: Route; cooling: boolean; view: SoloView }) {
  const a = useAsking(view);
  const q: Question = { kind: "route", letter: route.letter };
  const state = a.state(q, cooling);
  const next = useIsNextQuestion(q);
  return (
    <button
      type="button"
      data-chip=""
      data-next={(next && state === "ready") || undefined}
      aria-pressed={state === "armed"}
      aria-label={`Does the ${route.display} stop there?`}
      title={
        state === "closed" ? "Vetoed · closed this round" : `Does the ${route.display} stop there?`
      }
      onClick={state === "closed" ? undefined : () => a.toggle(q)}
      onMouseEnter={() => a.hover(q)}
      onMouseLeave={() => a.hover(null)}
      onFocus={() => a.hover(q)}
      onBlur={() => a.hover(null)}
      className={cn(
        "sc-focus sc-route-chip p-[2px]",
        state === "armed" && "shadow-[0_0_0_2px_var(--color-ink)]",
        state === "cooling" && "opacity-40",
        state === "closed" && "cursor-not-allowed opacity-30",
      )}
    >
      <RouteBullet route={route} size={22} />
    </button>
  );
}

/** The hint under a category: what the hovered (or armed) question does, never its counts. */
function CategoryHint({
  family,
  category,
  world,
  view,
  t,
}: {
  family: Family;
  category: QuestionCategory;
  world: World;
  view: SoloView;
  t: number;
}) {
  const { armed, hovered } = useAsking(view);
  const q = [hovered, armed].find((x) => x && categoryOf(x) === category) ?? null;
  if (!q) return null;
  const hint = questionHint(q, view, t, world.idx, {
    complexName: (c) => displayName(world.ds.complexes[c]?.name ?? "?"),
    borough: (c) => boroughName(world.ds.complexes[c]?.borough),
  });
  const ready = readyAt(view, category);
  const cooling = t < ready;
  return (
    <div className="flex gap-[9px] bg-glaze px-2.5 py-2 text-[12.5px] leading-[1.4] shadow-[inset_0_0_0_1px_var(--color-grout)]">
      <span className="mt-[3px]">
        <FamilySquare family={family} />
      </span>
      <span>
        <b className="font-semibold">{hint.lead}</b> {hint.rest}
        {/* No family name: the hint sits under its own band, and On foot's square is radar's. */}
        {cooling && ` Cooling down, so this is a preview. Ready at ${hhmm(ready)}.`}
      </span>
    </div>
  );
}

/**
 * One category: a block with its local band and chips while it's ready; one rule-row with
 * its next time while it cools down, which opens to show its dimmed chips for planning.
 */
function Category({
  category,
  t,
  view,
  title,
  family,
  children,
  world,
  open,
  onToggle,
}: {
  category: QuestionCategory;
  t: number;
  view: SoloView;
  title: string;
  family: Family | "ink";
  children: (cooling: boolean) => ReactNode;
  world: World;
  open: boolean;
  onToggle: () => void;
}) {
  const ready = readyAt(view, category);
  const cooling = t < ready;
  // The header counts down the 5-min gap every category shares; a row shows its own time
  // only when its cooldown runs past that.
  const ownCooldown = ready > gapEndsAt(view);
  const price = `+${QUESTION_RULES[category].bonusSeconds / 60} min`;
  const squareFamily: Family = family === "ink" ? "radar" : family;
  if (cooling && !open) {
    return (
      <div className="mx-4 mt-2.5">
        <CoolRow
          family={squareFamily}
          label={title.split(" · ")[0]}
          next={ownCooldown ? `next ${hhmm(ready)}` : "after the gap"}
          open={false}
          onToggle={onToggle}
        />
      </div>
    );
  }
  return (
    <section className="mx-4 mt-2.5">
      <button
        type="button"
        className="sc-focus block w-full text-left"
        onClick={cooling ? onToggle : undefined}
        aria-expanded={cooling ? true : undefined}
        tabIndex={cooling ? 0 : -1}
      >
        {family === "ink" ? (
          <div className="sc-band-local sc-grid-lines fam-ink">
            <span>{title}</span>
            <span className="sc-band-price">{price}</span>
          </div>
        ) : (
          <LocalBand
            family={family}
            title={title}
            price={cooling && ownCooldown ? `${price} · next ${hhmm(ready)}` : price}
          />
        )}
      </button>
      <div className="flex flex-col gap-[7px] pt-2 pb-1">
        {children(cooling)}
        <CategoryHint family={squareFamily} category={category} world={world} view={view} t={t} />
      </div>
    </section>
  );
}

const Prompt = ({ children }: { children: ReactNode }) => (
  <p className="text-[12px] text-ink-2">{children}</p>
);

/** A free action in the chip row (start the thermometer): no square, no price. */
function FreeChip({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="sc-chip sc-focus"
      data-state={disabled ? "cooling" : "ready"}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** "Asking from" and the 5-minute gap as five tiles. */
function AskingFrom({
  world,
  view,
  t,
  onFoot,
}: {
  world: World;
  view: SoloView;
  t: number;
  onFoot: boolean;
}) {
  const origin = questionOrigin(view.seeker, t, world.idx);
  const name = displayName(world.ds.complexes[origin.complex]?.name ?? "?");
  const gapLeft = Math.max(0, gapEndsAt(view) - t);
  // Which kinds are ready, in the families' own names, as the rows label them.
  const kinds = STATION_CATEGORIES.filter((c) => c !== "photo");
  const ready = kinds
    .filter((c) => t >= readyAt(view, c))
    .map((c) => FAMILY_NAME[familyOfCategory(c)]);
  const resting = kinds
    .filter((c) => t < readyAt(view, c))
    .map((c) => FAMILY_NAME[familyOfCategory(c)]);
  return (
    <>
      <div className="flex items-end justify-between gap-2.5 px-4 pt-3 pb-1">
        <div className="min-w-0">
          <small className="block font-display text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">
            Asking from
          </small>
          <b className="text-[17px] leading-tight font-bold">
            {onFoot ? `The street near ${name}` : name}
          </b>
        </div>
        <div className="flex flex-col items-end gap-1 text-right text-[12px] text-ink-2">
          {gapLeft > 0 ? (
            <>
              <span>One question every 5 min · next at {hhmm(gapEndsAt(view))}</span>
              <TileTimer total={5} left={gapLeft / 60} size={9} />
            </>
          ) : (
            <span>You can ask now</span>
          )}
        </div>
      </div>
      {gapLeft <= 0 && resting.length > 0 && (
        <p className="px-4 pb-1 text-[12px] leading-[1.4] text-ink-2">
          Ready now: {ready.join(", ") || "none"}. Each kind of question rests after you ask it (
          {resting.join(", ")} later).
        </p>
      )}
    </>
  );
}

/** On foot: the street radar and the walking hotter-or-colder, about the exact spot. */
function OnFootBlock({
  world,
  view,
  t,
  open,
  onToggle,
}: {
  world: World;
  view: SoloView;
  t: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { send, busy } = useGamePick("send", "busy");
  const standing = resolve(view.seeker, t, world.idx).kind === "street";
  const search = searchScene(world, view, t);
  const center = search ? world.ds.complexes[search.complex] : undefined;
  const leftPct =
    search && center
      ? Math.round((search.possible.length / searchGrid(center).length) * 100)
      : null;
  return (
    <Category
      category="onFoot"
      t={t}
      view={view}
      world={world}
      title="On foot · their exact spot"
      family="ink"
      open={open}
      onToggle={onToggle}
    >
      {(cooling) => (
        <>
          {/* The share left is the hero number above and the map's legend; only the end state is news here. */}
          {leftPct === 0 && (
            <div className="text-[13px] font-semibold">
              Nowhere in your circle fits: they're not near this station.
            </div>
          )}
          <Prompt>Is your spot within … of me?</Prompt>
          <div className="sc-chips">
            {SPOT_RADAR_METERS.map((meters) => (
              <QChip key={meters} q={{ kind: "spotRadar", meters }} cooling={cooling} view={view}>
                {meters} m
              </QChip>
            ))}
          </div>
          <Prompt>
            Hotter or colder:{" "}
            {view.footThermometer
              ? "walk at least 30 m, then ask if you got closer."
              : "start it here, walk, then ask if you got closer."}
          </Prompt>
          <div className="sc-chips">
            <FreeChip
              disabled={busy || !standing}
              onClick={() => send({ type: "startFootThermometer" })}
            >
              {view.footThermometer ? "Restart here · free" : "Start here · free"}
            </FreeChip>
            <QChip q={{ kind: "spotThermometer" }} cooling={cooling} view={view}>
              Hotter or colder?
            </QChip>
          </div>
          <p className="text-[11.5px] leading-[1.4] text-ink-2">
            "Not near you" means they're more than {ON_FOOT_RANGE_M} m away. It clears only the{" "}
            {ON_FOOT_RANGE_M - ZONE_RADIUS_M} m around you.
          </p>
        </>
      )}
    </Category>
  );
}

function PhotosBlock({
  world,
  view,
  t,
  open,
  onToggle,
}: {
  world: World;
  view: SoloView;
  t: number;
  open: boolean;
  onToggle: () => void;
}) {
  const a = useAsking(view);
  const opens = view.seekStart + SPOT_PHOTOS_OPEN_SECONDS;
  return (
    <Category
      category="photo"
      t={t}
      view={view}
      world={world}
      title="Photos"
      family="photo"
      open={open}
      onToggle={onToggle}
    >
      {(cooling) => (
        <>
          <Prompt>A Street View photo, facing the way you pick.</Prompt>
          <div className="flex gap-[18px]">
            <Compass
              label="From their station's exit"
              from="exit"
              stateOf={(q) => a.state(q, cooling || !view.hasExitPhoto)}
              onArm={a.toggle}
              onHover={a.hover}
              dimmed={cooling}
              unavailable={view.hasExitPhoto ? undefined : "No exit photo this round."}
            />
            {view.hasSpot && (
              <Compass
                label={
                  t < opens ? `From their spot · opens ${hhmm(opens)}` : "From where they're hiding"
                }
                from="spot"
                stateOf={(q) => a.state(q, cooling || t < opens)}
                onArm={a.toggle}
                onHover={a.hover}
                dimmed={cooling || t < opens}
              />
            )}
          </div>
        </>
      )}
    </Category>
  );
}

/** The five station categories, ready ones as blocks and cooling ones as rule-rows. */
/** Whether a first round's "More questions" is open, kept for the round's page. */
const useMoreQuestions = create<{ open: boolean; set: (open: boolean) => void }>((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

/** A question's sentence, as the band and the log say it. */
function sentence(q: Question, world: World, view: SoloView, t: number): string {
  return describeQuestion(q, world.ds, askContextFor(q, view, t, world));
}

function askContextFor(q: Question, view: SoloView, t: number, world: World) {
  return {
    origin: questionOrigin(view.seeker, t, world.idx),
    baseline: q.kind === "thermometer" ? view.thermometer : null,
  };
}

/** When this family can next be asked, in words, if that's later than the shared gap. */
function waitText(view: SoloView, t: number, category: QuestionCategory): string | null {
  const ready = readyAt(view, category);
  if (t >= ready || ready <= gapEndsAt(view)) return null;
  return `again at ${hhmm(ready)}`;
}

/** The small label at a row's end: the family, its wait, and in later rounds its price. */
function RowLabel({
  category,
  view,
  t,
}: {
  category: Exclude<QuestionCategory, "onFoot">;
  view: SoloView;
  t: number;
}) {
  const first = useFirstRound();
  const wait = waitText(view, t, category);
  const price = first ? null : `+${QUESTION_RULES[category].bonusSeconds / 60} min`;
  return (
    <span className="sc-ask-label">
      {[FAMILY_NAME[familyOfCategory(category)], wait, price].filter(Boolean).join(" · ")}
    </span>
  );
}

/** One question in sentence form, its options under it, and what Yes and No do. */
function AskRow({
  family,
  text,
  chip,
  label,
  options,
  dim,
}: {
  family: Family;
  /** The sentence, with options under it. */
  text?: ReactNode;
  /** Or the question itself as one wide chip, when there's nothing to choose. */
  chip?: ReactNode;
  label: ReactNode;
  options?: ReactNode;
  dim: boolean;
}) {
  return (
    <div className="sc-ask-row" data-dim={dim || undefined}>
      {chip ?? (
        <p className="sc-ask-sentence">
          <FamilySquare family={family} />
          <span className="min-w-0 flex-1">{text}</span>
        </p>
      )}
      {options && <div className="sc-chips">{options}</div>}
      <p className="sc-ask-yesno">{label}</p>
    </div>
  );
}

/** The hovered or armed question's hint, under the group it belongs to. */
function GroupHint({
  kinds,
  world,
  view,
  t,
}: {
  kinds: readonly Question["kind"][];
  world: World;
  view: SoloView;
  t: number;
}) {
  const { armed, hovered } = useAsking(view);
  const q = [hovered, armed].find((x) => x && kinds.includes(x.kind)) ?? null;
  if (!q) return null;
  const hint = questionHint(q, view, t, world.idx, {
    complexName: (c) => displayName(world.ds.complexes[c]?.name ?? "?"),
    borough: (c) => boroughName(world.ds.complexes[c]?.borough),
  });
  const category = categoryOf(q);
  const ready = readyAt(view, category);
  return (
    <div className="flex gap-[9px] bg-glaze px-2.5 py-2 text-[12.5px] leading-[1.4] shadow-[inset_0_0_0_1px_var(--color-grout)]">
      <span className="mt-[3px]">
        <FamilySquare family={familyOf(q)} />
      </span>
      <span>
        <b className="font-semibold">{hint.lead}</b> {hint.rest}
        {t < ready &&
          ` You can ask it at ${hhmm(ready)}. Choose it now, then press Ask once it's ready.`}
      </span>
    </div>
  );
}

function Group({
  title,
  children,
  kinds,
  world,
  view,
  t,
}: {
  title: string;
  children: ReactNode;
  kinds: readonly Question["kind"][];
  world: World;
  view: SoloView;
  t: number;
}) {
  return (
    <section className="mx-4 mt-3">
      <Rule>{title}</Rule>
      <div className="flex flex-col gap-3 pt-2">
        {children}
        <GroupHint kinds={kinds} world={world} view={view} t={t} />
      </div>
    </section>
  );
}

/**
 * The good next question, in practice rounds (nextMove.ts): the thrifty seeker's pick
 * from the stations still possible, as a sentence with a button that chooses it.
 */
function GoodNext({ world, view, t }: { world: World; view: SoloView; t: number }) {
  const target = useNextTarget();
  const { armed, toggle } = useAsking(view);
  if (target.kind !== "question") return null;
  const q = target.q;
  const chosen = armed !== null && questionKey(armed) === questionKey(q);
  return (
    <section className="sc-good-next mx-4 mt-3">
      <Rule>A good next question</Rule>
      <div className="flex flex-col gap-2 pt-2">
        <p className="sc-ask-sentence">
          <FamilySquare family={familyOf(q)} />
          <span className="min-w-0 flex-1">{sentence(q, world, view, t)}</span>
        </p>
        <div>
          <Button small next={!chosen} onClick={() => !chosen && toggle(q)}>
            {chosen ? "Chosen · press Ask below" : "Choose this question"}
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * The station questions as sentences (DESIGN.md, Interaction: the playable round), grouped
 * by what they ask about. A family that's waiting dims in place with its time; nothing
 * collapses after you ask. In a first round the places and the thermometer fold away.
 */
function StationQuestions({
  world,
  view,
  t,
  skipPhotos,
  opened,
  toggle,
}: {
  world: World;
  view: SoloView;
  t: number;
  skipPhotos?: boolean;
  opened: Set<string>;
  toggle: (c: string) => void;
}) {
  const { ds } = world;
  const { send, busy } = useGamePick("send", "busy");
  const first = useFirstRound();
  // Open or closed stays put as you change tab or station (it closed itself every time).
  const more = useMoreQuestions((m) => m.open);
  const setMore = useMoreQuestions((m) => m.set);
  const origin = questionOrigin(view.seeker, t, world.idx);
  const cooling = (c: QuestionCategory) => t < readyAt(view, c);
  const thermoFrom = view.thermometer;
  const moved = thermoFrom
    ? Math.hypot(
        (origin.lat - thermoFrom.lat) * 111_320,
        (origin.lon - thermoFrom.lon) * 111_320 * Math.cos((origin.lat * Math.PI) / 180),
      )
    : 0;
  const landmarkChips = (kind: "matching" | "measuring") =>
    LANDMARK_KINDS.map((landmark) => (
      <QChip
        key={landmark}
        q={{ kind, landmark }}
        cooling={cooling(kind)}
        pict={landmark}
        view={view}
      >
        {LANDMARK_CHIP[landmark]}
      </QChip>
    ));
  const showMore = !first || more;
  return (
    <>
      <Group title="How far" kinds={["radar"]} world={world} view={view} t={t}>
        <AskRow
          family="radar"
          dim={cooling("radar")}
          text="Is your station within … of me?"
          label={<RowLabel category="radar" view={view} t={t} />}
          options={RADAR_MILES.map((miles, i) => (
            <QChip
              key={miles}
              q={{ kind: "radar", miles }}
              cooling={cooling("radar")}
              keys={canHover() ? String(i + 1) : undefined}
              view={view}
            >
              {milesText(miles)}
            </QChip>
          ))}
        />
      </Group>
      <Group
        title="Your station"
        kinds={["route", "borough", "express", "moreRoutes"]}
        world={world}
        view={view}
        t={t}
      >
        <AskRow
          family="match"
          dim={cooling("matching")}
          text="Does this line stop at your station?"
          label={<RowLabel category="matching" view={view} t={t} />}
          options={linesHere(world, origin.complex).map((r) => (
            <RouteChip key={r.letter} route={r} cooling={cooling("matching")} view={view} />
          ))}
        />
        {(["borough", "express"] as const).map((kind) => (
          <AskRow
            key={kind}
            family="match"
            dim={cooling("matching")}
            chip={
              <QChip q={{ kind }} cooling={cooling("matching")} view={view} wide>
                {sentence({ kind }, world, view, t)}
              </QChip>
            }
            label={<RowLabel category="matching" view={view} t={t} />}
          />
        ))}
        <AskRow
          family="measure"
          dim={cooling("measuring")}
          chip={
            <QChip q={{ kind: "moreRoutes" }} cooling={cooling("measuring")} view={view} wide>
              {sentence({ kind: "moreRoutes" }, world, view, t)}
            </QChip>
          }
          label={<RowLabel category="measuring" view={view} t={t} />}
        />
      </Group>
      {first && (
        <div className="mx-4 mt-3">
          <button
            type="button"
            className="sc-focus text-[12.5px] text-ink-2 underline decoration-grout underline-offset-2"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            {more ? "Fewer questions" : "More questions: places near you, hotter or colder"}
          </button>
        </div>
      )}
      {showMore && (
        <>
          <Group
            title="Places near you"
            kinds={["matching", "measuring", "tentacles"]}
            world={world}
            view={view}
            t={t}
          >
            <AskRow
              family="match"
              dim={cooling("matching")}
              text="Is your nearest … the same as mine?"
              label={<RowLabel category="matching" view={view} t={t} />}
              options={landmarkChips("matching")}
            />
            <AskRow
              family="measure"
              dim={cooling("measuring")}
              text="Are you closer to a … than I am?"
              label={<RowLabel category="measuring" view={view} t={t} />}
              options={landmarkChips("measuring")}
            />
            <AskRow
              family="tent"
              dim={cooling("tentacles")}
              text="Of the … near me, which is nearest you?"
              label={<RowLabel category="tentacles" view={view} t={t} />}
              options={TENTACLE_KINDS.map((kind) => {
                const miles = TENTACLE_MILES[kind] as number;
                const n = landmarksWithin(ds, kind, origin, miles).length;
                return (
                  <QChip
                    key={kind}
                    q={{ kind: "tentacles", landmark: kind }}
                    cooling={cooling("tentacles")}
                    pict={kind}
                    count={
                      n === 0
                        ? `· none within ${radarLabel(miles)}`
                        : `· ${n} within ${radarLabel(miles)}`
                    }
                    dim={
                      n === 0
                        ? `No ${LANDMARK_WORDS[kind].many} within ${milesText(miles)} of you`
                        : undefined
                    }
                    view={view}
                  >
                    {capital(LANDMARK_WORDS[kind].many)}
                  </QChip>
                );
              })}
            />
          </Group>
          <Group title="Hotter or colder" kinds={["thermometer"]} world={world} view={view} t={t}>
            <AskRow
              family="thermo"
              dim={cooling("thermometer")}
              text={
                !thermoFrom
                  ? "Start here, ride somewhere else, then ask: am I closer to you than where I started?"
                  : thermoFrom.complex === origin.complex || moved < 400
                    ? `Started. Move 400 m to another station, then ask · ${metersText(moved)} so far`
                    : `Am I closer to you than ${displayName(ds.complexes[thermoFrom.complex]?.name ?? "?")}? (${distanceText(moved)} from it)`
              }
              label={<RowLabel category="thermometer" view={view} t={t} />}
              options={
                <>
                  <FreeChip disabled={busy} onClick={() => send({ type: "startThermometer" })}>
                    {thermoFrom ? "Start again here · free" : "Start here · free"}
                  </FreeChip>
                  <QChip q={{ kind: "thermometer" }} cooling={cooling("thermometer")} view={view}>
                    Am I closer?
                  </QChip>
                </>
              }
            />
          </Group>
        </>
      )}
      {!skipPhotos && (
        <PhotosBlock
          world={world}
          view={view}
          t={t}
          open={opened.has("photo")}
          onToggle={() => toggle("photo")}
        />
      )}
    </>
  );
}

/**
 * On foot, the station questions fold into one list with their next ready times, so the
 * On foot block and the photos lead.
 */
function FoldedStation({
  world,
  view,
  t,
  opened,
  toggle,
}: {
  world: World;
  view: SoloView;
  t: number;
  opened: Set<string>;
  toggle: (c: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <section className="mx-4 mt-2.5">
      <button
        type="button"
        className="sc-focus sc-band-local sc-grid-lines w-full text-left"
        style={{ backgroundColor: "#5c5852" }}
        aria-expanded={show}
        onClick={() => setShow(!show)}
      >
        <span>Station questions</span>
        <span className="sc-band-price">{show ? "Hide" : "Show"}</span>
      </button>
      {show ? (
        <div className="-mx-4">
          <StationQuestions
            world={world}
            view={view}
            t={t}
            opened={opened}
            toggle={toggle}
            skipPhotos
          />
        </div>
      ) : (
        <ul className="pt-1">
          {STATION_CATEGORIES.filter((c) => c !== "photo").map((c) => {
            const ready = readyAt(view, c);
            return (
              <li key={c} className="flex items-center gap-2.5 py-[5px] text-[13.5px]">
                <FamilySquare family={familyOfCategory(c)} />
                <span className="flex-1">{FAMILY_NAME[familyOfCategory(c)]}</span>
                <span className="text-[12px] text-ink-2 tabular-nums">
                  {t >= ready ? "ready" : `at ${hhmm(ready)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The Ask tab. */
export function AskPanel({
  world,
  t,
  guide,
}: {
  world: World;
  t: number;
  /** The guided first round's step, under the good next question (Guide.tsx). */
  guide?: ReactNode;
}) {
  const view = useGame((s) => s.view);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  if (!view) return null;
  const onFoot = view.hasSpot && onStreet(view, t, world);
  const toggle = (c: string) =>
    setOpened((s) => {
      const next = new Set(s);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  return (
    <>
      <AskingFrom world={world} view={view} t={t} onFoot={onFoot} />
      {onFoot ? (
        <>
          <OnFootBlock
            world={world}
            view={view}
            t={t}
            open={opened.has("onFoot")}
            onToggle={() => toggle("onFoot")}
          />
          <PhotosBlock
            world={world}
            view={view}
            t={t}
            open={opened.has("photo")}
            onToggle={() => toggle("photo")}
          />
          <FoldedStation world={world} view={view} t={t} opened={opened} toggle={toggle} />
        </>
      ) : (
        <>
          <GoodNext world={world} view={view} t={t} />
          {guide}
          <StationQuestions
            world={world}
            view={view}
            t={t}
            opened={opened}
            toggle={toggle}
            // No photos when the round ends at the station, or when there's nothing to photograph.
            skipPhotos={view.stationOnly || (!view.hasSpot && !view.hasExitPhoto)}
          />
        </>
      )}
      <QuestionLog world={world} />
      <p className="px-4 pt-3 pb-4 text-[10.5px] text-ink-3">{world.ds.landmarkAttribution}</p>
    </>
  );
}

// --- The band and the log ------------------------------------------------------------

/** How long an answer stays as the express band once it lands, before it joins the log. */
export const ANSWER_HOLD_MS = 10_000;

/** Real ms each answer landed on this page; answers that were in before it opened count as old. */
const landedAt = new Map<number, number>();
let primed = false;

/** The question that's the one thing that matters now: in its window, or just answered. */
export function liveQuestion(view: SoloView, now: number): SeenQuestion | null {
  if (!primed) {
    for (const a of view.asked) if (isAnswered(a)) landedAt.set(a.at, 0);
    primed = true;
  }
  for (const a of view.asked) if (isAnswered(a) && !landedAt.has(a.at)) landedAt.set(a.at, now);
  const last = view.asked.at(-1);
  if (!last || view.result) return null;
  if (!isAnswered(last)) return last;
  return now - (landedAt.get(last.at) ?? 0) < ANSWER_HOLD_MS ? last : null;
}

/** Forget answer times between rounds. */
export function resetLive() {
  landedAt.clear();
  primed = false;
}

/** Stations possible before this question's answer landed. */
function before(view: SoloView, a: SeenQuestion): number {
  const prev = view.asked.filter((x) => x.answerAt < a.answerAt && x.remaining !== null).at(-1);
  return prev?.remaining ?? view.reachable.length;
}

/**
 * The asked question as the express band in its family color: while its answer is on its
 * way, the ten-tile answer window ("Answer in 6 s"); then the answer and the count
 * ("59 stations → 6"), until it collapses into the log.
 */
export function QuestionBand({ a, world, t }: { a: SeenQuestion; world: World; t: number }) {
  // Stations you'd already stood in (notHere.ts) are out of the count at the top, so here too.
  const view = useGame((s) => s.view);
  const notHere = useNotHereList(view);
  const checkedBefore = notHere.length;
  const checkedAfter = view ? notHere.filter((c) => view.candidates.includes(c)).length : 0;
  const speed = useGame((s) => s.sync?.speed ?? 6);
  const [zoom, setZoom] = useState<number | null>(null);
  if (!view) return null;
  const family = familyOf(a.q);
  const origin = displayName(world.ds.complexes[a.ctx.origin.complex]?.name ?? "?");
  const answer = a.answer;
  const vetoed = typeof answer === "object" && answer !== null && "vetoed" in answer;
  const photos = arrivedPhotos(view);
  const photoIndex = photos.findIndex((p) => p.at === a.at);
  const photo: ArrivedPhoto | undefined = photos[photoIndex];
  const was = before(view, a);
  const label =
    answer === null
      ? `${FAMILY_NAME[family]} · asked ${hhmm(a.at)} · from ${origin}`
      : photo
        ? `${photo.q.from === "spot" ? "Spot" : "Exit"} photo · arrived ${hhmm(a.answerAt)}`
        : `${FAMILY_NAME[family]} · ${vetoed ? "vetoed" : "answered"}`;
  // The conductor (Voice): the round's first question on its way, and its first veto.
  const rk = roundKey(view);
  const voice =
    answer === null
      ? a === view.asked[0] && lineFor(rk, "firstQuestion", a.at)
        ? LINES.firstQuestion
        : null
      : vetoed && lineFor(rk, "veto", a.at)
        ? LINES.veto
        : null;
  const tentacle =
    a.q.kind === "tentacles" && answer && typeof answer === "object" && "landmark" in answer
      ? answer.landmark
      : null;
  return (
    <div className="mx-2.5 mt-1.5" data-answered={answer !== null || undefined}>
      <ExpressBand family={family} label={label} role="status">
        <p>{questionText(a, world)}</p>
        {answer === null ? (
          <>
            {a.q.kind === "photo" && <PendingPhoto a={a} />}
            <AnswerWindow secondsLeft={Math.max(0, (a.answerAt - t) / speed)} />
          </>
        ) : vetoed ? (
          <>
            <span className="sc-band-answer sc-anim-set flex items-center gap-2">
              <FamilySquare family={family} vetoed /> Vetoed
            </span>
            <span className="text-[12px] opacity-90">Closed for the round.</span>
          </>
        ) : photo ? (
          <>
            <PhotoImage p={photo} onZoom={() => setZoom(photoIndex)} />
            {view.hasSpot && onStreet(view, t, world) && photo.q.from === "spot" && (
              <span className="text-[12px] opacity-90">
                Pinned at the top while you're on foot · +15 min
              </span>
            )}
          </>
        ) : (
          <>
            <span className="sc-band-answer sc-anim-set flex items-center gap-2">
              {tentacle !== null && a.q.kind === "tentacles" && (
                <Pict kind={a.q.landmark} size={17} />
              )}
              {answerWord(answer, a.q, world.idx)}
            </span>
            {a.remaining !== null && categoryOf(a.q) !== "onFoot" && (
              <span className="text-[12px] tabular-nums opacity-90">
                {was - checkedBefore} {was - checkedBefore === 1 ? "station" : "stations"} →{" "}
                {a.remaining - checkedAfter}
              </span>
            )}
          </>
        )}
        {a.randomizedFrom && answer !== null && (
          <span className="text-[12px] opacity-90">
            The hider swapped it · you asked: {shortQuestion(a.randomizedFrom)}
          </span>
        )}
      </ExpressBand>
      {voice && (
        <div className="mx-1.5 mt-1">
          <Line>{voice}</Line>
        </div>
      )}
      {zoom !== null && (
        <Lightbox photos={photos} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
      )}
    </div>
  );
}

/** The question as asked, in the engine's words, with en dashes in station names. */
function questionText(a: SeenQuestion, world: World): string {
  return displayName(describeQuestion(a.q, world.ds, a.ctx));
}

/** The log: each question's family square, its time and origin, what was left, its answer. */
export function QuestionLog({ world, title = "Asked" }: { world: World; title?: string }) {
  const view = useGame((s) => s.view);
  const [zoom, setZoom] = useState<number | null>(null);
  if (!view || view.asked.length === 0) return null;
  const live = liveQuestion(view, Date.now());
  const rows = [...view.asked].filter((a) => a !== live).reverse();
  if (rows.length === 0) return null;
  const photos = arrivedPhotos(view);
  return (
    <section className="px-4 pt-4">
      <Rule>
        {title} · {view.asked.length}
      </Rule>
      <ol>
        {rows.map((a) => {
          const answer = a.answer;
          const vetoed = typeof answer === "object" && answer !== null && "vetoed" in answer;
          const pIndex = photos.findIndex((p) => p.at === a.at);
          const photo = photos[pIndex];
          return (
            <li
              key={a.at}
              className="flex items-start gap-2.5 border-b border-dashed border-grout py-[7px]"
            >
              <span className="mt-[3px]">
                <FamilySquare family={familyOf(a.q)} vetoed={vetoed} />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block text-[13px] leading-[1.3] font-semibold">
                  {shortQuestion(a.q)}
                </b>
                <span className="text-[11.5px] text-ink-2 tabular-nums">
                  {hhmm(a.at)} from{" "}
                  {displayName(world.ds.complexes[a.ctx.origin.complex]?.name ?? "?")}
                  {a.remaining !== null && categoryOf(a.q) !== "onFoot" && ` · ${a.remaining} left`}
                </span>
                {a.randomizedFrom && (
                  <span className="block text-[11.5px] text-ink-2">
                    {"role" in view
                      ? "Swapped · seeker asked: "
                      : "Swapped by the hider · you asked: "}
                    {shortQuestion(a.randomizedFrom)}
                  </span>
                )}
                {photo && (
                  <div className="mt-1.5">
                    <PhotoImage p={photo} onZoom={() => setZoom(pIndex)} small />
                  </div>
                )}
              </div>
              <em className="font-display text-[12px] font-bold tracking-[0.08em] whitespace-nowrap uppercase not-italic">
                {answer === null ? "…" : photo ? "" : answerWord(answer, a.q, world.idx)}
              </em>
            </li>
          );
        })}
      </ol>
      {zoom !== null && (
        <Lightbox photos={photos} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
      )}
    </section>
  );
}
