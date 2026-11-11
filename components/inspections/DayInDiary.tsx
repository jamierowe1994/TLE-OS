"use client";

import { useMyDiary } from "@/lib/diary-store";
import type { Appt } from "@/lib/diary";

/**
 * YOUR DIARY FOR THE DAY YOU ARE BOOKING (Rhiannon Dodge, ticket cbf2c42c,
 * 11 Nov 2026: "when booking an inspection into the diary can we have it so
 * that when you click the date you can see your diary, otherwise you are
 * having to go back and check the diary separately to make sure you don't
 * double book").
 *
 * The day picked, read from the same live diary the Diary screen draws
 * (lib/diary-store: REX, the OS's own entries and Outlook), with anything
 * that overlaps the time being booked said in words. Your own diary only:
 * everybody sees their own (James, 24 Sep 2026), so when somebody else is
 * going it says theirs is not shown rather than passing yours off as theirs.
 */

const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hhmm = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Whole days from today to `ymd`, on the local calendar (noon to noon, so a clock change cannot tip it). */
function offsetOf(ymd: string): number | null {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

export default function DayInDiary({ date, time, mins, goingName, goingIsMe, already }: {
  /** "2026-11-13" */
  date: string;
  /** "10:00" */
  time: string;
  mins: number;
  goingName: string | null;
  goingIsMe: boolean;
  /** When this visit is already booked ("2026-11-13", "10:00"): its own entry is moving, not a clash. */
  already?: { date: string; time: string } | null;
}) {
  const diary = useMyDiary();
  const offset = offsetOf(date);
  const dayWords = (() => {
    const d = new Date(`${date}T12:00:00`);
    return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  })();

  const from = toMins(time);
  const to = from + mins;
  const items: Appt[] =
    offset == null
      ? []
      : diary.appts
          .filter((a) => a.day === offset && a.kind !== "slot")
          .filter((a) => !(already && already.date === date && a.kind === "inspection" && a.start === already.time))
          .sort((a, b) => a.start.localeCompare(b.start));
  const clashes = items.filter((a) => {
    const s = toMins(a.start);
    return s < to && s + (a.mins || 30) > from;
  });

  return (
    <div className="rounded-xl border border-line/80 bg-white p-3" data-day-in-diary>
      <p className="mb-1 block text-[10.5px] font-bold uppercase tracking-wider text-muted">Your Diary, {dayWords}</p>
      {!goingIsMe && goingName && (
        <p className="mb-2 text-[11.5px] text-muted">{goingName.split(/\s+/)[0]} is going. This is your own diary: theirs is only shown to them.</p>
      )}
      {diary.loading ? (
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-ink" />
          Reading your diary…
        </p>
      ) : (
        <>
          {goingIsMe && (
            <p className={`mb-2 text-[12.5px] font-semibold ${clashes.length ? "text-accent-dark" : "text-ink"}`} role={clashes.length ? "alert" : undefined}>
              {clashes.length
                ? `${hhmm(from)} to ${hhmm(to)} clashes with ${clashes.map((c) => `${c.start} ${c.what}`).join(", ")}.`
                : `You are free from ${hhmm(from)} to ${hhmm(to)}.`}
            </p>
          )}
          {items.length === 0 ? (
            <p className="text-[12px] text-muted">Nothing else in your diary that day.</p>
          ) : (
            <ul className="divide-y divide-line/50">
              {items.map((a) => {
                const clash = clashes.includes(a);
                return (
                  <li key={a.id} className={`flex items-start gap-3 py-1.5 text-[12.5px] ${clash ? "text-accent-dark" : ""}`}>
                    <span className="w-[92px] shrink-0 tabular-nums">{a.start} to {hhmm(toMins(a.start) + (a.mins || 30))}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.what || "Busy"}</span>
                      {a.where && <span className="block truncate text-[11.5px] text-muted">{a.where}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {diary.error && <p className="mt-2 text-[11px] text-muted">{diary.error} What is shown is what the OS holds.</p>}
          {diary.outlook?.state === "failed" && <p className="mt-1 text-[11px] text-muted">{diary.outlook.reason ?? "Your Outlook calendar couldn't be read just now."}</p>}
        </>
      )}
    </div>
  );
}
