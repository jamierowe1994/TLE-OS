"use client";

import { useEffect, useState } from "react";
import { MAX_REG_NUMBERS, joinRegNumbers, regNumbers } from "@/lib/reg-numbers";

/**
 * The landlord registration number box, with room for a second owner's
 * (Lianna Denholm, 28 Oct 2026: "Can we add multiple LL reg numbers under
 * the Landlord? ... What if they have two separate ones?"). In Scotland each
 * owner registers on their own, so joint owners give a number each.
 *
 * One box per number, "Add another number" under them, and the value handed
 * back as the numbers separated by commas (lib/reg-numbers). The boxes are
 * kept here, so a new empty box doesn't vanish before anything is typed in it.
 */
export default function RegNumbersInput({
  value,
  onChange,
  disabled = false,
  placeholder = "e.g. 123456/230/12345",
  inputClassName = "",
  linkClassName = "text-[11.5px] text-muted underline",
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
  linkClassName?: string;
}) {
  const [boxes, setBoxes] = useState<string[]>(() => (regNumbers(value).length ? regNumbers(value) : [""]));
  /* A value changed from outside (a save, the EPC reader, a reload) redraws
     the boxes; one typed here already matches and leaves them alone. */
  useEffect(() => {
    if (joinRegNumbers(boxes) !== (value || null)) setBoxes(regNumbers(value).length ? regNumbers(value) : [""]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const set = (next: string[]) => {
    setBoxes(next);
    onChange(joinRegNumbers(next));
  };

  return (
    <div className="flex flex-col gap-1.5">
      {boxes.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            disabled={disabled}
            value={b}
            aria-label={boxes.length > 1 ? `Landlord registration number ${i + 1}` : "Landlord registration number"}
            placeholder={i === 0 ? placeholder : "The other owner's number"}
            /* Commas separate the numbers, so one typed here starts the next box. */
            onChange={(e) => {
              const parts = e.target.value.split(/[,;]/);
              const next = [...boxes];
              next.splice(i, 1, ...parts.map((p, n) => (n === 0 ? p : p.trimStart()).replace(/\s+/g, " ").slice(0, 40)));
              set(next.slice(0, MAX_REG_NUMBERS));
            }}
            className={inputClassName}
          />
          {boxes.length > 1 && !disabled && (
            <button type="button" onClick={() => set(boxes.filter((_, n) => n !== i))} className={`shrink-0 ${linkClassName}`}>
              Remove
            </button>
          )}
        </div>
      ))}
      {!disabled && boxes.length < MAX_REG_NUMBERS && (
        <button type="button" onClick={() => setBoxes([...boxes, ""])} className={`self-start ${linkClassName}`}>
          {boxes.length > 1 ? "Add another number" : "Add another number (joint owners)"}
        </button>
      )}
    </div>
  );
}
