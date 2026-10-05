import type { Route } from "@stand-clear/data";
import { cn } from "./cn.ts";

/** An MTA-style route bullet: a circle, or a diamond for express variants (6X, 7X, FX). */
export function RouteBullet({ route, size = "md" }: { route: Route; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-5 w-5 text-[11px]" : "h-6 w-6 text-xs";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold leading-none",
        dim,
        route.diamond ? "rotate-45 rounded-[3px]" : "rounded-full",
      )}
      style={{ backgroundColor: `#${route.color}`, color: `#${route.textColor}` }}
      title={route.name}
    >
      <span className={route.diamond ? "-rotate-45" : undefined}>{route.display}</span>
    </span>
  );
}
