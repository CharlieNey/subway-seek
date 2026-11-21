import { useState } from "react";

/** Copies `text`, and says Copied for a moment. */
export function CopyButton({ text, label, ink }: { text: string; label: string; ink?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={ink ? "sc-btn ink" : "sc-btn"}
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        })
      }
    >
      {done ? "Copied" : label}
    </button>
  );
}
