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
 * Messages per session in any 10 s: a player clicks a few a second at most, and a resend
 * after a reconnect is a handful. Past it the connection is closed (CLOSE_TOO_MANY_MESSAGES)
 * before the message is queued, so a flood can't pile up in memory.
 */
export const MESSAGES_PER_WINDOW = 40;
export const MESSAGE_WINDOW_MS = 10_000;

/**
 * Whether a WebSocket upgrade from `origin` may open a round. Browsers always send Origin
 * on a WebSocket; without this check any page could open rounds from its visitors'
 * browsers, counted against their addresses. No Origin means a script, not a browser,
 * and it could send any Origin anyway, so it isn't refused here (the rate limits cover it).
 * `allowed` is ALLOWED_ORIGINS split on commas. Unset outside production, local and
 * private-network pages may connect (a phone on the same Wi-Fi, a container).
 */
export function originAllowed(
  origin: string | undefined,
  allowed: readonly string[] | null,
): boolean {
  if (!origin) return true;
  if (allowed) return allowed.includes(origin.replace(/\/$/, ""));
  let host: string;
  try {
    host = new URL(origin).hostname;
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** ALLOWED_ORIGINS as a list ("https://a.example, https://b.example"), or null when unset. */
export function parseOrigins(value: string | undefined): string[] | null {
  const list = (value ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return list.length ? list : null;
}

/**
 * The client's address, for the per-address limit. A forwarding header is whatever the
 * client sent unless a proxy in front overwrites it, so one is read only when `trusted`
 * names it (CLIENT_IP_HEADER, set per host: docs/DEPLOY-PLAN.md). `x-forwarded-for` gives
 * its last hop, the address the proxy itself saw, since a client can put anything before
 * it; any other header (`fly-client-ip`, `x-real-ip`) is one address. Otherwise, and when
 * the header is missing, the socket's own address.
 */
export function clientAddress(
  headers: Record<string, string | string[] | undefined>,
  remote: string | undefined,
  trusted?: string,
): string {
  const name = trusted?.trim().toLowerCase();
  const raw = name ? headers[name] : undefined;
  const value = Array.isArray(raw) ? raw.join(",") : raw;
  const hops = value
    ?.split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const fromHeader = name === "x-forwarded-for" ? hops?.at(-1) : hops?.[0];
  return fromHeader || remote || "unknown";
}
