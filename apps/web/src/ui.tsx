import type { Route } from "@stand-clear/data";
import type { ReactNode } from "react";
import { cn } from "./cn.ts";
import type { World } from "./game.ts";
import { RouteBullet } from "./RouteBullet.tsx";

export const routesFor = ({ ds }: World, letters: string[]): Route[] =>
  letters.map((l) => ds.routes.find((r) => r.letter === l)).filter((r) => r !== undefined);

export function Bullets({ routes }: { routes: Route[] }) {
  return (
    <span className="inline-flex gap-0.5">
      {routes.map((r) => (
        <RouteBullet key={r.id} route={r} size="sm" />
      ))}
    </span>
  );
}

export function StationName({ world, station }: { world: World; station: number }) {
  const st = world.ds.stations[station];
  if (!st) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{st.name}</span>
      <Bullets routes={routesFor(world, st.routes)} />
    </span>
  );
}

export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-stone-200 px-4 py-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ActionButton({
  children,
  onClick,
  disabled,
  quiet,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  quiet?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        quiet
          ? "border border-stone-300 text-stone-700 hover:bg-stone-100"
          : "bg-stone-900 text-white hover:bg-stone-700",
      )}
    >
      {children}
    </button>
  );
}
