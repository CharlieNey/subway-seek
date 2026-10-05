import type { Route } from "@stand-clear/data";
import {
  describeAnswer,
  describeQuestion,
  QUESTION_BONUS_SECONDS,
  type Question,
  questionError,
  questionOrigin,
  RADAR_MILES,
} from "@stand-clear/engine";
import { cn } from "./cn.ts";
import { useGame, type World } from "./game.ts";
import { RouteBullet } from "./RouteBullet.tsx";
import { ActionButton, Section } from "./ui.tsx";
import { formatClock } from "./useGameTime.ts";

const radarLabel = (m: number) => (m === 0.25 ? "¼ mi" : m === 0.5 ? "½ mi" : `${m} mi`);

const FACTS = [
  { kind: "borough", label: "In the same borough as me?" },
  { kind: "express", label: "Do express trains stop there?" },
  { kind: "moreRoutes", label: "More routes than at my station?" },
] as const;

/** One bullet per route letter, in MTA order (6X folds into 6). */
function questionRoutes({ ds }: World): Route[] {
  const seen = new Set<string>();
  return ds.routes.filter((r) => !seen.has(r.letter) && seen.add(r.letter));
}

/** The Ask tab: map questions about the hider's station. */
export function AskPanel({ world, t }: { world: World; t: number }) {
  const { view, send, busy } = useGame();
  if (!view) return null;
  const over = view.result !== null;
  const origin = questionOrigin(view.seeker, t, world.idx);
  const cooling = t < view.cooldownUntil;
  const blocked = busy || cooling || over;
  const ask = (question: Question) => send({ type: "ask", question });
  const thermoError = questionError(
    world.ds,
    { kind: "thermometer" },
    { origin, baseline: view.thermometer },
  );
  const nameOf = (complex: number) => world.ds.complexes[complex]?.name ?? "?";

  return (
    <>
      <div className="px-4 pb-3">
        <div className="text-xs text-stone-500">Asking from</div>
        <div className="text-lg font-semibold">{nameOf(origin.complex)}</div>
        <div className={cn("mt-1 text-xs", cooling ? "text-amber-700" : "text-stone-500")}>
          {cooling
            ? `Next question in ${Math.ceil((view.cooldownUntil - t) / 60)} game min`
            : "Ready to ask"}{" "}
          · each question gives the hider +{QUESTION_BONUS_SECONDS / 60} min
        </div>
      </div>

      <Section title="Radar: is your station within…">
        <div className="flex flex-wrap gap-1.5">
          {RADAR_MILES.map((miles) => (
            <ActionButton
              key={miles}
              quiet
              disabled={blocked}
              onClick={() => ask({ kind: "radar", miles })}
            >
              {radarLabel(miles)}
            </ActionButton>
          ))}
        </div>
      </Section>

      <Section title="Thermometer">
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
            disabled={blocked || thermoError !== null}
            onClick={() => ask({ kind: "thermometer" })}
          >
            Am I closer?
          </ActionButton>
        </div>
      </Section>

      <Section title="Does this route stop at your station?">
        <div className="flex flex-wrap gap-1.5">
          {questionRoutes(world).map((r) => (
            <button
              key={r.letter}
              type="button"
              disabled={blocked}
              title={describeQuestion({ kind: "route", letter: r.letter }, world.ds)}
              onClick={() => ask({ kind: "route", letter: r.letter })}
              className="rounded-full p-0.5 hover:ring-2 hover:ring-stone-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RouteBullet route={r} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="About your station">
        <ul className="space-y-1.5">
          {FACTS.map(({ kind, label }) => (
            <li key={kind} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{label}</span>
              <ActionButton quiet disabled={blocked} onClick={() => ask({ kind })}>
                Ask
              </ActionButton>
            </li>
          ))}
        </ul>
      </Section>

      <QuestionLog world={world} />
    </>
  );
}

export function QuestionLog({ world }: { world: World }) {
  const view = useGame((s) => s.view);
  if (!view || view.asked.length === 0) return null;
  return (
    <Section title={`Asked (${view.asked.length})`}>
      <ol className="space-y-2.5">
        {[...view.asked].reverse().map((a) => {
          const positive = a.answer === true || a.answer === "hotter";
          return (
            <li key={a.at} className="text-sm">
              <div className="flex items-start gap-2">
                <span className="flex-1">{describeQuestion(a.q, world.ds)}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-semibold",
                    positive ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-700",
                  )}
                >
                  {describeAnswer(a.answer)}
                </span>
              </div>
              <div className="text-xs text-stone-500">
                {formatClock(a.at).slice(0, 5)} from{" "}
                {world.ds.complexes[a.ctx.origin.complex]?.name} · {a.remaining}{" "}
                {a.remaining === 1 ? "station" : "stations"} left
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
