import { describe, expect, it } from "vitest";
import { clientAddress, RateLimiter } from "./limits.ts";

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
  it("prefers Fly's header, then the first forwarded hop, then the socket", () => {
    expect(clientAddress({ "fly-client-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }, "::1")).toBe(
      "1.2.3.4",
    );
    expect(clientAddress({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }, "::1")).toBe("5.6.7.8");
    expect(clientAddress({ "x-forwarded-for": ["5.6.7.8", "10.0.0.1"] }, "::1")).toBe("5.6.7.8");
    expect(clientAddress({}, "::1")).toBe("::1");
    expect(clientAddress({}, undefined)).toBe("unknown");
  });
});
