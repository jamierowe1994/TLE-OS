import type { Since } from "@/components/admin/tracking/kit";

/**
 * What /api/admin/tracking answers, for Tracking's two looks (the pages, and
 * components/new-look/admin/Tracking*New). Moved out of the pages on
 * 24 Oct 2026 so neither copies the other.
 */

export type Overview = {
  sources: Record<string, string | null>;
  highlights: {
    active: number;
    accounts: number;
    mostUsed: { key: string; label: string; opens: number; people: number } | null;
    leastUsed: { key: string; label: string; opens: number; people: number } | null;
    neverOpened: string[];
    busiest: { key: string; name: string; opens: number; actions: number } | null;
    passport: { sent: number; finished: number } | null;
    longestStay: { page: string; label: string; avgSeconds: number } | null;
    timedAny: boolean;
    outcomes: Array<{ key: string; label: string; section: string; count: number; people: number; error: string | null }>;
  };
  sections: Array<{
    key: string;
    label: string;
    icon: string;
    blurb: string;
    people: number;
    opens: number;
    actions: number;
    seconds: number;
    timed: number;
    hasPages: boolean;
    metrics: Array<{ key: string; label: string; count: number; error: string | null }>;
  }>;
  people: Array<{ key: string; name: string; team: string; opens: number; actions: number; outcomes: number; days: number; seconds: number; topSection: string | null }>;
  since: Since;
};

export type Rec = { at: string; person: string; personName: string; title: string; href: string | null };
export type PageRow = {
  page: string;
  label: string;
  section: string | null;
  views: number;
  seconds: number;
  timed: number;
  people: number;
  byPerson: Array<{ key: string; name: string; views: number; seconds: number; timed: number }>;
};
export type PassportItem = {
  token: string;
  name: string;
  email: string;
  agent: string;
  agentKey: string;
  sentAt: string;
  openedAt: string | null;
  opens: number;
  finishedAt: string | null;
  lastActivity: string;
  stage: "sent" | "opened" | "started" | "finished";
  stoppedAt: string | null;
};
export type Funnel = { sent: number; opened: number; started: number; finished: number };
export type Section = {
  section: { key: string; label: string; blurb: string; hasPages: boolean };
  sources: Record<string, string | null>;
  people: Array<{ key: string; name: string; team: string; opens: number; actions: number; seconds: number; timed: number; days: number; counts: Record<string, number> }>;
  teams: Array<{ team: string; people: number; opens: number; actions: number; outcomes: number }>;
  days: Array<{ day: string; opens: number; actions: number; outcomes: number }>;
  metrics: Array<{ key: string; label: string; source: string; since: string | null; error: string | null; count: number; people: number; records: Rec[] }>;
  pages: PageRow[];
  passport: null | {
    error: string | null;
    funnel: Funnel | null;
    drops: Array<{ at: string; count: number }>;
    agents: Array<{ key: string; name: string } & Funnel>;
    list: PassportItem[];
  };
  since: Since;
};
