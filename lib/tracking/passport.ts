import { EMPTY_PASSPORT, SCOTLAND, money, type PassportData, type PassportRules } from "@/lib/passport-shape";

/**
 * The tenant passport funnel (15 Oct 2026, Admin > Tracking).
 *
 *   sent      the invite email went (invited_at)
 *   opened    the tenant had it open in their own browser (opened_at, from
 *             this deploy - app/api/tenant/passport/opened). Before then an
 *             open is only known if they went on to fill something in.
 *   started   they answered something beyond the name and email the invite
 *             fills in. The same test the listing's Enquiries use
 *             (app/api/tenant/passport/status), so the two screens agree.
 *   finished  submitted_at
 *
 * Where somebody stopped is read off their own answers: the first question,
 * in the order the passport asks them, that is still empty. That works for
 * every passport ever sent, not just ones from today, because the form saves
 * as they go. It is how the share code wall (9 Oct 2026) shows up: "British
 * or Irish passport: No", then nothing.
 */

export type PassportStage = "sent" | "opened" | "started" | "finished";

/** The questions in the order the passport asks them, with the words a tenant sees. */
const ASKED: Array<{ step: string; label: string; open: (d: PassportData, r: PassportRules) => boolean }> = [
  { step: "Who you are", label: "Full name", open: (d) => !d.legalName.trim() },
  { step: "Who you are", label: "Date of birth", open: (d) => !d.dob },
  { step: "Who you are", label: "Nationality", open: (d, r) => !r.noNationality && !d.nationality.trim() },
  { step: "Who you are", label: "Email", open: (d) => !d.email.trim() },
  { step: "Who you are", label: "Mobile number", open: (d) => !d.mobile.trim() },
  { step: "Right to rent", label: "British or Irish passport", open: (d, r) => !r.noRightToRent && d.hasBritishPassport === null },
  { step: "Right to rent", label: "Share code", open: (d, r) => !r.noRightToRent && d.hasBritishPassport === false && !d.shareCode.trim() },
  { step: "What you earn", label: "What they do for work", open: (d) => !d.applicantType },
  { step: "What you earn", label: "Income", open: (d) => money(d.annualIncome) === null },
  { step: "Who's moving in", label: "How many adults", open: (d) => !d.numAdults.trim() },
  { step: "Current rental", label: "Current address", open: (d) => !d.currentAddress.trim() },
  { step: "Current rental", label: "Rented in the last 12 months", open: (d) => d.rentedLast12Months === null },
  { step: "Current rental", label: "Lived there three years", open: (d) => d.livedThreeYears === null },
  { step: "A few last things", label: "Credit history", open: (d) => d.adverseCredit === null },
  { step: "A few last things", label: "Guarantor", open: (d) => d.guarantor === null },
  { step: "A few last things", label: "Pets", open: (d) => d.pets === null },
  { step: "A few last things", label: "Smoker", open: (d) => d.smoker === null },
];

/** The labels in order, for drawing the drop-off in the order they are met. */
export const STOP_ORDER = ["Not opened", "Opened, nothing filled in", ...ASKED.map((a) => a.label), "Last screen (making their account)"];

export type PassportRow = {
  token: string;
  name: string;
  email: string;
  agent_id: string | null;
  invited_by: string | null;
  invited_at: Date | string;
  opened_at: Date | string | null;
  opens: number;
  submitted_at: Date | string | null;
  updated_at: Date | string;
  scottish_home: boolean;
  data: Partial<PassportData> | null;
};

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);

/** Same test as app/api/tenant/passport/status. */
function startedOn(d: Partial<PassportData>): boolean {
  return Boolean(d.dob || d.applicantType || d.currentAddress || d.mobile);
}

export interface PassportLine {
  token: string;
  name: string;
  email: string;
  agentRaw: string | null;
  sentAt: string;
  openedAt: string | null;
  opens: number;
  finishedAt: string | null;
  lastActivity: string;
  stage: PassportStage;
  /** Where an unfinished passport stands: the first unanswered question, or "Not opened". */
  stoppedAt: string | null;
  stoppedStep: string | null;
}

export function passportLine(r: PassportRow): PassportLine {
  const d: PassportData = { ...EMPTY_PASSPORT, ...(r.data ?? {}) } as PassportData;
  const rules: PassportRules = r.scottish_home ? SCOTLAND : {};
  const started = startedOn(r.data ?? {});
  const finished = Boolean(r.submitted_at);
  /* A passport somebody filled in was opened, whether or not the open was
     recorded: opens were only recorded from 15 Oct 2026. */
  const opened = Boolean(r.opened_at) || started || finished;
  const stage: PassportStage = finished ? "finished" : started ? "started" : opened ? "opened" : "sent";
  let stoppedAt: string | null = null;
  let stoppedStep: string | null = null;
  if (!finished) {
    if (!opened) stoppedAt = "Not opened";
    else if (!started) stoppedAt = "Opened, nothing filled in";
    else {
      const q = ASKED.find((a) => a.open(d, rules));
      stoppedAt = q?.label ?? "Last screen (making their account)";
      stoppedStep = q?.step ?? "Finishing";
    }
  }
  return {
    token: r.token,
    name: (r.name || d.legalName || r.email || "A tenant").trim(),
    email: r.email,
    agentRaw: r.agent_id ?? r.invited_by,
    sentAt: iso(r.invited_at)!,
    openedAt: iso(r.opened_at),
    opens: r.opens ?? 0,
    finishedAt: iso(r.submitted_at),
    lastActivity: iso(r.updated_at)!,
    stage,
    stoppedAt,
    stoppedStep,
  };
}

/** The four steps, each counting everybody who got at least that far. */
export function funnelOf(lines: PassportLine[]) {
  const rank: Record<PassportStage, number> = { sent: 0, opened: 1, started: 2, finished: 3 };
  const reached = (s: PassportStage) => lines.filter((l) => rank[l.stage] >= rank[s]).length;
  return { sent: lines.length, opened: reached("opened"), started: reached("started"), finished: reached("finished") };
}

/** Unfinished passports, counted by where they stopped, in the order the questions come. */
export function dropsOf(lines: PassportLine[]) {
  const by = new Map<string, number>();
  for (const l of lines) if (l.stoppedAt) by.set(l.stoppedAt, (by.get(l.stoppedAt) ?? 0) + 1);
  return STOP_ORDER.filter((s) => by.has(s)).map((s) => ({ at: s, count: by.get(s)! }));
}
