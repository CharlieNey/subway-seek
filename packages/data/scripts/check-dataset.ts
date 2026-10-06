/**
 * How fresh is the pinned timetable? Prints the dataset's service day, feed version and
 * age, and warns when the pin is in the past or within a week. Never fails the build:
 * the game runs on any pinned day; the point is to notice before the day goes stale.
 *
 *   pnpm data:check
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../dataset/nyc-subway.json", import.meta.url));
const { meta } = JSON.parse(readFileSync(path, "utf8")) as {
  meta: { serviceDate: string; feedVersion: string; generatedAt: string; serviceIds: string[] };
};

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const days = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const until = Math.round(days(meta.serviceDate) - days(today));
const builtDaysAgo = Math.round((Date.now() - Date.parse(meta.generatedAt)) / 86_400_000);

console.log(
  `service day ${meta.serviceDate} (${meta.serviceIds.join(", ")}) · feed ${meta.feedVersion} · built ${builtDaysAgo} day(s) ago`,
);
const warn = (msg: string) => console.log(`::warning::${msg}\n${msg}`);
if (until < 0) {
  warn(
    `The pinned service day is ${-until} day(s) in the past. The game still runs, but the schedule no longer matches any real day: re-pin with \`pnpm data:build --refresh --date=<a coming Wednesday>\`.`,
  );
} else if (until < 7) {
  warn(`The pinned service day is ${until} day(s) away. Plan the re-pin (docs/DEPLOY.md).`);
} else {
  console.log(`${until} day(s) until the pinned service day.`);
}
