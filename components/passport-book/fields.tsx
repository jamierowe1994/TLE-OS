"use client";

import { useEffect, useId, useRef, useState } from "react";
import { photoPosition } from "@/components/PassportBook";
import { Ic, type IconName } from "./icons";
import { errFor } from "./model";

/**
 * The passport book's pieces, drawn as the design draws them: a question with
 * its help line and its error line, chips, a list with radio rings, a stepper,
 * a tick, a money box, the address lookup and the photo. Every choice is a
 * radiogroup with its label, every box has a label, as the design has them.
 */

/** One question: its label, help line, the answer, and the line said when it is missed. */
export function Q({
  k,
  label,
  htmlFor,
  help,
  opt,
  err,
  children,
}: {
  k: string;
  label?: React.ReactNode;
  htmlFor?: string;
  help?: React.ReactNode;
  opt?: boolean;
  err: string[];
  children: React.ReactNode;
}) {
  const bad = err.includes(k);
  return (
    <div className={`q${bad ? " err" : ""}`} data-q={k}>
      {label ? (
        <label htmlFor={htmlFor}>
          {label}
          {opt ? <> <span className="opt">(optional)</span></> : null}
        </label>
      ) : null}
      {help ? <p className="help">{help}</p> : null}
      {children}
      <p className="emsg" role={bad ? "alert" : undefined}>{errFor(k)}</p>
    </div>
  );
}

export type Opt = { v: string; sub?: string; icon?: IconName };
const asOpt = (o: string | Opt): Opt => (typeof o === "string" ? { v: o } : o);

/** A choice: pills in a row, or a list with radio rings when `big`. */
export function Choice({
  k,
  label,
  help,
  opts,
  value,
  onPick,
  big = false,
  err,
}: {
  k: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  opts: readonly (string | Opt)[];
  value: string;
  onPick: (v: string) => void;
  big?: boolean;
  err: string[];
}) {
  const id = useId();
  return (
    <Q k={k} err={err}>
      <div className="ql" id={id}>{label}</div>
      {help ? <p className="help">{help}</p> : null}
      <div className={big ? "list" : "chips"} role="radiogroup" aria-labelledby={id}>
        {opts.map(asOpt).map((o) => {
          const on = value === o.v;
          return (
            <button key={o.v} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => onPick(o.v)}>
              {o.icon ? <Ic k={o.icon} /> : null}
              <span>
                {o.v}
                {o.sub ? <small>{o.sub}</small> : null}
              </span>
            </button>
          );
        })}
      </div>
    </Q>
  );
}

/** Yes or No, with neither lit until one is picked: a pre-picked No is an answer nobody gave. */
export function YesNo({ k, label, help, value, onPick, err }: { k: string; label: React.ReactNode; help?: React.ReactNode; value: boolean | null; onPick: (v: boolean) => void; err: string[] }) {
  return <Choice k={k} label={label} help={help} opts={["Yes", "No"]} value={value === null ? "" : value ? "Yes" : "No"} onPick={(v) => onPick(v === "Yes")} err={err} />;
}

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const id = useId();
  return (
    <div className="q">
      <div className="ql" id={id}>{label}</div>
      <div className="stepper" role="group" aria-labelledby={id}>
        <button type="button" aria-label="Fewer" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <b className="num" aria-live="polite">{value}</b>
        <button type="button" aria-label="More" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}

export function Check({ k, checked, onChange, err, children }: { k: string; checked: boolean; onChange: (v: boolean) => void; err: string[]; children: React.ReactNode }) {
  return (
    <Q k={k} err={err}>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <i><Ic k="check" sw={2.6} /></i>
        <span>{children}</span>
      </label>
    </Q>
  );
}

/** Pounds, as typed, with the thousands put in: "32000" shows as "32,000". */
export const poundsTyped = (v: string) => {
  const n = v.replace(/[^\d]/g, "");
  return n ? Number(n).toLocaleString("en-GB") : "";
};

export function Money({ id, value, onChange, per, placeholder }: { id: string; value: string; onChange: (v: string) => void; per: string; placeholder?: string }) {
  return (
    <div className="pre">
      <span>£</span>
      <input className="in num" id={id} inputMode="numeric" placeholder={placeholder} value={value} onChange={(e) => onChange(poundsTyped(e.target.value))} />
      <em>{per}</em>
    </div>
  );
}

/* ── The address lookup ────────────────────────────────────────────────── */

/**
 * Does this read as somebody's front door, or the street it is on? Google's
 * backup answers a postcode with the road (Howard, 14 Sep 2026), so a street
 * asks for the number. Moved here from PassportForm unchanged.
 */
function looksLikeADoor(a: string): boolean {
  const first = a.split(",")[0]?.trim() ?? "";
  if (!first) return false;
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(first)) return false;
  if (/\d/.test(first)) return true;
  return /^(flat|apartment|apt|unit|room|studio|penthouse|the\s|\S+\s+(cottage|house|lodge|barn|farm|mews|court|manor|villa))/i.test(first);
}

/**
 * The address, finished by our own lookup (/api/tenant/passport/address, the
 * passport's token as its ticket). With no lookup it is a plain box that saves
 * what is typed, and says nothing the tenant could not fix.
 */
export function AddressLookup({ id, token, value, onChange, onEnter }: { id: string; token: string; value: string; onChange: (v: string) => void; onEnter?: () => void }) {
  const [matches, setMatches] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const picked = useRef<string | null>(value ? value : null);
  const [needsNumber, setNeedsNumber] = useState(false);
  const [houseNumber, setHouseNumber] = useState("");
  const ticket = encodeURIComponent(token);
  const listId = useId();

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || picked.current === value) return;
    const t = window.setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/tenant/passport/address?token=${ticket}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = (await r.json()) as { suggestions?: { id: string; label: string }[] };
        const found = j.suggestions ?? [];
        setMatches(found);
        setOpen(found.length > 0);
      } catch {
        setMatches([]);
      } finally {
        setBusy(false);
      }
    }, 320);
    return () => window.clearTimeout(t);
  }, [value, ticket]);

  async function choose(mid: string, label: string) {
    setOpen(false);
    picked.current = label;
    onChange(label);
    try {
      const r = await fetch(`/api/tenant/passport/address?token=${ticket}&resolve=${encodeURIComponent(mid)}`, { cache: "no-store" });
      const j = (await r.json()) as { address?: string };
      if (j.address) {
        picked.current = j.address;
        onChange(j.address);
      }
    } catch {
      /* keep what they picked */
    }
    if (!looksLikeADoor(picked.current ?? label)) {
      setHouseNumber("");
      setNeedsNumber(true);
      return;
    }
    setNeedsNumber(false);
  }

  function addNumber() {
    const n = houseNumber.trim();
    if (!n) return;
    const full = `${n} ${value}`.replace(/\s+,/g, ",");
    picked.current = full;
    onChange(full);
    setNeedsNumber(false);
  }

  return (
    <div>
      <div className="look">
        <input
          className="in"
          id={id}
          value={value}
          placeholder="Start typing your postcode or address"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => { picked.current = null; setNeedsNumber(false); onChange(e.target.value); }}
          onFocus={() => matches.length > 0 && picked.current !== value && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              if (!open) onEnter?.();
            }
          }}
        />
        <span className="pin">{busy ? <span className="spinner" aria-hidden="true" /> : <Ic k="pin" />}</span>
      </div>
      {needsNumber && (
        <div className="numbox">
          <p>That is the street. What is the house number or name?</p>
          <div>
            <input
              className="in"
              aria-label="House number or name"
              value={houseNumber}
              placeholder="e.g. 12, or Flat 2"
              autoFocus
              onChange={(e) => setHouseNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); addNumber(); } }}
            />
            <button type="button" className="btn" disabled={!houseNumber.trim()} onClick={addNumber}>Add it</button>
          </div>
        </div>
      )}
      {open && (
        <div className="list plain" id={listId} role="listbox">
          {matches.map((m) => (
            <button key={m.id} type="button" role="option" aria-selected={false} onClick={() => void choose(m.id, m.label)}>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── The photo ─────────────────────────────────────────────────────────── */

/**
 * A photo for the passport, if they want one. Shrunk in the browser to a small
 * JPEG as today (320 by 380); drag it inside its circle to centre a face, and
 * the focus is stored rather than the crop (photoFocus). Nothing reads it but
 * the passport, and the Right to Rent check stays the agent's job.
 */
export function PhotoPick({ value, focus, onChange, onFocus }: { value: string; focus: string; onChange: (v: string) => void; onFocus: (f: string) => void }) {
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const inputId = useId();
  const SIZE = 72;
  const parse = (f: string) => {
    const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/.exec(f.trim());
    return m ? { fx: Number(m[1]), fy: Number(m[2]) } : { fx: 50, fy: 22 };
  };
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const bmp = await createImageBitmap(file);
      const W = 320, H = 380;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const s = Math.max(W / bmp.width, H / bmp.height);
      const w = bmp.width * s, h = bmp.height * s;
      ctx.drawImage(bmp, (W - w) / 2, (H - h) * 0.22, w, h);
      onChange(c.toDataURL("image/jpeg", 0.82));
      onFocus("");
    } catch {
      /* not an image a browser can read; nothing changes */
    } finally {
      setBusy(false);
    }
  }
  const input = <input type="file" accept="image/*" id={inputId} className="sr" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />;

  if (!value) {
    return (
      <label className="photo" htmlFor={inputId}>
        <span className="pic">{busy ? <span className="spinner" aria-hidden="true" /> : <Ic k="camera" />}</span>
        <span>
          <b>{busy ? "One moment…" : "Add a photo"}</b>
          <span>A selfie is fine. It only goes on your passport, and your agent still checks your ID in person.</span>
        </span>
        {input}
      </label>
    );
  }
  return (
    <div className="photo">
      <span
        className="pic has"
        title="Drag to centre your face"
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ...parse(focus) }; }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const fx = Math.max(0, Math.min(100, drag.current.fx - ((e.clientX - drag.current.x) / SIZE) * 100));
          const fy = Math.max(0, Math.min(100, drag.current.fy - ((e.clientY - drag.current.y) / SIZE) * 100));
          onFocus(`${fx.toFixed(1)} ${fy.toFixed(1)}`);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="Your photo" draggable={false} style={{ objectPosition: photoPosition(focus) }} />
      </span>
      <span>
        <b>Your photo is on your passport</b>
        <span>Drag it to centre your face.</span>
        <span className="acts">
          <label htmlFor={inputId}>{busy ? "One moment…" : "Change"}{input}</label>
          <button type="button" onClick={() => { onChange(""); onFocus(""); }}>Remove</button>
        </span>
      </span>
    </div>
  );
}
