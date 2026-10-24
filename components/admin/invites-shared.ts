import { londonDayOffset, londonHHMM } from "@/lib/london-time";

/**
 * What People > Invites works with, shared by its two looks (the page, and
 * components/new-look/admin/InvitesNew). Moved out of the page on 24 Oct 2026
 * so neither copies the other.
 */

export type Person = {
  email: string;
  name: string;
  emails: string[];
  rexId: string | null;
  role: string;
  sources: string[];
  custom: boolean;
  included: boolean;
  sendable: boolean;
  sentAt: string | null;
  lastError: string | null;
  linkExpiresAt: string | null;
};
export type Ready = {
  photo: boolean;
  rex: "live" | "lapsed" | "none";
  email: boolean;
  setup: boolean;
  tour: boolean;
  app: { kind: "ios" | "homescreen" | "browser" | "alerts"; at: string } | null;
  lastSeenAt: string | null;
};

export const APP_KIND: Record<string, string> = {
  ios: "the iPhone app",
  homescreen: "the app on their home screen",
  browser: "the app in a phone browser",
  alerts: "phone alerts on",
};
export type On = { userId: string; name: string; email: string; role: string; createdAt: string | null; ready: Ready };
export type Board = {
  ok: boolean;
  error?: string;
  toInvite: Person[];
  on: On[];
  launchedAt: string | null;
  tourUrl: string;
  linkDays: number;
};

export const SOURCE_LABEL: Record<string, string> = {
  rex: "REX",
  hub: "Team Hub",
  website: "Website",
  added: "Added by you",
  invite: "Invite list",
  departed: "Team Hub says they've left",
};

/** "11:31 today", "11:31 tomorrow", or a date - London time. */
export function at(iso: string): string {
  const d = londonDayOffset(iso);
  if (d === 0) return `${londonHHMM(iso)} today`;
  if (d === 1) return `${londonHHMM(iso)} tomorrow`;
  if (d === -1) return `${londonHHMM(iso)} yesterday`;
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}


/** Photo, REX, email, setup, tour, phone app. */
export const CHECKS = 6;

export function readyCount(r: Ready): number {
  return [r.photo, r.rex === "live", r.email, r.setup, r.tour, Boolean(r.app)].filter(Boolean).length;
}
