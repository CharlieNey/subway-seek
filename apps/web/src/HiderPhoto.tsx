/** Hider-only photo preview. A decision keeps the original answer deadline. */
import { type HiderView, photoCamera } from "@stand-clear/engine";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useGamePick } from "./game.ts";
import { chooseProvider } from "./map/baseMap.ts";
import { photoUrl } from "./street.ts";
import { Button, Caption, TileTimer } from "./ui/vocab.tsx";

export function SpotThumbnail({ view }: { view: HiderView }) {
  if (!view.spot || chooseProvider() !== "google") return null;
  return (
    <div className="relative mx-4 mt-3">
      <img
        src={photoUrl(view.spotPhoto ?? photoCamera(view.spot.pano, "N"))}
        alt="Your spot, facing north"
        className="aspect-[16/7] w-full object-cover"
      />
      <div className="absolute top-1 left-1">
        <Caption>Your spot · facing N</Caption>
      </div>
    </div>
  );
}
export function HiderPhoto({
  view,
  pending,
  t,
  onClose,
}: {
  view: HiderView;
  pending: HiderView["incoming"][number];
  t: number;
  onClose: () => void;
}) {
  const { send, busy, sync } = useGamePick("send", "busy", "sync");
  const box = useRef<HTMLDivElement>(null);
  const question = view.asked[pending.index];
  const answer = pending.trueAnswer;
  const photo = typeof answer === "object" && "photo" in answer ? answer.photo : null;
  const locks = question?.q.kind === "photo" && question.q.from === "spot" && !view.lock;
  const left = Math.max(0, Math.ceil(((question?.answerAt ?? t) - t) / (sync?.speed ?? 6)));
  useEffect(() => {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    box.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => back?.focus();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key !== "Tab") return;
      const buttons = [
        ...(box.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
      ];
      const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      e.preventDefault();
      buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-modal="true"
      aria-label={locks ? "Answering locks you here" : "Send photo"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(36_32_27/0.65)] p-6"
    >
      <div className="w-[560px] max-w-full border-4 border-grout bg-glaze-hi">
        {photo && chooseProvider() === "google" && (
          <div className="relative">
            <img
              src={photoUrl(photo)}
              alt="What they'll see"
              className="aspect-[16/9] w-full object-cover"
            />
            <div className="absolute top-3 left-3">
              <Caption>
                {question?.q.kind === "photo"
                  ? `${question.q.from === "spot" ? "Spot" : "Exit"} photo · facing ${question.q.look} · what they'll see`
                  : "Photo"}
              </Caption>
            </div>
          </div>
        )}
        <div className="sc-grid-lines bg-terra p-3 font-display text-[14px] font-bold uppercase tracking-[0.08em] text-glaze-hi">
          {locks ? "Answering locks you here" : "Send photo"}
        </div>
        <div className="p-4">
          <p className="text-[13px]">
            {locks
              ? "You haven't locked a spot yet. This photo is taken where you're standing, and sending it locks you there."
              : "It's sent when the window ends, whatever you do."}
          </p>
          <div className="my-3 flex justify-between text-[12px]">
            <span>Sent in {left} s</span>
            <TileTimer total={10} left={left} />
          </div>
          <div className="flex gap-2">
            <Button
              kind={locks ? "terra" : "ink"}
              disabled={busy || !photo || pending.decision !== null}
              onClick={() => {
                send({ type: "answer", question: pending.index, decision: "true" });
                onClose();
              }}
            >
              {locks ? "Lock & answer" : "Send photo"}
            </Button>
            <Button keys="Esc" onClick={onClose}>
              {locks ? "Move first" : "Close"}
            </Button>
          </div>
          {locks && (
            <p className="mt-3 text-[12px] text-ink-2">
              Move first keeps the question open for the time left. If it runs out, a photo from
              wherever you are is sent and you're locked there.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
