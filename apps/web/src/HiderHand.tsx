import { CARDS, type CardId, HAND_LIMIT, type HiderView } from "@stand-clear/engine";
import { useState } from "react";
import { useGamePick, type World } from "./game.ts";
import { cardBlocker } from "./hide.ts";
import { CardEmblem } from "./ui/Card.tsx";
import { Button, Rule, TileTimer } from "./ui/vocab.tsx";

const toggle = (list: number[], index: number) =>
  list.includes(index) ? list.filter((i) => i !== index) : [...list, index];
export function HandCard({
  card,
  selected,
  onClick,
  disabled,
}: {
  card: CardId;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const d = CARDS[card];
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`sc-hide-card sc-focus${selected ? " selected" : ""}`}
    >
      {d.kind === "bonus" ? (
        <b className="text-[22px] tabular-nums">+{(d.bonusSeconds ?? 0) / 60}</b>
      ) : (
        <CardEmblem card={card} size={30} />
      )}
      <span>
        <b className="block font-display text-[12px] uppercase tracking-[0.08em]">{d.title}</b>
        <span className="text-[12px]">{d.rule}</span>
      </span>
      {d.cost !== undefined && (
        <span className="text-[12px] whitespace-nowrap">Discard {d.cost}</span>
      )}
    </button>
  );
}
export function HiderHand({ view, t, world }: { view: HiderView; t: number; world: World }) {
  return (
    <div className="px-4 pt-3">
      {view.draw ? (
        <KeepChoice key={view.draw.revision} view={view} t={t} />
      ) : (
        <CardChoice key={view.handRevision} view={view} t={t} world={world} />
      )}
      <p className="mt-2 text-[12px] text-ink-2">
        Your hand · {view.hand.length} / 6 · Deck · {view.deckSize}
      </p>
    </div>
  );
}
function KeepChoice({ view, t }: { view: HiderView; t: number }) {
  const { send, busy, sync } = useGamePick("send", "busy", "sync");
  const [keep, setKeep] = useState<number[]>([]),
    [discard, setDiscard] = useState<number[]>([]);
  const d = view.draw;
  if (!d) return null;
  const combined = [...view.hand, ...keep.map((i) => d.cards[i] as CardId)];
  const overflow = Math.max(0, combined.length - HAND_LIMIT);
  const left = Math.max(0, Math.ceil((d.until - t) / (sync?.speed ?? 6)));
  return (
    <section className="sc-anim-set">
      <Rule>
        Draw {d.cards.length}, keep {d.keep}
      </Rule>
      <div className="flex items-center justify-between py-2 text-[12px]">
        <span>Kept for you in {left} s</span>
        <TileTimer total={10} left={left} />
      </div>
      <div className="grid gap-1.5">
        {d.cards.map((c, i) => (
          <HandCard
            // biome-ignore lint/suspicious/noArrayIndexKey: card indices identify copies within a hand revision
            key={`${i}-${c}`}
            card={c}
            selected={keep.includes(i)}
            onClick={() => {
              setKeep(toggle(keep, i));
              setDiscard([]);
            }}
          />
        ))}
      </div>
      {overflow > 0 && (
        <div className="mt-3">
          <Rule>Choose {overflow} to discard</Rule>
          <div className="grid gap-1.5">
            {combined.map((c, i) => (
              <HandCard
                // biome-ignore lint/suspicious/noArrayIndexKey: card indices identify copies within a hand revision
                key={`${i}-${c}`}
                card={c}
                selected={discard.includes(i)}
                onClick={() => setDiscard(toggle(discard, i))}
              />
            ))}
          </div>
        </div>
      )}
      <div className="mt-2">
        <Button
          kind="ink"
          disabled={busy || keep.length !== d.keep || discard.length !== overflow}
          onClick={() => send({ type: "keepCards", revision: d.revision, keep, discard })}
        >
          Keep
        </Button>
      </div>
    </section>
  );
}
function CardChoice({ view, t, world }: { view: HiderView; t: number; world: World }) {
  const { send, busy } = useGamePick("send", "busy");
  const [selected, setSelected] = useState<number | null>(null),
    [payment, setPayment] = useState<number[]>([]);
  const id = selected === null ? null : (view.hand[selected] ?? null);
  const cost = id === "redraw" ? 2 : id ? CARDS[id].cost : undefined;
  const blocked = selected === null ? null : cardBlocker(view, selected, t, world);
  return (
    <section>
      <Rule>Your hand</Rule>
      <div className="grid gap-1.5">
        {view.hand.map((c, i) => (
          <HandCard
            // biome-ignore lint/suspicious/noArrayIndexKey: card indices identify copies within a hand revision
            key={`${i}-${c}`}
            card={c}
            selected={selected === i}
            onClick={() => {
              setSelected(selected === i ? null : i);
              setPayment([]);
            }}
          />
        ))}
      </div>
      {id && (
        <div className="mt-3">
          {cost !== undefined && (
            <>
              <Rule>Choose {cost} cards to discard</Rule>
              <div className="flex flex-wrap gap-1">
                {view.hand.map((c, i) =>
                  i === selected ? null : (
                    <Button
                      // biome-ignore lint/suspicious/noArrayIndexKey: card indices identify copies within a hand revision
                      key={`${i}-${c}`}
                      small
                      kind={payment.includes(i) ? "ink" : "white"}
                      onClick={() => setPayment(toggle(payment, i))}
                    >
                      {CARDS[c].title}
                    </Button>
                  ),
                )}
              </div>
            </>
          )}
          {blocked && <p className="mt-2 text-[12px] text-ink-2">{blocked}</p>}
          {cost !== undefined && (
            <div className="mt-2">
              <Button
                kind="ink"
                disabled={busy || !!blocked || payment.length !== cost}
                onClick={() =>
                  selected !== null &&
                  send({
                    type: id === "redraw" ? "redraw" : "playCard",
                    revision: view.handRevision,
                    card: selected,
                    payment,
                  })
                }
              >
                Play {CARDS[id].title}
              </Button>
              <p className="mt-1 text-[12px]">
                Discards {payment.map((i) => CARDS[view.hand[i] as CardId].title).join(", ")}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
