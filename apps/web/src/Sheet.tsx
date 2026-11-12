/**
 * The component sheet (dev only, at /sheet): every role in the vocabulary, in every state,
 * at real size, laid out like the Deck page's part thirteen so the two can be compared by
 * screenshot.
 */
import type { Route } from "@stand-clear/data";
import type { ReactNode } from "react";
import { FAMILIES } from "./ui/family.ts";
import { NameTablet } from "./ui/NameTablet.tsx";
import {
  AnswerWindow,
  Bullets,
  Button,
  Caption,
  Chip,
  ClockTile,
  CoolRow,
  CountdownBoard,
  CountdownHeader,
  CountdownRow,
  ExpressBand,
  FamilySquare,
  FollowToggle,
  Kbd,
  Lamp,
  Lamps,
  Line,
  LocalBand,
  Notice,
  Num,
  PhotoPlaque,
  Pict,
  Plaque,
  Rule,
  TabRow,
  TileTimer,
  Wainscot,
  WainscotText,
} from "./ui/vocab.tsx";

const route = (letter: string, color: string, textColor = "FFFFFF"): Route => ({
  id: letter,
  letter,
  display: letter,
  diamond: false,
  color,
  textColor,
  name: `${letter} train`,
});
const R = {
  N: route("N", "F6BC26", "000000"),
  Q: route("Q", "F6BC26", "000000"),
  R: route("R", "F6BC26", "000000"),
  W: route("W", "F6BC26", "000000"),
  6: route("6", "009952"),
  sixX: { ...route("6", "009952"), id: "6X", diamond: true },
};

/** A stand-in photo for the plaque: no Google images on a dev sheet. */
const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d7dc"/><stop offset="1" stop-color="#eef1ee"/></linearGradient></defs><rect width="640" height="400" fill="url(#s)"/><rect x="40" y="90" width="150" height="250" fill="#b9ab95"/><rect x="220" y="40" width="120" height="300" fill="#8e8a80"/><rect x="380" y="120" width="210" height="220" fill="#c8b89c"/><rect y="330" width="640" height="70" fill="#5c5852"/></svg>`,
)}`;

function Row({
  role,
  children,
  note,
}: {
  role: [string, string];
  children: ReactNode;
  note?: string;
}) {
  return (
    <>
      <div className="border-b border-grout py-4">
        <b className="block font-display text-[12px] font-bold uppercase tracking-[0.13em]">
          {role[0]}
        </b>
        <span className="mt-1 block text-[12.5px] leading-snug text-ink-2">{role[1]}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2.5 border-b border-grout py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">{children}</div>
        {note && <span className="text-[11px] text-ink-3">{note}</span>}
      </div>
    </>
  );
}

const noop = () => {};

export function Sheet() {
  return (
    <main className="min-h-full bg-glaze px-5 py-8 text-ink">
      <div className="mx-auto max-w-[1120px]">
        <span className="font-display text-[12px] font-bold uppercase tracking-[0.15em] text-ink-2">
          Component sheet · dev only
        </span>
        <h1 className="mt-2 text-[34px] font-extrabold leading-tight tracking-[-0.02em]">
          The vocabulary
        </h1>
        <p className="mt-2 max-w-[66ch] text-[15px] text-ink-2">
          Every role at real size, in its states, built from the Deck page's part thirteen.
          Information caps are 12 px with 0.08 em tracking (Interaction, small fixes).
        </p>
        <div className="mt-6 grid grid-cols-[170px_minmax(0,1fr)] gap-x-7 border-t-2 border-ink">
          <Row
            role={[
              "Caption",
              "A black tile with white tracked caps: live information. At most two per panel besides the clock. Light is for map legends only.",
            ]}
          >
            <Caption>
              <Num>10:47</Num>
            </Caption>
            <Caption>Facing N</Caption>
            <Caption tone="terra">
              Your zone · <Num>400</Num> m
            </Caption>
            <Caption tone="light">Where the hider could be</Caption>
          </Row>

          <Row
            role={[
              "Button",
              "Ink default, white alternative with a 2 px rule, terra cotta only to fix where you are. Presses 2 px. Disabled carries its reason. Keys are printed on it.",
            ]}
            note='Disabled: "too soon to change platforms" sits beside it, never a silent grey button.'
          >
            <Button kind="ink" keys="⏎">
              Ask · Radar 1 mi
            </Button>
            <Button>Back down</Button>
            <Button kind="terra">Hide here</Button>
            <Button small>Get off</Button>
            <Button kind="ink" small disabled reason="too soon to change platforms">
              Board
            </Button>
          </Row>

          <Row
            role={[
              "Tab",
              'Square tiles in a row, the active one ink, never more than three. "Following you" is a toggle on the map.',
            ]}
          >
            <TabRow
              tabs={[
                { id: "travel", label: "Travel" },
                { id: "ask", label: "Ask · 2" },
              ]}
              active="travel"
              onSelect={noop}
            />
            <FollowToggle on onToggle={noop} />
            <FollowToggle on={false} onToggle={noop} />
            <FollowToggle on={false} disabled label="No map" onToggle={noop} />
          </Row>

          <Row
            role={[
              "Chip",
              "A light tile, a 2 px rule, a family square at its left edge. Ready, armed (ink), dimmed while cooling, closed after a veto.",
            ]}
            note="Ready · hovered · closed (Vetoed · closed this round) · armed · cooling · landmark chips, ready and armed."
          >
            <div className="sc-chips">
              <Chip family="radar" keys="1">
                ¼ mi
              </Chip>
              <Chip family="radar" keys="2" hover>
                ½ mi
              </Chip>
              <Chip family="radar" state="closed">
                ½ mi
              </Chip>
              <Chip family="radar" state="armed" keys="3">
                1 mi
              </Chip>
              <Chip family="radar" state="cooling">
                2 mi
              </Chip>
              <Chip pict="museum">Museum</Chip>
              <Chip pict="hospital" state="armed" count="· 8 within 2 mi">
                Hospitals
              </Chip>
              <Chip family="thermo">Hotter or colder?</Chip>
              <Chip family="match" state="closed">
                Same borough?
              </Chip>
            </div>
          </Row>

          <Row
            role={[
              "Lamp",
              "A 10 px square dot and a plain label. Lit is ink (or the family color), unlit an outline. Never a tile.",
            ]}
          >
            <Lamps>
              <Lamp lit>Riding</Lamp>
              <Lamp lit={false}>Changing trains</Lamp>
              <Lamp lit={false}>Walking</Lamp>
            </Lamps>
            <Lamps>
              <Lamp lit family="tent">
                Nearest
              </Lamp>
            </Lamps>
          </Row>

          <Row
            role={[
              "Band",
              "Local (2 tiles) heads a category; express (3 tiles, trimmed) is the one thing that matters now, then collapses into the log.",
            ]}
            note="Local, express with the answer window every question gets, an answer landed, and the connection's ink band."
          >
            <div className="flex w-[348px] max-w-full flex-col gap-3">
              <LocalBand family="radar" title="Radar · within …" price="+10 min" />
              <LocalBand family="measure" title="Measuring" price="+10 min" />
              <ExpressBand family="radar" label="Radar · asked 10:47 · from 14 St–Union Sq">
                <p>Is your station within 1 mi of me?</p>
                <AnswerWindow secondsLeft={6} />
              </ExpressBand>
              <ExpressBand family="tent" label="Nearest · 11:02 · from 23 St">
                <p>Of the hospitals within 2 mi of me, which is nearest your station?</p>
                <span className="sc-band-answer flex items-center gap-2">
                  <Pict kind="hospital" size={17} /> Bellevue
                </span>
              </ExpressBand>
              <div className="sc-express-ink sc-grid-lines">
                <b>Connection lost · reconnecting</b>
                <span>The round is paused on the server until you're back. Try 2 of 5.</span>
                <TileTimer total={10} left={4} size={9} onDark className="self-start" />
              </div>
            </div>
          </Row>

          <Row
            role={[
              "Rule",
              "A section heading: small caps over a 2 px ink line, no fill. A cooling category collapses to one rule-row with its next time.",
            ]}
          >
            <div className="flex w-[348px] max-w-full flex-col">
              <Rule>Stops</Rule>
              <CoolRow family="match" label="Matching" next="next 10:40" />
              <CoolRow family="tent" label="Nearest" next="next 11:10" />
            </div>
          </Row>

          <Row
            role={[
              "Notice",
              "A light row with a terra cotta square, dismissed by clicking. Refused actions and the first round's three hints.",
            ]}
          >
            <div className="flex w-[348px] max-w-full flex-col gap-2">
              <Notice onDismiss={noop}>You can ask Radar again at 10:51.</Notice>
              <Notice onDismiss={noop}>Hover a question to see what it does.</Notice>
            </div>
          </Row>

          <Row
            role={[
              "Countdown row",
              'The real countdown clock: bullet · destination · minutes, the next two trains. The row boards; "Board" shows on hover. A row you can\'t make is dimmed with its reason.',
            ]}
            note="Normal · hovered · dimmed with its reason · struck by a curse (Wrong way)."
          >
            <div className="w-[348px] max-w-full">
              <CountdownBoard label="Departures">
                <CountdownHeader note="Next two">↓ Downtown &amp; Brooklyn</CountdownHeader>
                <CountdownRow
                  route={R.Q}
                  dest="Coney Island–Stillwell Av"
                  time="10:49"
                  minutes={2}
                  then={9}
                  keys="B"
                />
                <CountdownRow
                  route={R.R}
                  dest="Bay Ridge–95 St"
                  time="10:51"
                  minutes={4}
                  then={13}
                  hover
                />
                <CountdownRow
                  route={R.N}
                  dest="Astoria–Ditmars Blvd"
                  time="10:48"
                  minutes={1}
                  then={9}
                  reason="too soon to change platforms"
                />
                <CountdownRow
                  route={R.W}
                  dest="Whitehall St–South Ferry"
                  time="10:53"
                  minutes={6}
                  then={null}
                  reason="Wrong way: uptown only"
                  struck
                />
              </CountdownBoard>
            </div>
          </Row>

          <Row
            role={[
              "Clock",
              "The time as a caption tile, nothing under it. In solo rounds ▸ and ▸▸ beside it; Pause on its left in practice. Blank until the server answers.",
            ]}
            note="On a train · on a platform (▸▸ needs a train) · practice with Pause · paused · before the server answers."
          >
            <ClockTile
              time="10:50"
              ff={[
                { glyph: "▸", title: "Skip to 30 s before the next stop · Space" },
                { glyph: "▸▸", title: "Skip to your stop · Shift+Space" },
              ]}
            />
            <ClockTile
              time="10:47"
              ff={[
                { glyph: "▸", title: "Skip to the departure · Space" },
                { glyph: "▸▸", title: "Board a train first", disabled: true },
              ]}
            />
            <ClockTile
              time="10:47"
              onPause={noop}
              ff={[{ glyph: "▸", title: "Skip to the departure · Space" }]}
            />
            <ClockTile time="10:47" paused onPause={noop} />
            <ClockTile time={null} />
          </Row>

          <Row
            role={[
              "Tile timer",
              "One tile per unit in its label, lifting as time runs out. The last tile turns terra cotta.",
            ]}
            note="5 game-min · 10 s · the last minute of twenty."
          >
            <TileTimer total={5} left={3} />
            <TileTimer total={10} left={6} />
            <TileTimer total={20} left={1} size={10} lastTerra />
          </Row>

          <Row
            role={[
              "Family square",
              "Six families, one square each; hollow when vetoed. Squares are game information. Circles are trains.",
            ]}
          >
            {FAMILIES.map((f) => (
              <FamilySquare key={f} family={f} title={f} />
            ))}
            <FamilySquare family="radar" vetoed title="radar, vetoed" />
            <Bullets routes={[R.N, R.Q, R.R, R.W, R[6], R.sixX]} size={20} />
          </Row>

          <Row
            role={[
              "Landmark plaque",
              "A buff-framed tile with a 9 × 9 pictogram; the one nearest you is framed in ink. Never a circle or a bare square.",
            ]}
          >
            <Pict kind="park" size={34} />
            <Pict kind="museum" size={34} />
            <Pict kind="library" size={34} />
            <Pict kind="hospital" size={34} nearest />
            <Pict kind="zoo" size={34} />
            <Pict kind="airport" size={34} />
          </Row>

          <Row
            role={[
              "Wainscot",
              "The one main action for the state, on buff brick, its cost or consequence in plain text beside it.",
            ]}
          >
            <div className="w-[348px] max-w-full">
              <Wainscot>
                <Button kind="ink" keys="⏎">
                  Ask · Radar 1 mi
                </Button>
                <WainscotText>+10 min to their score</WainscotText>
              </Wainscot>
            </div>
          </Row>

          <Row role={["Keys", "Printed small on the control they fire, in a hollow tile."]}>
            <span>
              <Kbd>1</Kbd>–<Kbd>5</Kbd> radar distances
            </span>
            <span>
              <Kbd>⏎</Kbd> ask
            </span>
            <span>
              <Kbd>Esc</Kbd> clear or close
            </span>
            <span>
              <Kbd>B</Kbd> board the first row
            </span>
            <span>
              <Kbd>Space</Kbd> ▸
            </span>
            <span>
              <Kbd>⇧ Space</Kbd> ▸▸
            </span>
            <span>
              <Kbd>← ↑ → ↓</Kbd> walk
            </span>
          </Row>

          <Row
            role={[
              "A line",
              "Twelve fixed moments get one line in the conductor's register, small and italic, under the moment's band or tablet.",
            ]}
          >
            <div className="flex flex-col gap-2">
              <Rule>Found</Rule>
              <Line>Last stop. Thank you for riding.</Line>
              <Line>Mind the stairs. Daylight ahead.</Line>
            </div>
          </Row>

          <Row
            role={[
              "Name tablet",
              "IRT tile for identity: a station's name set in tesserae, with grout and a frame. Gold for Found.",
            ]}
          >
            <NameTablet text="14 St–Union Sq" width={300} />
            <NameTablet text="Found" style="irt-gold" width={170} />
            <NameTablet text="Not in service" width={320} />
          </Row>

          <Row
            role={[
              "Photo plaque",
              "A glaze mat with an ink edge and a violet caption: where it's from and which way it faces.",
            ]}
            note="Arrived · waiting or vetoed (the empty frame) · didn't load."
          >
            <div className="w-[260px]">
              <PhotoPlaque src={PHOTO} from="Their exit" facing="N" onZoom={noop} />
            </div>
            <div className="w-[200px]">
              <PhotoPlaque src={null} from="Their spot" facing="Up" small />
            </div>
            <div className="w-[220px]">
              <PhotoPlaque src={PHOTO} from="Their spot" facing="E" failed onRetry={noop} small />
            </div>
          </Row>

          <Row role={["Plaque", "An error says what happened, what's safe, and what to do."]}>
            <div className="w-[348px] max-w-full">
              <Plaque
                title="Can't reach the game server"
                safe="Nothing is lost. Today's daily hasn't started, and it'll be the same round when you get in."
                actions={
                  <Button kind="ink" small>
                    Try now
                  </Button>
                }
                details="Closed before it opened · code 1006 · 3 tries since 10:02:14"
              >
                <p>You're online, but the server isn't answering. It may be restarting.</p>
              </Plaque>
            </div>
          </Row>
        </div>
      </div>
    </main>
  );
}
