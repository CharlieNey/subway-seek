import { hm } from "../ask.ts";
import { loadHideReplays, loadHideResults } from "../history.ts";

/** Hide scores are independent of the daily's lower-is-better seeking record. */
export function HideHistory() {
  const results = loadHideResults();
  const replays = loadHideReplays();
  const ids = [...new Set([...Object.keys(results), ...Object.keys(replays)])].sort(
    (a, b) => (results[b]?.at ?? replays[b]?.at ?? 0) - (results[a]?.at ?? replays[a]?.at ?? 0),
  );
  return (
    <section className="hp-s" id="hide-history">
      <div className="hp-s-head">
        <h2>Hide history</h2>
        <p>Kept in this browser.</p>
      </div>
      <div className="hp-panel">
        {ids.length === 0 ? (
          <p className="hp-first">You hide · Now boarding</p>
        ) : (
          ids.map((id) => {
            const result = results[id];
            const replay = replays[id];
            return (
              <div
                key={id}
                className="flex flex-wrap items-center gap-3 border-b border-grout py-3 text-[13px]"
              >
                <time>{new Date(result?.at ?? replay?.at ?? 0).toLocaleString()}</time>
                <span>You hide · {result?.difficulty ?? replay?.view.difficulty}</span>
                <b>
                  {result
                    ? `${result.found ? "Found" : "Not found"} · Your score ${hm(result.scoreSeconds)}`
                    : "Incomplete"}
                </b>
                {replay && (
                  <a className="sc-btn sm ml-auto" href={`/play?replay=${encodeURIComponent(id)}`}>
                    Watch replay
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
