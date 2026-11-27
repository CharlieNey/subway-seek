import { describe, expect, it } from "vitest";
import { type BookComplex, bookTotals, nyToday, parseStamps, withStamp } from "./stamps.ts";

const book: BookComplex[] = [
  ["611", "Times Sq-42 St", "M", ["1", "2", "3", "7", "N"]],
  ["167", "W 4 St-Wash Sq", "M", ["A", "C", "E", "B", "D", "F", "M"]],
  ["630", "Atlantic Av-Barclays Ctr", "Bk", ["2", "3", "4", "5", "B", "Q"]],
];

describe("the stamp book", () => {
  it("keeps the first date a station was stamped", () => {
    let s = parseStamps(null);
    s = withStamp(s, "found", "611", "2026-11-27");
    s = withStamp(s, "found", "611", "2026-11-28");
    s = withStamp(s, "hidden", "611", "2026-11-29");
    expect(s).toEqual({ found: { "611": "2026-11-27" }, hidden: { "611": "2026-11-29" } });
  });

  it("drops entries that aren't stamps, so a bad one can't break the page", () => {
    const raw = JSON.stringify({
      found: { "611": "2026-11-27", "167": 5, "": "2026-11-27", x: "yesterday" },
      hidden: ["611"],
      extra: true,
    });
    expect(parseStamps(raw)).toEqual({ found: { "611": "2026-11-27" }, hidden: {} });
    expect(parseStamps("{")).toEqual({ found: {}, hidden: {} });
    expect(parseStamps("null")).toEqual({ found: {}, hidden: {} });
  });

  it("refuses a date that isn't one", () => {
    const s = parseStamps(null);
    expect(withStamp(s, "found", "611", "11/27/2026")).toBe(s);
  });

  it("totals the book, each borough and each line", () => {
    const s = withStamp(
      withStamp(parseStamps(null), "found", "611", "2026-11-27"),
      "hidden",
      "630",
      "2026-11-27",
    );
    const t = bookTotals(book, s);
    expect([t.found, t.hidden, t.total]).toEqual([1, 1, 3]);
    expect(t.byBorough).toEqual([
      { borough: "M", tally: { found: 1, hidden: 0, total: 2 } },
      { borough: "Bk", tally: { found: 0, hidden: 1, total: 1 } },
    ]);
    expect(t.byRoute.find((r) => r.route === "2")?.tally).toEqual({
      found: 1,
      hidden: 1,
      total: 2,
    });
    expect(t.byRoute.find((r) => r.route === "A")?.tally).toEqual({
      found: 0,
      hidden: 0,
      total: 1,
    });
  });

  it("dates a stamp by New York's day", () => {
    expect(nyToday(new Date("2026-11-28T03:00:00Z"))).toBe("2026-11-27");
    expect(nyToday(new Date("2026-11-28T06:00:00Z"))).toBe("2026-11-28");
  });
});
