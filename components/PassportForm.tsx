"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { photoPosition, type PassportFocus } from "@/components/PassportBook";
import PassportScene, { PassportFlat } from "@/components/PassportScene";
import {
  APPLICANT_TYPES,
  EMPTY_PASSPORT,
  SECTIONS,
  answered,
  completeness,
  householdIncome,
  money,
  type PassportData,
} from "@/lib/passport-shape";

/**
 * The tenant passport, filled in.
 *
 * ── It saves as they type, and says so ────────────────────────────────────
 *
 * Nobody finishes this in one sitting - it asks for a share code and a
 * landlord's address, which live in other places. So there is no Save button
 * to miss: every change is written after a pause, and the state is shown.
 *
 * ── One question at a time, and never a scrollbar ─────────────────────────
 *
 * Six sections, and inside each one a run of small screens: one question, two
 * at most, sliding across as they are answered. James, 12 Sep 2026: "type in
 * the year, then it swipes across and shows the month, then the day ... we
 * should never have to scroll within here." A tap (yes, no, a month, a
 * choice) moves on by itself after a beat; a typed answer waits for Continue
 * or Enter. Nothing is gated: Continue always works, and a skipped question
 * simply does not earn its stamp. Back walks the same screens in reverse.
 *
 * ── The card is the memory ────────────────────────────────────────────────
 *
 * Because earlier answers slide away, the passport on the right is where
 * they live: page one writes on its front, everything after on its back, and
 * it turns to whichever face is being written on.
 *
 * ── The bar starts part-filled, honestly ──────────────────────────────────
 *
 * It counts ANSWERS, not sections, so the name and email seeded from the
 * invitation genuinely put somebody about a fifth of the way along before
 * they type anything.
 */

/* The tenant surface's colours (globals.css, data-surface="tenant"): brown
   for the call to action and the emphasised word, pink for the wash. */
const BROWN = "var(--accent-dark)";

const input =
  "w-full rounded-[12px] border border-line/80 bg-white px-4 py-3.5 text-[15px] outline-none transition-[border-color,box-shadow] placeholder:text-muted/60 focus:border-[var(--accent-dark)] focus:shadow-[0_0_0_3px_rgba(86,66,62,0.10)]";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The nationalities people in Kent actually type, so most get it in three
 *  letters. Anything else is still free text. */
const NATIONALITIES = [
  "British", "Irish", "Polish", "Romanian", "Indian", "Pakistani", "Nigerian", "Italian",
  "Portuguese", "Spanish", "French", "German", "Lithuanian", "Bulgarian", "South African",
  "Australian", "American", "Chinese", "Filipino", "Bangladeshi", "Ghanaian", "Zimbabwean",
  "Ukrainian", "Turkish", "Greek", "Dutch", "Brazilian", "Hong Konger", "Sri Lankan", "Nepalese",
];

/**
 * Each step's headline: a lead and one word that carries the weight, in
 * brown with a rule under it. "Let's get to know YOU" says something a
 * section title called "Identity" never could.
 */
const HEADLINES: Record<string, { lead: string; em: string; before?: string }> = {
  identity: { lead: "Let's get to", before: "know", em: "you" },
  "right-to-rent": { lead: "Your right to", em: "rent" },
  income: { lead: "What you", em: "earn" },
  household: { lead: "Who's moving", em: "in" },
  history: { lead: "Where you live", em: "now" },
  declarations: { lead: "A few last", em: "things" },
};

/* ── Small pieces ────────────────────────────────────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex h-full flex-col">
      <span className="text-[15px] font-semibold">{label}</span>
      {hint && <span className="mt-1 block text-[13px] leading-relaxed text-muted">{hint}</span>}
      <div className="mt-auto pt-3">{children}</div>
    </label>
  );
}

/** What the last screen settled, said back before the next question. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-[14px] leading-relaxed text-muted">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-[3px] shrink-0" style={{ color: BROWN }}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 12.5l2.6 2.6L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** Yes / No, with no default. An unanswered question must look unanswered:
 *  a pre-selected "No" is an answer nobody gave. */
function YesNo({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="text-[15px] font-semibold">{label}</span>
      {hint && <span className="mt-1 block text-[13px] leading-relaxed text-muted">{hint}</span>}
      <div className="mt-3 flex gap-3">
        {[
          [true, "Yes"],
          [false, "No"],
        ].map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v as boolean)}
            className={`min-w-[104px] rounded-full border px-7 py-2.5 text-[14.5px] transition-colors ${
              value === v ? "border-transparent text-white" : "border-line/80 bg-white hover:border-ink/40"
            }`}
            style={value === v ? { background: BROWN } : undefined}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A row of small choices - months, days. */
function Chips<T extends string | number>({ options, value, onPick, label }: { options: T[]; value: T | null; onPick: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={String(o)}
            type="button"
            onClick={() => onPick(o)}
            className={`flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-[14px] transition-colors ${
              on ? "border-transparent text-white" : "border-line/80 bg-white hover:border-ink/40"
            }`}
            style={on ? { background: BROWN } : undefined}
          >
            {label(o)}
          </button>
        );
      })}
    </div>
  );
}

/** Four digits, and nothing else. */
function YearInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      inputMode="numeric"
      maxLength={4}
      autoFocus
      className={`${input.replace("w-full", "w-[132px]")} text-center text-[18px] tracking-[0.08em]`}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
    />
  );
}

/**
 * A choice that opens IN the page rather than over it: the list falls open
 * under the box and pushes what is below it down, then folds up once
 * something is picked.
 */
function Choice({ label, hint, value, options, placeholder = "Choose", onChange }: { label: string; hint?: string; value: string; options: readonly string[]; placeholder?: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!value);
  return (
    <div className="flex h-full flex-col">
      <span className="text-[15px] font-semibold">{label}</span>
      {hint && <span className="mt-1 block text-[13px] leading-relaxed text-muted">{hint}</span>}
      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={`flex w-full items-center justify-between rounded-[12px] border bg-white px-4 py-3.5 text-left text-[15px] transition-[border-color,box-shadow] ${
            open ? "border-[var(--accent-dark)] shadow-[0_0_0_3px_rgba(86,66,62,0.10)]" : "border-line/80 hover:border-ink/40"
          }`}
        >
          <span className={value ? "" : "text-muted/70"}>{value || placeholder}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-muted transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : "none" }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
          <div className="min-h-0 overflow-hidden">
            <ul className="mt-2 rounded-[12px] border border-line/80 bg-white py-1.5">
              {options.map((o) => {
                const on = o === value;
                return (
                  <li key={o}>
                    <button
                      type="button"
                      onClick={() => { onChange(o); setOpen(false); }}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[14.5px] transition-colors hover:bg-[var(--accent-soft)] ${on ? "font-semibold" : ""}`}
                      style={on ? { color: BROWN } : undefined}
                    >
                      {o}
                      {on && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * An address that finishes itself. Typing asks the server-side lookup
 * (Google Places or Ideal Postcodes, whichever key Railway holds - see
 * app/api/address); matches fold open under the box. With no key it is a
 * plain box that saves what is typed, and says nothing: the tenant cannot
 * fix a missing key and should not be told about one.
 */
function TenantAddress({ label, hint, value, onChange, onEnter, onPicked }: { label: string; hint?: string; value: string; onChange: (v: string) => void; onEnter?: () => void; onPicked?: () => void }) {
  const [matches, setMatches] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const picked = useRef<string | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || picked.current === value) return;
    const id = window.setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/tenant/passport/address?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await r.json();
        const found = (j.suggestions ?? []) as { id: string; label: string }[];
        setMatches(found);
        setOpen(found.length > 0);
      } catch {
        setMatches([]);
      } finally {
        setBusy(false);
      }
    }, 320);
    return () => window.clearTimeout(id);
  }, [value]);

  async function choose(id: string, label: string) {
    setOpen(false);
    picked.current = label;
    onChange(label);
    try {
      const r = await fetch(`/api/tenant/passport/address?resolve=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.address) {
        picked.current = j.address;
        onChange(j.address);
      }
    } catch {
      /* keep what they picked */
    }
    onPicked?.();
  }

  return (
    <div className="flex h-full flex-col">
      <span className="text-[15px] font-semibold">{label}</span>
      {hint && <span className="mt-1 block text-[13px] leading-relaxed text-muted">{hint}</span>}
      <div className="mt-auto pt-3">
        <div className="relative">
          <input
            className={`${input} pr-11`}
            value={value}
            autoFocus
            placeholder="Start typing your address or postcode"
            autoComplete="off"
            onChange={(e) => { picked.current = null; onChange(e.target.value); }}
            onFocus={() => matches.length && setOpen(true)}
            onKeyDown={(e) => { if (e.key === "Enter" && !open) onEnter?.(); }}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted">
            {busy ? (
              <span className="block h-4 w-4 animate-spin rounded-full border-[1.5px] border-line" style={{ borderTopColor: BROWN }} />
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 21s6-5.2 6-10.5a6 6 0 1 0-12 0C6 15.8 12 21 12 21Z" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="12" cy="10.5" r="2.2" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            )}
          </span>
        </div>
        <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
          <div className="min-h-0 overflow-hidden">
            <ul className="mt-2 rounded-[12px] border border-line/80 bg-white py-1.5">
              {matches.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => choose(m.id, m.label)} className="block w-full px-4 py-2.5 text-left text-[14px] transition-colors hover:bg-[var(--accent-soft)]">
                    {m.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A photo for the card, if they want one. Optional, and it says so twice,
 * because a form that shows a camera button reads as a form that needs a
 * photo. Shrunk in the browser to a small JPEG; nothing reads it but the
 * card, and the Right to Rent check stays the agent's job.
 */
function PhotoField({
  value,
  focus,
  onChange,
  onFocus,
}: {
  value: string;
  focus: string;
  onChange: (dataUrl: string) => void;
  onFocus: (focus: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const SIZE = 112;
  const parse = (f: string) => {
    const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/.exec(f.trim());
    return m ? { fx: Number(m[1]), fy: Number(m[2]) } : { fx: 50, fy: 22 };
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const bmp = await createImageBitmap(file);
      const W = 320, H = 380;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d")!;
      const s = Math.max(W / bmp.width, H / bmp.height);
      const w = bmp.width * s, h = bmp.height * s;
      ctx.drawImage(bmp, (W - w) / 2, (H - h) * 0.22, w, h);
      onChange(c.toDataURL("image/jpeg", 0.82));
      onFocus("");
    } finally {
      setBusy(false);
    }
  };
  /* Dragging the picture inside its circle moves what the circle shows. The
     focus is stored, not the crop, so nothing is lost by moving it twice. */
  const onDown = (e: React.PointerEvent) => {
    if (!value) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ...parse(focus) };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = ((e.clientX - drag.current.x) / SIZE) * 100;
    const dy = ((e.clientY - drag.current.y) / SIZE) * 100;
    const fx = Math.max(0, Math.min(100, drag.current.fx - dx));
    const fy = Math.max(0, Math.min(100, drag.current.fy - dy));
    onFocus(`${fx.toFixed(1)} ${fy.toFixed(1)}`);
  };
  const onUp = () => { drag.current = null; };
  return (
    <div className="flex items-center gap-5 rounded-[12px] border border-dashed border-line/90 bg-white/60 px-4 py-4">
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-soft)]"
        style={{ width: SIZE, height: SIZE, cursor: value ? "grab" : "default", touchAction: "none", boxShadow: value ? `0 0 0 3px #fff, 0 0 0 4.5px var(--accent)` : undefined }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" draggable={false} className="h-full w-full select-none object-cover" style={{ objectPosition: photoPosition(focus) }} />
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: BROWN }}>
            <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-2h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8Z" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold">{value ? "Your photo is on the card" : "A photo for your card"}</p>
        <p className="text-[13px] leading-snug text-muted">
          {value
            ? "Drag the picture to centre your face. It only goes on your card, and your agent still checks your ID in person."
            : "A selfie is fine. It only goes on your card, and your agent still checks your ID in person."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {value && (
          <button type="button" onClick={() => { onChange(""); onFocus(""); }} className="text-[13px] text-muted underline underline-offset-4 hover:text-ink">
            Remove
          </button>
        )}
        <label className="cursor-pointer rounded-[10px] border border-line/80 bg-white px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-ink">
          {busy ? "One moment…" : value ? "Change" : "Choose or take one"}
          <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Lock() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* ── Dates ───────────────────────────────────────────────────────────────── */

const yearOk = (y: string, min: number, max: number) => /^\d{4}$/.test(y) && Number(y) >= min && Number(y) <= max;

function longDate(iso: string) {
  const dt = new Date(`${iso}T00:00:00`);
  return {
    weekday: dt.toLocaleDateString("en-GB", { weekday: "long" }),
    long: dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
}

/** "two years and four months", from a "YYYY-MM" to now. */
function since(ym: string): { months: number; text: string } {
  const [y, m] = ym.split("-").map(Number);
  const now = new Date();
  const months = Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m));
  const yrs = Math.floor(months / 12), mos = months % 12;
  const parts = [yrs ? `${yrs} year${yrs === 1 ? "" : "s"}` : "", mos ? `${mos} month${mos === 1 ? "" : "s"}` : ""].filter(Boolean);
  return { months, text: parts.length ? parts.join(" and ") : "less than a month" };
}

/* ── The form ────────────────────────────────────────────────────────────── */

export type PassportQuestion = { id: string; label: string; kind: string; options: string[]; required: boolean };

/**
 * One question inside a screen that morphs rather than changes.
 *
 * James, 12 Sep 2026: "once they've hit the address, it will then feel like
 * it's morphing rather than changing the screen ... Cool, how long have you
 * lived there?" So a screen can be a run of parts: the answered ones fold
 * down to a single line each, the current one is open beneath them, and the
 * ones after are not there yet. Nothing scrolls because the folded lines are
 * small. A tap answers a part and folds it; a typed part folds on Continue
 * or Enter. Any folded line can be opened again.
 */
type Part = {
  key: string;
  /** Shown only when this holds. */
  when?: boolean;
  /** Answered. A typed part also has to be confirmed before it folds. */
  done: boolean;
  /** Folds on Continue / Enter rather than the moment it is done. */
  typed?: boolean;
  /** The one line it folds down to. */
  summary: React.ReactNode;
  /** What the part watches, so a changed tap can fold it again. */
  value?: unknown;
  node: React.ReactNode;
};

type Screen = {
  key: string;
  /** Shown only when this holds. Screens that stop applying vanish. */
  when?: boolean;
  /** Answered: what "done" means for this screen. */
  done: boolean;
  /** Move on by itself once answered - for taps, never for typing. */
  auto?: boolean;
  /** The answer an auto screen watches: a change to it, made here, moves on. */
  value?: unknown;
  node: React.ReactNode;
  /** The parts, when the screen is a flow. */
  parts?: Part[];
};

export default function PassportForm({
  token,
  initial,
  submittedAt,
  questions = [],
  initialAnswers = {},
  agentName = "",
  demo = false,
}: {
  token: string;
  initial: PassportData;
  submittedAt: string | null;
  /** Extra questions the agent who issued this passport asked for. Empty for
   *  most passports; they arrive server-side from the passport's own agent. */
  questions?: PassportQuestion[];
  initialAnswers?: Record<string, string>;
  agentName?: string;
  /** Showing the form rather than filling one in: nothing is written. */
  demo?: boolean;
}) {
  const [d, setD] = useState<PassportData>({ ...EMPTY_PASSPORT, ...initial });
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitted, setSubmitted] = useState(Boolean(submittedAt));
  const [step, setStep] = useState(0);
  const [sub, setSub] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const [dir, setDir] = useState<1 | -1>(1);
  const first = useRef(true);
  /** The field being typed into, so the card can light up the matching line. */
  const [focus, setFocus] = useState<PassportFocus>(null);
  const lit = (k: Exclude<PassportFocus, null>) => ({ onFocus: () => setFocus(k), onBlur: () => setFocus(null) });

  /* The birthday and the move-in month are asked in pieces; the pieces live
     here until they make a date. */
  const [dobY, setDobY] = useState(initial.dob ? initial.dob.slice(0, 4) : "");
  const [dobM, setDobM] = useState<number | null>(initial.dob ? Number(initial.dob.slice(5, 7)) : null);

  /* Flows: which typed parts have been confirmed (kept across screens, so a
     folded address stays folded when they come back), and which folded part
     has been opened again on the current screen. */
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const [reopened, setReopened] = useState<string | null>(null);
  const confirm = (id: string) => setConfirmed((c) => new Set(c).add(id));
  const unconfirm = (id: string) => setConfirmed((c) => { const n = new Set(c); n.delete(id); return n; });

  const set = <K extends keyof PassportData>(k: K, v: PassportData[K]) => setD((cur) => ({ ...cur, [k]: v }));

  /* Debounced autosave. The guard on the first render matters: without it the
     page saves the moment it loads, writing back what it just read. */
  const save = useCallback(
    async (next: PassportData) => {
      if (demo) {
        setState("saved");
        return;
      }
      setState("saving");
      try {
        const r = await fetch(`/api/tenant/passport?token=${encodeURIComponent(token)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: next, answers: answersRef.current }),
        });
        setState(r.ok ? "saved" : "error");
      } catch {
        setState("error");
      }
    },
    [token, demo]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = window.setTimeout(() => void save(d), 800);
    return () => window.clearTimeout(id);
  }, [d, save]);

  const firstAnswers = useRef(true);
  useEffect(() => {
    if (firstAnswers.current) {
      firstAnswers.current = false;
      return;
    }
    const id = window.setTimeout(() => void save(d), 800);
    return () => window.clearTimeout(id);
  }, [answers, save, d]);

  const extraDone = questions.length > 0 && questions.every((qn) => !qn.required || (answers[qn.id] ?? "").trim() !== "");

  const sections =
    questions.length > 0
      ? [
          ...SECTIONS,
          {
            key: "extra",
            title: agentName ? `A few more from ${agentName}` : "A few more questions",
            blurb: "Your agent asks these as well. They are not part of the standard passport, so nobody else will see them.",
            stamp: "EXTRA",
            done: () => extraDone,
          },
        ]
      : SECTIONS;

  const { done, total } = completeness(d);
  const bar = answered(d);
  const household = householdIncome(d);
  const allDone = done === total && (questions.length === 0 || extraDone);
  const lastStep = step === sections.length - 1;
  const unanswered = questions.filter((qn) => qn.required && (answers[qn.id] ?? "").trim() === "");
  const sectionsLeft = total - done + (questions.length > 0 && !extraDone ? 1 : 0);
  const finishLabel = allDone
    ? "That's my passport done"
    : done === total && unanswered.length
      ? `${unanswered.length} question${unanswered.length === 1 ? "" : "s"} still to answer`
      : `${sectionsLeft} section${sectionsLeft === 1 ? "" : "s"} to go`;

  async function finish() {
    await save(d);
    if (!demo) {
      await fetch(`/api/tenant/passport?token=${encodeURIComponent(token)}&submit=1`, { method: "POST" }).catch(() => null);
    }
    setSubmitted(true);
  }

  /* ── The screens ───────────────────────────────────────────────────────── */

  const thisYear = new Date().getFullYear();
  const dobYearOk = yearOk(dobY, 1900, thisYear - 16);
  const dobDays = dobYearOk && dobM ? new Date(Number(dobY), dobM, 0).getDate() : 0;
  const born = d.dob ? longDate(d.dob) : null;
  const lived = d.movedIn ? since(d.movedIn) : null;
  const adults = Math.min(9, Math.max(0, parseInt(d.numAdults, 10) || 0));
  const enter = (fn: () => void) => ({ onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") fn(); } });
  const firstName = d.legalName.trim().split(/\s+/)[0] ?? "";
  const shortAddress = d.currentAddress.split(",")[0].trim();

  const advanceRef = useRef<() => void>(() => {});
  const onEnter = enter(() => advanceRef.current());

  /**
   * A screen made of parts. Complete when every visible part is answered
   * (and, for typed ones, confirmed); its value is every answer, so the
   * screen-level auto-advance fires on the tap that finishes the last part.
   */
  const flowScreen = (screenKey: string, parts: Part[], opts: { auto?: boolean; when?: boolean } = {}): Screen => {
    const id = (k: string) => `${screenKey}/${k}`;
    const shown = parts.filter((pt) => pt.when !== false);
    const complete = (pt: Part) => pt.done && (!pt.typed || confirmed.has(id(pt.key)));
    const firstOpen = shown.findIndex((pt) => !complete(pt));
    const reopenedIdx = reopened ? shown.findIndex((pt) => id(pt.key) === reopened) : -1;
    const current = reopenedIdx !== -1 ? reopenedIdx : firstOpen;
    const node = (
      <div className="space-y-4">
        {shown.map((pt, i) => {
          if (current !== -1 && i > current) return null;
          if (i === current) {
            return (
              <div key={pt.key} className="space-y-7 pt-1" style={{ animation: "riseIn 340ms cubic-bezier(0.22,1,0.36,1) both" }}>
                {pt.node}
              </div>
            );
          }
          return (
            <button
              key={pt.key}
              type="button"
              onClick={() => { setReopened(id(pt.key)); if (pt.typed) unconfirm(id(pt.key)); }}
              className="group flex w-full items-center gap-3 rounded-[10px] border border-transparent px-3 py-2 text-left text-[14px] transition-colors hover:border-line/70 hover:bg-white/60"
              style={{ animation: "riseIn 300ms cubic-bezier(0.22,1,0.36,1) both" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0" style={{ color: BROWN }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 12.5l2.6 2.6L16 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="min-w-0 flex-1 truncate">{pt.summary}</span>
              <span className="text-[12px] text-muted opacity-0 transition-opacity group-hover:opacity-100">Change</span>
            </button>
          );
        })}
      </div>
    );
    return {
      key: screenKey,
      when: opts.when,
      auto: opts.auto,
      done: shown.every(complete),
      value: [shown.map((pt) => pt.value ?? pt.done), shown.map((pt) => confirmed.has(id(pt.key)))],
      node,
      parts: shown,
    };
  };

  const yes = (v: boolean | null) => (v === null ? "" : v ? "Yes" : "No");
  const sinceOptions = ["Less than a year", ...Array.from({ length: 9 }, (_, i) => `Since ${thisYear - 1 - i}`), `Before ${thisYear - 10}`];
  const sinceLabel = (ym: string) => {
    if (!ym) return "";
    const y = Number(ym.slice(0, 4));
    if (y >= thisYear) return "Less than a year";
    if (y < thisYear - 10) return `Before ${thisYear - 10}`;
    return `Since ${y}`;
  };
  const pickSince = (label: string) => {
    const y = label === "Less than a year" ? thisYear : label.startsWith("Before") ? thisYear - 11 : Number(label.replace("Since ", ""));
    const ym = `${y}-01`;
    set("movedIn", ym);
    set("livedThreeYears", label === "Less than a year" ? false : since(ym).months >= 36);
  };

  const screensFor = (i: number): Screen[] => {
    switch (sections[i]?.key) {
      case "identity":
        return [
          {
            key: "names",
            done: Boolean(d.legalName.trim()),
            node: (
              <>
                <Field label="Full legal name" hint="As it appears on your passport or driving licence.">
                  <input className={input} value={d.legalName} placeholder="e.g. Samantha Jones" autoFocus onChange={(e) => set("legalName", e.target.value)} {...lit("legalName")} {...onEnter} />
                </Field>
                <Field label="Known as (optional)" hint="If you go by something else.">
                  <input className={input} value={d.knownAs} placeholder="e.g. Sam" onChange={(e) => set("knownAs", e.target.value)} {...lit("knownAs")} {...onEnter} />
                </Field>
              </>
            ),
          },
          {
            key: "photo",
            done: true,
            node: (
              <>
                <Note>Nice to meet you{firstName ? `, ${firstName}` : ""}.</Note>
                <div>
                  <span className="text-[15px] font-semibold">Do you want to add a photo?</span>
                  <span className="ml-2 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold" style={{ color: BROWN }}>Optional</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted">You can carry on without one.</span>
                  <div className="mt-3">
                    <PhotoField value={d.photo} focus={d.photoFocus} onChange={(v) => set("photo", v)} onFocus={(f) => set("photoFocus", f)} />
                  </div>
                </div>
              </>
            ),
          },
          {
            /* Year, month, day on one screen: the months appear once the year
               is in, the days once the month is picked, and the day moves on. */
            key: "birthday",
            done: Boolean(d.dob),
            auto: true,
            value: d.dob,
            node: (
              <div className="space-y-5">
                <div>
                  <span className="text-[15px] font-semibold">When were you born?</span>
                  <div className="mt-3 flex items-center gap-4">
                    <span className="text-[13.5px] text-muted">The year</span>
                    <YearInput value={dobY} placeholder="1996" onChange={(v) => { setDobY(v); setDobM(null); if (d.dob) set("dob", ""); }} />
                  </div>
                </div>
                {dobYearOk && (
                  <div style={{ animation: "riseIn 300ms cubic-bezier(0.22,1,0.36,1) both" }}>
                    <p className="text-[13.5px] text-muted">And the month</p>
                    <div className="mt-2">
                      <Chips options={MONTHS.map((_, k) => k + 1)} value={dobM} onPick={(m) => { setDobM(m); if (d.dob) set("dob", ""); }} label={(m) => MONTHS[m - 1]} />
                    </div>
                  </div>
                )}
                {dobDays > 0 && (
                  <div style={{ animation: "riseIn 300ms cubic-bezier(0.22,1,0.36,1) both" }}>
                    <p className="text-[13.5px] text-muted">Which day in {MONTHS_LONG[(dobM ?? 1) - 1]}?</p>
                    <div className="mt-2">
                      <Chips
                        options={Array.from({ length: dobDays }, (_, k) => k + 1)}
                        value={d.dob ? Number(d.dob.slice(8, 10)) : null}
                        onPick={(day) => set("dob", `${dobY}-${String(dobM).padStart(2, "0")}-${String(day).padStart(2, "0")}`)}
                        label={(n) => String(n)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ),
          },
          {
            key: "nationality",
            done: Boolean(d.nationality.trim()),
            node: (
              <>
                {born && <Note>{born.long}. Cool, you were born on a {born.weekday}.</Note>}
                <Field label="What's your nationality?">
                  <input className={input} list="passport-nationalities" autoFocus value={d.nationality} placeholder="Start typing" onChange={(e) => set("nationality", e.target.value)} {...lit("nationality")} {...onEnter} />
                  <datalist id="passport-nationalities">
                    {NATIONALITIES.map((n) => <option key={n} value={n} />)}
                  </datalist>
                </Field>
              </>
            ),
          },
          {
            key: "contact",
            done: Boolean(d.email.trim()),
            node: (
              <>
                <Note>Last one for this page: how we reach you.</Note>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Email address">
                    <input type="email" className={input} value={d.email} placeholder="you@example.com" onChange={(e) => set("email", e.target.value)} {...onEnter} />
                  </Field>
                  <Field label="Mobile number">
                    <input type="tel" className={input} value={d.mobile} placeholder="e.g. 07123 456789" onChange={(e) => set("mobile", e.target.value)} {...onEnter} />
                  </Field>
                </div>
              </>
            ),
          },
        ];

      case "right-to-rent":
        return [
          flowScreen("rtr", [
            {
              key: "british",
              done: d.hasBritishPassport !== null,
              value: d.hasBritishPassport,
              summary: <>British or Irish passport: <strong>{yes(d.hasBritishPassport)}</strong></>,
              node: (
                <YesNo
                  label="Do you have a British or Irish passport?"
                  hint="Every landlord in England has to check this by law. This one question decides how."
                  value={d.hasBritishPassport}
                  onChange={(v) => set("hasBritishPassport", v)}
                />
              ),
            },
            {
              key: "settled",
              when: d.hasBritishPassport === true,
              done: true,
              summary: "Nothing to upload - your agent checks it in person.",
              node: (
                <>
                  <Note>That settles it, and there is nothing to upload.</Note>
                  <p className="rounded-[12px] border border-line/70 bg-white px-5 py-4 text-[14px] leading-relaxed text-muted">
                    The law says the passport has to be seen in person, so your agent will check it when you meet. It takes a moment.
                  </p>
                </>
              ),
            },
            {
              key: "share",
              when: d.hasBritishPassport === false,
              done: Boolean(d.shareCode.trim()),
              typed: true,
              summary: <>Share code <strong>{d.shareCode.trim()}</strong></>,
              node: (
                <Field label="Your share code" hint="Free from gov.uk/prove-right-to-rent. It takes about two minutes and lasts 90 days. With this we can do the whole check online, today.">
                  <input className={input} autoFocus value={d.shareCode} placeholder="e.g. W12 A34 B56" onChange={(e) => set("shareCode", e.target.value)} {...onEnter} />
                </Field>
              ),
            },
          ]),
        ];

      case "income":
        return [
          flowScreen("income", [
            {
              key: "status",
              done: Boolean(d.applicantType),
              value: d.applicantType,
              summary: <strong>{d.applicantType}</strong>,
              node: <Choice label="Which best describes you?" value={d.applicantType} options={APPLICANT_TYPES} onChange={(v) => set("applicantType", v)} />,
            },
            {
              key: "money",
              done: money(d.annualIncome) !== null,
              typed: true,
              summary: (
                <>
                  <strong>£{(money(d.annualIncome) ?? 0).toLocaleString("en-GB")}</strong> a year
                  {money(d.savings) !== null && <>, <strong>£{money(d.savings)!.toLocaleString("en-GB")}</strong> saved</>}
                </>
              ),
              node: (
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Annual income" hint="Before tax. If you are not sure, your monthly pay times twelve is close enough.">
                    <input className={input} inputMode="decimal" autoFocus value={d.annualIncome} placeholder="32,000" onChange={(e) => set("annualIncome", e.target.value)} {...onEnter} />
                  </Field>
                  <Field label="Savings" hint="Optional. It is what rescues a borderline application, so it is worth putting in.">
                    <input className={input} inputMode="decimal" value={d.savings} placeholder="4,000" onChange={(e) => set("savings", e.target.value)} {...onEnter} />
                  </Field>
                </div>
              ),
            },
          ]),
        ];

      case "household": {
        const rows = d.coOccupantIncomes.split("\n");
        const row = (k: number) => {
          const line = rows[k] ?? "";
          const at = line.indexOf(" - ");
          return at === -1 ? { name: line.trim(), income: "" } : { name: line.slice(0, at).trim(), income: line.slice(at + 3).trim() };
        };
        const write = (k: number, patch: Partial<{ name: string; income: string }>) => {
          const next = Array.from({ length: Math.max(rows.length, k + 1) }, (_, j) => (j === k ? { ...row(j), ...patch } : row(j)));
          set("coOccupantIncomes", next.map((r) => (r.name || r.income ? `${r.name} - ${r.income}` : "")).join("\n"));
        };
        const you = (
          <div className="flex items-center justify-between rounded-[12px] border border-line/70 bg-white/70 px-4 py-3 text-[14px]">
            <span>
              <span className="font-semibold">{d.legalName.trim() || "You"}</span>
              <span className="text-muted"> · you</span>
            </span>
            <span className="text-muted">{money(d.annualIncome) !== null ? `£${money(d.annualIncome)!.toLocaleString("en-GB")} a year` : "income on the last page"}</span>
          </div>
        );
        return [
          {
            key: "adults",
            done: adults >= 1,
            node: (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="How many adults are moving in, including you?">
                  <input type="number" min={1} max={9} autoFocus className={input} value={d.numAdults} placeholder="1" onChange={(e) => set("numAdults", e.target.value)} {...onEnter} />
                </Field>
                <Field label="And children?">
                  <input type="number" min={0} max={12} className={input} value={d.numChildren} placeholder="0" onChange={(e) => set("numChildren", e.target.value)} {...onEnter} />
                </Field>
              </div>
            ),
          },
          {
            key: "just-you",
            when: adults === 1,
            done: true,
            node: (
              <>
                <Note>Just you{d.numChildren.trim() && d.numChildren !== "0" ? ` and the ${d.numChildren === "1" ? "little one" : "children"}` : ""}. Your income is the household income.</Note>
                {you}
              </>
            ),
          },
          ...Array.from({ length: Math.max(0, adults - 1) }, (_, k): Screen => {
            const r = row(k);
            return {
              key: `adult-${k + 2}`,
              done: Boolean(r.name),
              node: (
                <>
                  {k === 0 ? you : <Note>{row(k - 1).name || `Adult ${k + 1}`} added. Their income counts towards the total.</Note>}
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={adults === 2 ? "Who else is moving in?" : `Adult ${k + 2} of ${adults}`}>
                      <input className={input} autoFocus value={r.name} placeholder="Their name" onChange={(e) => write(k, { name: e.target.value })} {...onEnter} />
                    </Field>
                    <Field label="Income towards the total" hint="A year, before tax.">
                      <input className={input} inputMode="decimal" value={r.income} placeholder="24,000" onChange={(e) => write(k, { income: e.target.value })} {...onEnter} />
                    </Field>
                  </div>
                  {household.total !== null && household.from > 1 && k === adults - 2 && (
                    <p className="text-[14px] text-muted">
                      Household income <strong className="text-ink">£{household.total.toLocaleString("en-GB")}</strong> between {household.from} of you.
                    </p>
                  )}
                </>
              ),
            };
          }),
        ];
      }

      case "history":
        return [
          flowScreen(
            "history",
            [
              {
                key: "address",
                done: Boolean(d.currentAddress.trim()),
                typed: true,
                summary: <>Lives at <strong>{d.currentAddress.trim()}</strong></>,
                node: <TenantAddress label="Where do you live now?" value={d.currentAddress} onChange={(v) => set("currentAddress", v)} onEnter={() => advanceRef.current()} onPicked={() => advanceRef.current()} />,
              },
              {
                key: "since",
                done: Boolean(d.movedIn),
                value: d.movedIn,
                summary: <>There <strong>{sinceLabel(d.movedIn).toLowerCase()}</strong>{lived && d.livedThreeYears === false ? " - under three years" : ""}</>,
                node: (
                  <>
                    <Note>Cool. How long have you lived {shortAddress ? `at ${shortAddress}` : "there"}?</Note>
                    <div>
                      <span className="text-[15px] font-semibold">You've been there since</span>
                      <div className="mt-3">
                        <Chips options={sinceOptions} value={sinceLabel(d.movedIn) || null} onPick={pickSince} label={(o) => o.replace("Since ", "")} />
                      </div>
                    </div>
                  </>
                ),
              },
              {
                key: "previous",
                when: d.livedThreeYears === false,
                done: Boolean(d.previousAddress.trim()),
                typed: true,
                summary: <>Before that, <strong>{d.previousAddress.trim()}</strong></>,
                node: (
                  <>
                    <Note>Under three years, so referencing needs one more.</Note>
                    <TenantAddress label="Where were you before?" value={d.previousAddress} onChange={(v) => set("previousAddress", v)} onEnter={() => advanceRef.current()} onPicked={() => advanceRef.current()} />
                  </>
                ),
              },
              {
                key: "rented",
                done: d.rentedLast12Months !== null,
                value: d.rentedLast12Months,
                summary: <>Rented in the last 12 months: <strong>{yes(d.rentedLast12Months)}</strong></>,
                node: <YesNo label="Have you rented in the last 12 months?" value={d.rentedLast12Months} onChange={(v) => set("rentedLast12Months", v)} />,
              },
              {
                key: "ontime",
                when: d.rentedLast12Months === true,
                done: d.rentOnTime !== null,
                value: d.rentOnTime,
                summary: <>Rent always on time: <strong>{yes(d.rentOnTime)}</strong></>,
                node: <YesNo label="Was the rent always paid on time?" hint="If not, say so. It is far better coming from you than from a reference." value={d.rentOnTime} onChange={(v) => set("rentOnTime", v)} />,
              },
              {
                key: "ref",
                when: d.rentedLast12Months === true,
                done: d.landlordRef !== null,
                value: d.landlordRef,
                summary: <>Landlord can give a reference: <strong>{yes(d.landlordRef)}</strong></>,
                node: <YesNo label="Can your landlord give a reference?" value={d.landlordRef} onChange={(v) => set("landlordRef", v)} />,
              },
            ],
            { auto: true }
          ),
        ];

      case "declarations":
        return [
          flowScreen(
            "declared",
            [
              {
                key: "ccj",
                done: d.adverseCredit !== null,
                value: d.adverseCredit,
                summary: <>Adverse credit: <strong>{yes(d.adverseCredit)}</strong></>,
                node: <YesNo label="Any adverse credit? CCJs, defaults or bankruptcy." value={d.adverseCredit} onChange={(v) => set("adverseCredit", v)} />,
              },
              {
                key: "ccj-note",
                when: d.adverseCredit === true,
                done: Boolean(d.adverseCreditNote.trim()),
                typed: true,
                summary: <span className="text-muted">{d.adverseCreditNote.trim()}</span>,
                node: (
                  <Field label="Tell us about it" hint="A couple of sentences. Context helps, and it is rarely a no on its own.">
                    <textarea rows={3} autoFocus className={`${input} resize-none leading-relaxed`} value={d.adverseCreditNote} onChange={(e) => set("adverseCreditNote", e.target.value)} />
                  </Field>
                ),
              },
              {
                key: "guarantor",
                done: d.guarantor !== null,
                value: d.guarantor,
                summary: <>Could provide a guarantor: <strong>{yes(d.guarantor)}</strong></>,
                node: <YesNo label="Could you provide a guarantor if one were needed?" value={d.guarantor} onChange={(v) => set("guarantor", v)} />,
              },
              {
                key: "pets",
                done: d.pets !== null,
                value: d.pets,
                summary: <>Pets: <strong>{d.pets ? d.petsNote.trim() || "Yes" : yes(d.pets)}</strong></>,
                node: <YesNo label="Any pets?" value={d.pets} onChange={(v) => set("pets", v)} />,
              },
              {
                key: "pet-kind",
                when: d.pets === true,
                done: Boolean(d.petsNote.trim()),
                typed: true,
                summary: <>{d.petsNote.trim()}</>,
                node: (
                  <Field label="What kind?">
                    <input className={input} autoFocus value={d.petsNote} placeholder="e.g. one cat" onChange={(e) => set("petsNote", e.target.value)} {...onEnter} />
                  </Field>
                ),
              },
              {
                key: "smoker",
                done: d.smoker !== null,
                value: d.smoker,
                summary: <>Anyone smokes: <strong>{yes(d.smoker)}</strong></>,
                node: <YesNo label="Does anyone moving in smoke?" value={d.smoker} onChange={(v) => set("smoker", v)} />,
              },
            ],
            { auto: true }
          ),
        ];

      case "extra":
        return [
          flowScreen(
            "extra",
            questions.map((qn): Part => {
              const value = answers[qn.id] ?? "";
              const put = (v: string) => setAnswers((a) => ({ ...a, [qn.id]: v }));
              const label = qn.required ? `${qn.label} *` : qn.label;
              const shown = qn.kind === "yesno" ? (value === "yes" ? "Yes" : value === "no" ? "No" : "") : value;
              const base = { key: qn.id, done: value.trim() !== "", value, summary: <>{qn.label}: <strong>{shown}</strong></> };
              if (qn.kind === "yesno") return { ...base, node: <YesNo label={label} value={value === "" ? null : value === "yes"} onChange={(v) => put(v ? "yes" : "no")} /> };
              if (qn.kind === "select") return { ...base, node: <Choice label={label} value={value} options={qn.options} onChange={put} /> };
              return {
                ...base,
                typed: true,
                node: (
                  <Field label={label}>
                    <input className={input} autoFocus value={value} onChange={(e) => put(e.target.value)} {...onEnter} />
                  </Field>
                ),
              };
            }),
            { auto: true }
          ),
        ];

      default:
        return [];
    }
  };

  const visibleFor = (i: number) => screensFor(i).filter((s) => s.when !== false);
  const visible = visibleFor(step);
  const at = Math.min(sub, Math.max(0, visible.length - 1));
  const cur = visible[at];
  const lastScreen = at === visible.length - 1;
  /* On a flow, Continue folds the open typed part; only once every part is
     folded does the button lead off the screen. */
  const flowOpenTyped = Boolean(
    cur?.parts?.some((pt) => pt.typed && !confirmed.has(`${cur.key}/${pt.key}`) && (reopened === `${cur.key}/${pt.key}` || !cur.parts!.slice(0, cur.parts!.indexOf(pt)).some((q) => !(q.done && (!q.typed || confirmed.has(`${cur.key}/${q.key}`))))))
  );

  /* ── Moving between screens ────────────────────────────────────────────── */

  function go(toStep: number, toSub: number, direction: 1 | -1) {
    setDir(direction);
    setStep(toStep);
    setSub(toSub);
  }
  const advance = () => {
    /* On a flow, Continue folds the open typed part first. If that was the
       last part, carry on out of the screen; if not, stay for the next. */
    if (cur?.parts) {
      const id = (k: string) => `${cur.key}/${k}`;
      const complete = (pt: Part) => pt.done && (!pt.typed || confirmed.has(id(pt.key)));
      const open = reopened ? cur.parts.find((pt) => id(pt.key) === reopened) : cur.parts.find((pt) => !complete(pt));
      if (open && open.typed && open.done && !confirmed.has(id(open.key))) {
        confirm(id(open.key));
        setReopened(null);
        const others = cur.parts.filter((pt) => pt !== open);
        if (!others.every(complete)) return;
      } else if (open && reopened) {
        setReopened(null);
        return;
      }
    }
    if (!lastScreen) go(step, at + 1, 1);
    else if (!lastStep) go(step + 1, 0, 1);
  };
  advanceRef.current = advance;
  const back = () => {
    if (at > 0) go(step, at - 1, -1);
    else if (step > 0) go(step - 1, Math.max(0, visibleFor(step - 1).length - 1), -1);
  };

  /* A tap moves on by itself, a beat after it lands - but only for an answer
     given on THIS screen. Arriving on a screen answered earlier (going back,
     say) must not bounce straight off it again; changing that answer here
     must. So the screen remembers the answer it arrived with, and moves on
     when the answer differs from that and counts as done. */
  const arrived = useRef<{ key: string; value: string }>({ key: "", value: "" });
  const curKey = cur ? `${step}/${cur.key}` : "";
  const curDone = cur?.done ?? false;
  const curValue = JSON.stringify(cur?.value ?? null);
  useEffect(() => {
    arrived.current = { key: curKey, value: curValue };
    setReopened(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey]);
  const reopenedValue = JSON.stringify(cur?.parts?.find((pt) => `${cur.key}/${pt.key}` === reopened)?.value ?? null);
  const reopenedAt = useRef<string>("");
  useEffect(() => {
    reopenedAt.current = reopenedValue;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopened]);
  useEffect(() => {
    if (!reopened) return;
    const part = cur?.parts?.find((pt) => `${cur.key}/${pt.key}` === reopened);
    if (part && !part.typed && reopenedValue !== reopenedAt.current) setReopened(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reopenedValue]);
  useEffect(() => {
    if (!cur?.auto || !curDone || arrived.current.value === curValue) return;
    const id = window.setTimeout(() => advanceRef.current(), 420);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey, curDone, curValue]);

  /* ── Render ────────────────────────────────────────────────────────────── */

  const head = HEADLINES[sections[step].key] ?? { lead: agentName ? "A few more from" : "A few more", em: agentName || "questions" };
  const saveNote =
    demo ? "A sample - nothing you type is saved."
    : state === "saving" ? "Saving…"
    : state === "error" ? "Not saved - check your connection"
    : state === "saved" ? "Saved"
    : "Everything saves as you go.";

  return (
    <div data-passport-page className="lg:grid lg:h-[calc(100vh-64px)] lg:grid-cols-[minmax(0,46%)_minmax(0,54%)] lg:overflow-hidden">
      {/* ── Left: the headline, one question, the way on ── */}
      <div className="flex flex-col px-5 pb-8 pt-8 sm:px-8 lg:h-full lg:min-h-0 lg:px-12 lg:pb-8 lg:pt-9 xl:px-16">
        <div
          key={step}
          className="shrink-0"
          style={{ animation: "slideIn 340ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 28}px` }}
        >
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.22em] text-muted">Tenant Passport</p>
          <h1 className="hand mt-3 text-[44px] leading-[0.98] sm:text-[52px] xl:text-[60px]">
            {head.lead}
            {head.before ? <br /> : " "}
            {head.before && `${head.before} `}
            <span className="inline-block" style={{ color: BROWN, boxShadow: `inset 0 -0.14em 0 0 var(--page), inset 0 -0.2em 0 0 ${BROWN}` }}>
              {head.em}
            </span>
          </h1>
          <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted">{sections[step].blurb}</p>
        </div>

        {/* The question. Keyed on the screen so each one slides in from the
            side it came from; the container never scrolls because no screen
            is taller than the room it has. */}
        <div className="mt-8 min-h-0 flex-1 overflow-hidden">
          <div
            key={curKey}
            className="max-w-[680px] space-y-7"
            style={{ animation: "slideIn 380ms cubic-bezier(0.22,1,0.36,1) both", ["--from" as string]: `${dir * 44}px` }}
          >
            {cur?.node}
          </div>
        </div>

        <div className="mt-6 max-w-[680px] shrink-0">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            {(step > 0 || at > 0) && (
              <button type="button" onClick={back} className="rounded-[12px] border border-line/80 bg-white px-6 py-3.5 text-[14.5px] font-medium transition-colors hover:border-ink">
                Back
              </button>
            )}
            {!(lastStep && lastScreen) ? (
              <button
                type="button"
                onClick={advance}
                className="flex items-center gap-3 rounded-[12px] px-7 py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: BROWN }}
              >
                {lastScreen && !flowOpenTyped ? "Next step" : "Continue"}
                <Arrow />
              </button>
            ) : submitted ? (
              <p className="text-[14px] leading-relaxed">
                <strong>Your passport is with us.</strong> Change anything you like - it updates straight away, and this link keeps working.
              </p>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={!allDone}
                className={`flex items-center gap-3 rounded-[12px] px-7 py-3.5 text-[15px] font-semibold text-white transition-opacity ${allDone ? "hover:opacity-90" : "cursor-not-allowed opacity-40"}`}
                style={{ background: BROWN }}
              >
                {finishLabel}
                {allDone && <Arrow />}
              </button>
            )}
            <span className="flex items-center gap-2 text-[13px] text-muted">
              <Lock />
              {state === "error" ? <span className="text-[#9d4340]">{saveNote}</span> : saveNote}
            </span>
          </div>

          {/* The progress bar: one segment per section, every segment a
              button, so any section can be jumped to. Nothing is gated. */}
          <div className="mt-6">
            <div className="flex items-baseline justify-between text-[12.5px] text-muted">
              <span>
                Step {step + 1} of {sections.length}
                <span className="text-ink"> · {sections[step].title}</span>
                {visible.length > 1 && <span> · {at + 1} of {visible.length}</span>}
              </span>
              <span>{done} of {total} stamps · {bar.pct}% filled in</span>
            </div>
            <div className="mt-2 flex gap-1.5">
              {sections.map((s, i) => {
                const isDone = s.done(d);
                const here = i === step;
                return (
                  <button
                    key={s.key}
                    type="button"
                    title={s.title}
                    aria-label={`${s.title}${isDone ? ", done" : ""}`}
                    aria-current={here ? "step" : undefined}
                    onClick={() => go(i, 0, i > step ? 1 : -1)}
                    className="h-[7px] flex-1 rounded-full transition-colors"
                    style={{ background: isDone ? BROWN : here ? "var(--accent)" : "var(--line)", opacity: isDone || here ? 1 : 0.55 }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: the passport, on the desk ── */}
      <aside className="relative overflow-hidden lg:h-full">
        <div className="hidden h-full lg:block lg:p-4 xl:p-6">
          <PassportScene data={d} focus={focus} side={step === 0 ? "front" : "back"} />
        </div>
        <div className="px-5 py-10 sm:px-10 lg:hidden">
          <PassportFlat data={d} focus={focus} side={step === 0 ? "front" : "back"} />
          <p className="mt-6 text-[12.5px] leading-relaxed text-muted">Nothing here is shared with a landlord unless you apply for their property.</p>
        </div>
      </aside>
    </div>
  );
}
