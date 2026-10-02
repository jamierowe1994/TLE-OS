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

export const DIARY_KEY = "m-diary";

export function endOf(a: Appt): string {
  const [h, m] = a.start.split(":").map(Number);
  const t = h * 60 + m + a.mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

