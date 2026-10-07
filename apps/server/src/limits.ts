/**
 * Rate limits, so a script can't open rounds or walk for ever. Each new round costs the
 * server up to twelve free Street View lookups and each street walk one more; Google
 * rate-limits those, so a flood from one address would stop everyone's lookups. Pure:
 * `now` is passed in, so tests can run it on a fake clock.
 */

/** A sliding window: at most `max` events per key in the last `windowMs`. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Record an event for `key` if it's within the limit; false when it isn't. */
  allow(key: string, now: number): boolean {
    const since = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  /** Forget keys with nothing in the window (call now and then; the map is unbounded otherwise). */
  sweep(now: number): void {
    const since = now - this.windowMs;
    for (const [key, list] of this.hits) {
      if (!list.some((t) => t > since)) this.hits.delete(key);
    }
  }
}

/** New rounds (connections without a session, or newRound intents) per address per hour. */
export const NEW_ROUNDS_PER_HOUR = 30;
/** Street walks per session per minute: a player clicks a few; a sweep script clicks hundreds. */
export const WALKS_PER_MINUTE = 40;
/** Live sessions the server keeps at once (connected or in their grace period). */
export const MAX_SESSIONS = 500;

/**
 * The client's address, behind Fly's proxy or straight on. Fly sets `fly-client-ip`;
 * other proxies set `x-forwarded-for` (first hop); otherwise the socket's own address.
 */
export function clientAddress(
  headers: Record<string, string | string[] | undefined>,
  remote: string | undefined,
): string {
  const fly = headers["fly-client-ip"];
  if (typeof fly === "string" && fly) return fly;
  const fwd = headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || remote || "unknown";
}
