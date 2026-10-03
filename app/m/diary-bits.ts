import type { Appt } from "@/lib/diary";

/** Shared by the calendar and the appointment screen. */

export const KIND_LABEL: Record<string, string> = {
  viewing: "Viewing",
  appraisal: "Market Appraisal",
  takeon: "Take-on Visit",
  movein: "Move-in",
  inspection: "Inspection",
  travel: "Travel",
  other: "Appointment",
};

/* A drawing for each kind of appointment, from the Notioly set (2 Oct 2026). */
export const KIND_ART: Record<string, string> = {
  viewing: "/illustrations/people/real-estate-agent.svg",
  appraisal: "/illustrations/people/taking-notes.svg",
  takeon: "/illustrations/people/agreement-deal.svg",
  movein: "/illustrations/people/moving-day.svg",
  inspection: "/illustrations/notioly/checklist.svg",
  other: "/illustrations/notioly/checking-the-calendar.svg",
};

export const DIARY_KEY = "m-diary";

export function endOf(a: Appt): string {
  const [h, m] = a.start.split(":").map(Number);
  const t = h * 60 + m + a.mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** "HH:MM" now, on the phone's own clock - the diary is in the same zone. */
export const nowHm = () => new Date().toTimeString().slice(0, 5);

/**
 * The diary as the phone shows it: my own appointments, never the sample
 * book. Kept in sessionStorage too, so the appointment screen opens without
 * asking again.
 */
export async function loadDiary(): Promise<{ appts: Appt[]; note: string | null }> {
  const r = await fetch("/api/diary", { cache: "no-store" });
  const j = (await r.json()) as { ok?: boolean; error?: string; live?: boolean; appts?: Appt[]; mine?: Appt[]; reason?: string; everything?: boolean };
  if (!r.ok || !j.ok) throw new Error(j.error ?? "Your calendar did not load.");
  /* When the full diary is not connected, what the OS itself holds is shown
     and the screen says that is all it is. */
  const all = j.live ? j.appts ?? [] : j.mine ?? [];
  /* An owner is sent the whole team's book; the phone is MY day (21 Sep 2026).
     `own` is marked by the diary route. */
  const appts = j.everything ? all.filter((a) => a.own) : all;
  try {
    sessionStorage.setItem(DIARY_KEY, JSON.stringify(appts));
  } catch {
    /* The event page asks the diary again when there is no copy. */
  }
  return { appts, note: !j.live && j.reason ? "Only appointments made in the OS are showing." : null };
}

