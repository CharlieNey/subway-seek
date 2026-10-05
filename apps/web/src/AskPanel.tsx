import type { LandmarkKind, Route } from "@stand-clear/data";
import {
  type AskContext,
  askReadyAt,
  describeAnswer,
  describeQuestion,
  LANDMARK_KINDS,
  LANDMARK_WORDS,
  landmarksWithin,
  milesText,
  PHOTO_LOOKS,
  type PhotoLook,
  QUESTION_RULES,
  type Question,
  type QuestionCategory,
  questionError,
  questionOrigin,
  RADAR_MILES,
  SPOT_PHOTOS_OPEN_SECONDS,
  TENTACLE_MILES,
} from "@stand-clear/engine";
import { type ReactNode, useState } from "react";
import { cn } from "./cn.ts";
import { type LandmarkPreview, useGame, type World } from "./game.ts";
import { RouteBullet } from "./RouteBullet.tsx";
import { photoUrl } from "./street.ts";
import { ActionButton, Section } from "./ui.tsx";
import { formatClock } from "./useGameTime.ts";

const radarLabel = (m: number) => (m === 0.25 ? "¼ mi" : m === 0.5 ? "½ mi" : `${m} mi`);
const LOOK_LABEL: Record<PhotoLook, string> = {
  N: "North",
  E: "East",
  S: "South",
  W: "West",
  up: "Up",
};
const LANDMARK_CHIP: Record<LandmarkKind, string> = {
  park: "Big park",
  museum: "Museum",
  library: "Library",
  hospital: "Hospital",
  zoo: "Zoo",
  airport: "Airport",
};
const CATEGORY_TITLE: Record<QuestionCategory, string> = {
  matching: "Matching · same as mine?",
  measuring: "Measuring · closer than me?",
  radar: "Radar · within…",
  thermometer: "Thermometer",
  tentacles: "Tentacles · which is nearest you?",
  photo: "Photos",
};
const TENTACLE_KINDS = LANDMARK_KINDS.filter((k) => TENTACLE_MILES[k] !== undefined);

/** The lines at the station you're asking from, one bullet per letter. */
function linesHere({ ds }: World, complex: number): Route[] {
  const letters = ds.complexes[complex]?.routes ?? [];
  const seen = new Set<string>();
  return ds.routes.filter(
    (r) => letters.includes(r.letter) && !seen.has(r.letter) && seen.add(r.letter),
  );
}

/** One category: its price and when it can next be asked. */
function Category({
  category,
  t,
  children,
}: {
  category: QuestionCategory;
  t: number;
  children: ReactNode;
}) {
  const view = useGame((s) => s.view);
  const ready = view ? askReadyAt(view.asked, category) : 0;
  const rules = QUESTION_RULES[category];
  return (
    <Section
      title={
        <span className="flex items-baseline justify-between gap-2">
          <span>{CATEGORY_TITLE[category]}</span>
          <span
            className={cn("font-normal normal-case tracking-normal", t < ready && "text-amber-700")}
          >
            +{rules.bonusSeconds / 60} min
            {t < ready ? ` · in ${Math.ceil((ready - t) / 60)} min` : ""}
          </span>
        </span>
      }
    >
      {children}
    </Section>
  );
}

/** A question button about landmarks: hovering pins them on the map. */
function LandmarkChip({
  question,
  preview,
  disabled,
  children,
  title,
}: {
  question: Question;
  preview: LandmarkPreview;
  disabled: boolean;
  children: ReactNode;
  title: string;
}) {
  const { send, setPreview } = useGame();
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseEnter={() => setPreview(preview)}
      onMouseLeave={() => setPreview(null)}
      onFocus={() => setPreview(preview)}
      onBlur={() => setPreview(null)}
      onClick={() => send({ type: "ask", question })}
      className="shrink-0 rounded-md border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** The Ask tab: questions about the hider's station, in Jet Lag's six categories. */
export function AskPanel({ world, t }: { world: World; t: number }) {
  const { view, send, busy } = useGame();
  if (!view) return null;
  const { ds } = world;
  const over = view.result !== null;
  const origin = questionOrigin(view.seeker, t, world.idx);
  const ctx: AskContext = { origin, baseline: null };
  const blocked = (category: QuestionCategory) =>
    busy || over || t < askReadyAt(view.asked, category);
  const ask = (question: Question) => send({ type: "ask", question });
  const thermoError = questionError(
    ds,
    { kind: "thermometer" },
    { origin, baseline: view.thermometer },
  );
  const nameOf = (complex: number) => ds.complexes[complex]?.name ?? "?";
  const spotOpensAt = view.seekStart + SPOT_PHOTOS_OPEN_SECONDS;

  return (
    <>
      <div className="px-4 pb-3">
        <div className="text-xs text-stone-500">Asking from</div>
        <div className="text-lg font-semibold">{nameOf(origin.complex)}</div>
        <div className="mt-1 text-xs text-stone-500">
          Each question adds minutes to the hider's score, and each kind has its own cooldown. Hover
          a landmark question to see them on the map.
        </div>
      </div>

      <Category category="matching" t={t}>
        <div className="mb-1 text-xs text-stone-500">Is your nearest … the same as mine?</div>
        <div className="flex flex-wrap gap-1.5">
          {LANDMARK_KINDS.map((kind) => {
            const q: Question = { kind: "matching", landmark: kind };
            return (
              <LandmarkChip
                key={kind}
                question={q}
                preview={{ kind }}
                disabled={blocked("matching")}
                title={describeQuestion(q, ds, ctx)}
              >
                {LANDMARK_CHIP[kind]}
              </LandmarkChip>
            );
          })}
        </div>
        <div className="mt-2.5 mb-1 text-xs text-stone-500">Your station</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionButton
            quiet
            disabled={blocked("matching")}
            onClick={() => ask({ kind: "borough" })}
          >
            Same borough?
          </ActionButton>
          <ActionButton
            quiet
            disabled={blocked("matching")}
            onClick={() => ask({ kind: "express" })}
          >
            {ds.complexes[origin.complex]?.express ? "Express stop too?" : "Local-only too?"}
          </ActionButton>
          <span className="ml-1 text-xs text-stone-500">Stops there:</span>
          {linesHere(world, origin.complex).map((r) => (
            <button
              key={r.letter}
              type="button"
              disabled={blocked("matching")}
              title={describeQuestion({ kind: "route", letter: r.letter }, ds)}
              onClick={() => ask({ kind: "route", letter: r.letter })}
              className="rounded-full p-0.5 hover:ring-2 hover:ring-stone-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RouteBullet route={r} size="sm" />
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-stone-400">
          You can ask about the lines that stop where you are.
        </p>
      </Category>

      <Category category="measuring" t={t}>
        <div className="mb-1 text-xs text-stone-500">Are you closer to a … than me?</div>
        <div className="flex flex-wrap gap-1.5">
          {LANDMARK_KINDS.map((kind) => {
            const q: Question = { kind: "measuring", landmark: kind };
            return (
              <LandmarkChip
                key={kind}
                question={q}
                preview={{ kind }}
                disabled={blocked("measuring")}
                title={describeQuestion(q, ds, ctx)}
              >
                {LANDMARK_CHIP[kind]}
              </LandmarkChip>
            );
          })}
          <ActionButton
            quiet
            disabled={blocked("measuring")}
            onClick={() => ask({ kind: "moreRoutes" })}
          >
            More lines than mine?
          </ActionButton>
        </div>
      </Category>

      <Category category="radar" t={t}>
        <div className="flex flex-wrap gap-1.5">
          {RADAR_MILES.map((miles) => (
            <ActionButton
              key={miles}
              quiet
              disabled={blocked("radar")}
              onClick={() => ask({ kind: "radar", miles })}
            >
              {radarLabel(miles)}
            </ActionButton>
          ))}
        </div>
      </Category>

      <Category category="thermometer" t={t}>
        <p className="mb-2 text-sm text-stone-600">
          {view.thermometer
            ? `Started at ${nameOf(view.thermometer.complex)}. Move, then ask if you're closer.`
            : "Start it here, ride somewhere else, then ask if you got closer."}
        </p>
        <div className="flex gap-1.5">
          <ActionButton
            quiet
            disabled={busy || over}
            onClick={() => send({ type: "startThermometer" })}
          >
            {view.thermometer ? "Restart here" : "Start here (free)"}
          </ActionButton>
          <ActionButton
            disabled={blocked("thermometer") || thermoError !== null}
            onClick={() => ask({ kind: "thermometer" })}
          >
            Am I closer?
          </ActionButton>
        </div>
      </Category>

      <Category category="tentacles" t={t}>
        <div className="mb-1 text-xs text-stone-500">Of the … near me, which is nearest you?</div>
        <div className="flex flex-wrap gap-1.5">
          {TENTACLE_KINDS.map((kind) => {
            const miles = TENTACLE_MILES[kind] as number;
            const q: Question = { kind: "tentacles", landmark: kind };
            const n = landmarksWithin(ds, kind, origin, miles).length;
            return (
              <LandmarkChip
                key={kind}
                question={q}
                preview={{ kind, rangeMiles: miles }}
                disabled={blocked("tentacles") || n === 0}
                title={
                  n === 0
                    ? `No ${LANDMARK_WORDS[kind].many} within ${milesText(miles)} of you`
                    : describeQuestion(q, ds, ctx)
                }
              >
                {LANDMARK_WORDS[kind].many[0]?.toUpperCase()}
                {LANDMARK_WORDS[kind].many.slice(1)} · {n} within {radarLabel(miles)}
              </LandmarkChip>
            );
          })}
        </div>
      </Category>

      <Category category="photo" t={t}>
        <p className="mb-2 text-sm text-stone-600">
          A Street View photo, looking the way you choose.
        </p>
        <div className="space-y-2">
          <div>
            <div className="mb-1 text-xs text-stone-500">From their station's exit</div>
            <div className="flex flex-wrap gap-1.5">
              {PHOTO_LOOKS.map((look) => (
                <ActionButton
                  key={look}
                  quiet
                  disabled={blocked("photo")}
                  onClick={() => ask({ kind: "photo", from: "exit", look })}
                >
                  {LOOK_LABEL[look]}
                </ActionButton>
              ))}
            </div>
          </div>
          {view.hasSpot && (
            <div>
              <div className="mb-1 text-xs text-stone-500">
                From where they're hiding
                {t < spotOpensAt && ` · opens at ${formatClock(spotOpensAt).slice(0, 5)}`}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PHOTO_LOOKS.map((look) => (
                  <ActionButton
                    key={look}
                    quiet
                    disabled={blocked("photo") || t < spotOpensAt}
                    onClick={() => ask({ kind: "photo", from: "spot", look })}
                  >
                    {LOOK_LABEL[look]}
                  </ActionButton>
                ))}
              </div>
            </div>
          )}
        </div>
      </Category>

      <QuestionLog world={world} />
      <p className="px-4 pb-4 text-[11px] text-stone-400">{ds.landmarkAttribution}</p>
    </>
  );
}

export function QuestionLog({ world }: { world: World }) {
  const view = useGame((s) => s.view);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  if (!view || view.asked.length === 0) return null;
  return (
    <Section title={`Asked (${view.asked.length})`}>
      <ol className="space-y-2.5">
        {[...view.asked].reverse().map((a) => {
          const positive =
            a.answer === true ||
            a.answer === "hotter" ||
            (typeof a.answer === "object" && "landmark" in a.answer && a.answer.landmark !== null);
          const photo =
            typeof a.answer === "object" && "photo" in a.answer ? photoUrl(a.answer.photo) : null;
          return (
            <li key={a.at} className="text-sm">
              <div className="flex items-start gap-2">
                <span className="flex-1">{describeQuestion(a.q, world.ds, a.ctx)}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-semibold",
                    positive ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-700",
                  )}
                >
                  {describeAnswer(a.answer, a.q, world.ds)}
                </span>
              </div>
              {photo && (
                <button
                  type="button"
                  className="mt-1.5 block w-full"
                  onClick={() => setEnlarged(photo)}
                >
                  <img
                    src={photo}
                    alt="Street View from the hider, as asked"
                    className="w-full rounded-md"
                  />
                </button>
              )}
              <div className="text-xs text-stone-500">
                {formatClock(a.at).slice(0, 5)} from{" "}
                {world.ds.complexes[a.ctx.origin.complex]?.name} · {a.remaining}{" "}
                {a.remaining === 1 ? "station" : "stations"} left
              </div>
            </li>
          );
        })}
      </ol>
      {enlarged && (
        <button
          type="button"
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/70 p-6"
          onClick={() => setEnlarged(null)}
        >
          <img
            src={enlarged}
            alt="Street View from the hider, as asked"
            className="max-h-full max-w-full rounded-lg"
          />
        </button>
      )}
    </Section>
  );
}
