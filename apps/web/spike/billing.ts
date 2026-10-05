/**
 * Dev-only billing test: does stepping one StreetViewPanorama between panoramas
 * (setPano) count as billable Maps JS usage, like creating one does?
 *
 *   A  create ONE panorama                 (expected: 1)
 *   B  20 StreetViewService lookups         (docs: not billed)
 *   C  setPano through those 20 panoramas   (the open question)
 *
 * Phases are ~150 s apart so they land in different minutes of Cloud Monitoring's
 * `serviceruntime.googleapis.com/quota/rate/net_usage` for maps-backend.
 */
const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const GAP_MS = 150_000;
const STEPS = 20;

const logEl = document.getElementById("log") as HTMLElement;
const phases: { name: string; start: string; end?: string }[] = [];
(window as unknown as { __billing: typeof phases }).__billing = phases;
const log = (msg: string) => {
  logEl.textContent += `${new Date().toISOString().slice(11, 19)}Z  ${msg}\n`;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const phase = async (name: string, fn: () => Promise<void>) => {
  const p: (typeof phases)[number] = { name, start: new Date().toISOString() };
  phases.push(p);
  log(`${name}: start`);
  await fn();
  p.end = new Date().toISOString();
  log(`${name}: done`);
};

async function main() {
  await new Promise<void>((resolve) => {
    (window as unknown as Record<string, unknown>).__ready = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly&loading=async&callback=__ready`;
    document.head.append(s);
  });
  await google.maps.importLibrary("streetView");
  const start = { lat: 40.7355, lng: -73.9906 }; // Union Sq, 14 St side
  let pano!: google.maps.StreetViewPanorama;

  await phase("A create one panorama", async () => {
    pano = new google.maps.StreetViewPanorama(document.getElementById("pano") as HTMLElement, {
      position: start,
      clickToGo: false,
      linksControl: false,
    });
    await sleep(5000);
  });
  await sleep(GAP_MS);

  const chain: string[] = [];
  await phase(`B ${STEPS} lookups`, async () => {
    const sv = new google.maps.StreetViewService();
    const first = await sv.getPanorama({
      location: start,
      radius: 50,
      sources: [google.maps.StreetViewSource.GOOGLE, google.maps.StreetViewSource.OUTDOOR],
    });
    const id = first.data.location?.pano ?? pano.getPano();
    log(`start pano ${id?.slice(0, 6)}…, ${first.data.links?.length ?? 0} links`);
    // Breadth-first along links; skip any lookup Google fails on.
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length && chain.length < STEPS) {
      const cur = queue.shift() as string;
      try {
        const { data } = await sv.getPanorama({ pano: cur });
        for (const l of data.links ?? []) {
          if (l?.pano && !seen.has(l.pano) && chain.length < STEPS) {
            seen.add(l.pano);
            chain.push(l.pano);
            queue.push(l.pano);
          }
        }
      } catch (err) {
        log(`lookup failed (skipped): ${String(err).slice(0, 60)}`);
      }
    }
    log(`chain of ${chain.length} panoramas`);
  });
  await sleep(GAP_MS);

  await phase(`C setPano x${chain.length}`, async () => {
    for (const id of chain) {
      pano.setPano(id);
      await sleep(2000);
    }
  });
  log("all done");
}

main().catch((e) => log(`error: ${String(e)}`));
