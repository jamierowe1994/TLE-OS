import type { Appt, ApptKind } from "@/lib/diary";
import { KIND_META, minutesOf } from "@/lib/diary";
import { SAGE_INK, SAGE_WASH } from "@/components/appraisal/NextUp";

/**
 * What the Viewings screen's pieces share: the day arithmetic, the words for
 * a day, and the three tones an appointment can wear.
 *
 * Everything here is derived from `new Date()` at the moment it runs and from
 * the diary's own day offsets. There is no month literal anywhere in this
 * folder: open it on the 31st of December and it rolls into January on its
 * own, which is the standing rule and the thing that has bitten this stack
 * before.
 */

export { SAGE_INK, SAGE_WASH };

/* The appraisal file's grammar, so the two screens read as one product. */
export const card = "rounded-[22px] border border-line/50 bg-white";
export const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
/* The brown is the palette's contrast colour: buttons and the thing you
   chose. One per screen region, never a wash. */
export const primary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-brown px-4 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90";
export const secondary =
  "inline-flex items-center justify-center gap-2 rounded-full border border-line/70 bg-white px-4 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40";

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Midnight today, so day arithmetic never trips over the current time. */
export function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dateOfOffset(offset: number): Date {
  const d = todayStart();
  d.setDate(d.getDate() + offset);
  return d;
}

/** Whole days between two local midnights - the diary's own unit. */
export function offsetOf(d: Date): number {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((m.getTime() - todayStart().getTime()) / 86_400_000);
}

/** "Today" / "Tomorrow" / "Yesterday", or nothing - a badge, not the heading. */
export function nearLabel(offset: number): string | null {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return null;
}

export const fmtFull = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
export const fmtShort = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

export function endTime(a: Appt): string {
  const end = minutesOf(a.start) + a.mins;
  return `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

/** 90 → "1h 30m", said the way a diary is read aloud. */
export function lengthLabel(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** The property out of "Viewing — 41 Harewood Road". A REX title such as
 *  "TLE - Rental Market Appraisal" arrives with its brand prefix already
 *  stripped and the dash left behind, so a leading dash goes too. */
export function subjectOf(a: Appt): string {
  return a.what.replace(/^[^—]+—\s*/, "").replace(/^[-–]\s*/, "").trim();
}

/** The line a row leads with: the person if we know them, else the thing. */
export function titleOf(a: Appt): string {
  return a.who || subjectOf(a);
}

/** The line under it: the thing if the person led, then where it is. */
export function subOf(a: Appt): string {
  const first = a.who ? subjectOf(a) : KIND_META[a.kind].label;
  return a.where ? `${first} · ${a.where}` : first;
}

/** All-day entries first, then by time. */
export function sortDay(list: Appt[]): Appt[] {
  return [...list].sort(
    (x, y) => Number(!!y.allDay) - Number(!!x.allDay) || minutesOf(x.start) - minutesOf(y.start)
  );
}

/** offset → its appointments, in order. */
export function groupByDay(appts: Appt[]): Map<number, Appt[]> {
  const m = new Map<number, Appt[]>();
  for (const a of appts) {
    const list = m.get(a.day);
    if (list) list.push(a);
    else m.set(a.day, [a]);
  }
  for (const [k, list] of m) m.set(k, sortDay(list));
  return m;
}

/**
 * Three tones, not seven. A viewing is the job this screen is for, so it
 * wears the agent's accent; the rest of the property work (appraisals,
 * take-ons, move-ins, inspections) is sage, the palette's balance to the
 * pink; anything else in the day is quiet grey. Travel is a gap and reads
 * as one.
 */
export type Tone = "accent" | "sage" | "neutral" | "travel";

export function toneOf(kind: ApptKind): Tone {
  if (kind === "viewing") return "accent";
  if (kind === "travel") return "travel";
  if (kind === "other") return "neutral";
  return "sage";
}

/** The round icon bubble beside a row. */
export function bubble(tone: Tone): { className: string; style?: React.CSSProperties } {
  if (tone === "accent") return { className: "bg-accent-soft text-accent-dark" };
  if (tone === "sage") return { className: "", style: { background: SAGE_WASH, color: SAGE_INK } };
  return { className: "bg-panel text-muted" };
}

/** A block on the week grid. */
export function block(tone: Tone, past: boolean): { className: string; style?: React.CSSProperties } {
  if (tone === "travel")
    return {
      className: "border-dashed border-line text-muted/50",
      style: { backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 6px)" },
    };
  if (past) return { className: "border-line/60 bg-white text-muted" };
  if (tone === "accent") return { className: "border-accent/50 bg-accent-soft/80 text-ink" };
  if (tone === "sage") return { className: "border-transparent text-ink", style: { background: SAGE_WASH } };
  return { className: "border-line/60 bg-panel text-ink" };
}
