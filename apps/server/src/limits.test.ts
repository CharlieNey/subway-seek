import { describe, expect, it } from "vitest";
import { clientAddress, originAllowed, parseOrigins, RateLimiter } from "./limits.ts";

describe("RateLimiter", () => {
  it("allows up to the limit in the window, then refuses until events age out", () => {
    const l = new RateLimiter(3, 1000);
    expect(l.allow("a", 0)).toBe(true);
    expect(l.allow("a", 100)).toBe(true);
    expect(l.allow("a", 200)).toBe(true);
    expect(l.allow("a", 300)).toBe(false);
    expect(l.allow("b", 300)).toBe(true); // another key is separate
    expect(l.allow("a", 1001)).toBe(true); // the event at 0 has aged out
    expect(l.allow("a", 1050)).toBe(false);
  });

  it("sweeps keys with nothing in the window", () => {
    const l = new RateLimiter(1, 1000);
    l.allow("a", 0);
    l.sweep(500);
    expect(l.allow("a", 600)).toBe(false); // still in the window, kept
    l.sweep(2000);
    expect(l.allow("a", 2000)).toBe(true); // forgotten, so allowed again
  });
});

describe("clientAddress", () => {
  const spoofed = { "fly-client-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 5.6.7.8" };

  it("ignores forwarding headers unless the deploy trusts one", () => {
    // Straight on, a client could rotate these to dodge the new-round limit.
    expect(clientAddress(spoofed, "::1")).toBe("::1");
    expect(clientAddress(spoofed, "::1", "")).toBe("::1");
    expect(clientAddress({}, undefined)).toBe("unknown");
  });

  it("reads the trusted header: the last forwarded hop, or a single-address header", () => {
    expect(clientAddress(spoofed, "::1", "x-forwarded-for")).toBe("5.6.7.8");
    expect(
      clientAddress({ "x-forwarded-for": ["9.9.9.9", "5.6.7.8"] }, "::1", "X-Forwarded-For"),
    ).toBe("5.6.7.8");
    expect(clientAddress(spoofed, "::1", "fly-client-ip")).toBe("1.2.3.4");
    // Trusted but missing: the socket.
    expect(clientAddress({}, "10.0.0.2", "fly-client-ip")).toBe("10.0.0.2");
  });
});

describe("originAllowed", () => {
  it("lets scripts without an Origin through; the rate limits cover them", () => {
    expect(originAllowed(undefined, null)).toBe(true);
    expect(originAllowed(undefined, ["https://play.example"])).toBe(true);
  });

  it("with ALLOWED_ORIGINS, takes exactly those origins", () => {
    const allowed = parseOrigins("https://play.example/, https://x.pages.dev");
    expect(allowed).toEqual(["https://play.example", "https://x.pages.dev"]);
    expect(originAllowed("https://play.example", allowed)).toBe(true);
    expect(originAllowed("https://x.pages.dev", allowed)).toBe(true);
    expect(originAllowed("https://evil.example", allowed)).toBe(false);
    expect(originAllowed("http://play.example", allowed)).toBe(false);
    expect(originAllowed("http://localhost:5173", allowed)).toBe(false);
  });

  it("unset, takes local and private-network pages only", () => {
    for (const o of [
      "http://localhost:5173",
      "http://127.0.0.1:5180",
      "http://192.168.1.20:5173",
      "http://10.0.0.5:5173",
      "http://172.17.0.2:5180",
    ])
      expect(originAllowed(o, null)).toBe(true);
    for (const o of ["https://evil.example", "http://172.32.0.1", "null", "not a url"])
      expect(originAllowed(o, null)).toBe(false);
    expect(parseOrigins(undefined)).toBeNull();
    expect(parseOrigins(" , ")).toBeNull();
  });
});
