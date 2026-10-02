import "server-only";
import { hasDb, q } from "@/lib/db";
import { sendEmail } from "@/lib/resend";
import { switchOn } from "@/lib/switches";
import { londonParts } from "@/lib/london-time";
import { skyListShell } from "@/lib/email/shell-sky";

/**
 * Customer updates: the agent tells them, the system never does
 * (James, 2 Oct 2026).
 *
 *   "When we receive an update, we should then send back to the agent. The
 *   agent should then decide whether they want to push the update via an
 *   email or if they want to reach out via a call. Rather than sending
 *   automated messages ... we should allow the agent to push all of them."
 *
 * So when something happens on a let - the landlord says yes, references come
 * back or fail, the PLC check sends something back, the agreement goes out -
 * a row lands here with the agent, one entry per person who should hear
 * (tenant, landlord). For each the agent picks:
 *
 *   Email them    the words are already written (lib/customer-update-copy, or
 *                 the catalogue email that used to go on its own); they open
 *                 in the review sheet, get edited, and go from the agent's
 *                 own address through sendAsAgent
 *   I'll call     a one-line outcome, saved on the update, on the deal's
 *                 thread and as a note in REX
 *   Not needed    with a reason
 *
 * Untouched: a reminder to the agent after four working hours, and the next
 * working morning it goes on Kirstie's feed. Nothing ever goes to the
 * customer by itself.
 */

export type UpdateRole = "tenant" | "landlord";
export type RecipientState = "open" | "emailed" | "called" | "skipped";

export interface UpdateRecipient {
  role: UpdateRole;
  name: string;
  email: string | null;
  /** The catalogue email the draft is built from. */
  emailId: string;
  vars: Record<string, string>;
  /** REX contact, for the call note. */
  contactId?: string | null;
  state: RecipientState;
  doneAt?: string | null;
  doneBy?: string | null;
  note?: string | null;
}

export interface CustomerUpdate {
  id: number;
  key: string;
  applicationId: string | null;
  dealId: string | null;
  property: string;
  agentEmail: string | null;
  agentName: string | null;
  kind: string;
  /** For the agent: what happened, in one line. */
  headline: string;
  /** For the agent: anything that helps them decide (the PLC findings, say). */
  why: string;
  recipients: UpdateRecipient[];
  state: "open" | "done";
  createdAt: string;
  nudgedAt: string | null;
  escalatedAt: string | null;
  doneAt: string | null;
}

type Row = {
  id: string; key: string; application_id: string | null; deal_id: string | null; property: string;
  agent_email: string | null; agent_name: string | null; kind: string; headline: string; why: string;
  recipients: UpdateRecipient[]; state: string; created_at: Date; nudged_at: Date | null;
  escalated_at: Date | null; done_at: Date | null;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function fromRow(r: Row): CustomerUpdate {
  return {
    id: Number(r.id),
    key: r.key,
    applicationId: r.application_id,
    dealId: r.deal_id,
    property: r.property,
    agentEmail: r.agent_email,
    agentName: r.agent_name,
    kind: r.kind,
    headline: r.headline,
    why: r.why,
    recipients: Array.isArray(r.recipients) ? r.recipients : [],
    state: r.state === "done" ? "done" : "open",
    createdAt: iso(r.created_at) as string,
    nudgedAt: iso(r.nudged_at),
    escalatedAt: iso(r.escalated_at),
    doneAt: iso(r.done_at),
  };
}

const SITE = () => (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

/* ───────────────────────────── making one ──────────────────────────────── */

export interface NewUpdate {
  /** Stable: the same thing happening twice is one update. */
  key: string;
  applicationId?: string | null;
  dealId?: string | null;
  property: string;
  agentEmail: string | null;
  agentName: string | null;
  kind: string;
  headline: string;
  why?: string;
  recipients: Omit<UpdateRecipient, "state">[];
}

/**
 * Lands an update with the agent. Idempotent on `key`: a second call for the
 * same event returns null and does nothing. `tellAgent` false when the caller
 * already emails the agent about the same moment (the deal watcher does), so
 * nobody gets two emails for one thing.
 */
export async function createUpdate(u: NewUpdate, opts: { tellAgent?: boolean } = {}): Promise<CustomerUpdate | null> {
  if (!hasDb() || !u.recipients.length) return null;
  const rows = await q<Row>(
    `INSERT INTO os_customer_updates (key, application_id, deal_id, property, agent_email, agent_name, kind, headline, why, recipients)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     ON CONFLICT (key) DO NOTHING RETURNING *`,
    [
      u.key,
      u.applicationId ?? null,
      u.dealId ?? null,
      u.property,
      u.agentEmail,
      u.agentName,
      u.kind,
      u.headline,
      u.why ?? "",
      JSON.stringify(u.recipients.map((r) => ({ ...r, state: "open" }))),
    ]
  );
  if (!rows[0]) return null;
  const made = fromRow(rows[0]);
  if (opts.tellAgent !== false) await tellAgent(made, "new").catch(() => null);
  return made;
}

/* ───────────────────────────── reading ─────────────────────────────────── */

export async function getUpdate(id: number): Promise<CustomerUpdate | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(`SELECT * FROM os_customer_updates WHERE id = $1`, [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listUpdates(f: {
  applicationId?: string | null;
  dealId?: string | null;
  agentEmail?: string | null;
  openOnly?: boolean;
  limit?: number;
}): Promise<CustomerUpdate[]> {
  if (!hasDb()) return [];
  const where: string[] = [];
  const args: unknown[] = [];
  const ors: string[] = [];
  if (f.applicationId) {
    args.push(f.applicationId);
    ors.push(`application_id = $${args.length}`);
  }
  if (f.dealId) {
    args.push(f.dealId);
    ors.push(`deal_id = $${args.length}`);
  }
  if (ors.length) where.push(`(${ors.join(" OR ")})`);
  if (f.agentEmail) {
    args.push(f.agentEmail.toLowerCase());
    where.push(`LOWER(agent_email) = $${args.length}`);
  }
  if (f.openOnly) where.push(`state = 'open'`);
  args.push(Math.min(Math.max(f.limit ?? 100, 1), 300));
  const rows = await q<Row>(
    `SELECT * FROM os_customer_updates ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY (state = 'open') DESC, created_at DESC LIMIT $${args.length}`,
    args
  );
  return rows.map(fromRow);
}

/* ───────────────────────────── settling ────────────────────────────────── */

/**
 * One person on an update is dealt with. Locked row by row so an email going
 * and a call being logged at the same moment cannot both win.
 */
export async function settleRecipient(
  id: number,
  index: number,
  p: { state: Exclude<RecipientState, "open">; by: string; note?: string | null }
): Promise<CustomerUpdate | null> {
  if (!hasDb()) return null;
  const cur = await getUpdate(id);
  if (!cur || !cur.recipients[index]) return null;
  const recipients = cur.recipients.map((r, i) =>
    i === index ? { ...r, state: p.state, doneAt: new Date().toISOString(), doneBy: p.by, note: p.note?.trim() || null } : r
  );
  const done = recipients.every((r) => r.state !== "open");
  const rows = await q<Row>(
    `UPDATE os_customer_updates SET recipients = $2::jsonb, state = $3, done_at = CASE WHEN $3 = 'done' THEN NOW() ELSE NULL END
      WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(recipients), done ? "done" : "open"]
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

/* ───────────────────────────── the agent hears ─────────────────────────── */

export function updateLink(id: number): string {
  return `${SITE()}/applications/updates?open=${id}`;
}

function who(u: CustomerUpdate): string {
  const open = u.recipients.filter((r) => r.state === "open");
  return open.map((r) => `${r.name} (${r.role})`).join(" and ") || "nobody left";
}

/**
 * The agent's email: what happened, who should hear, and one button to the
 * update where Email them / I'll call / Not needed live. Internal only, and
 * behind the same switch as every other email the OS sends agents about a
 * deal ("Tell agents when Propoly moves a deal").
 */
export async function tellAgent(u: CustomerUpdate, why: "new" | "nudge"): Promise<boolean> {
  if (!u.agentEmail) return false;
  if (!(await switchOn("deal_watch_notify"))) return false;
  const subject = why === "nudge" ? `Still to tell: ${u.headline} - ${u.property}` : `Tell them: ${u.headline} - ${u.property}`;
  const intro =
    why === "nudge"
      ? `This has been waiting since ${new Date(u.createdAt).toLocaleString("en-GB", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" })}. Nothing has gone to them, and nothing will until you choose. If it is still open tomorrow morning it goes on Kirstie's list.`
      : `${u.headline}. Nothing has gone to them: you decide how they hear.`;
  const html = skyListShell({
    heading: u.property,
    intro,
    rows: [
      { title: "Who should hear", detail: who(u), tone: "good" },
      ...(u.why ? [{ title: "Worth knowing", detail: u.why, tone: "attention" as const }] : []),
      { title: "Your choice", detail: "Email them (already written, you can change it), ring them and note what was said, or mark it not needed.", tone: "good" },
    ],
    button: "Open the update",
    link: updateLink(u.id),
  });
  const text = [u.property, "", intro, "", `Who should hear: ${who(u)}`, u.why ? `Worth knowing: ${u.why}` : "", "", `Open the update: ${updateLink(u.id)}`]
    .filter((l) => l !== undefined)
    .join("\n");
  await sendEmail({ to: u.agentEmail, subject, html, text });
  await q(
    why === "nudge"
      ? `UPDATE os_customer_updates SET nudged_at = NOW() WHERE id = $1`
      : `UPDATE os_customer_updates SET notified_at = NOW() WHERE id = $1`,
    [u.id]
  );
  return true;
}

/* ─────────────────────────── nudge, then Kirstie ───────────────────────── */

const DAY_START = 9 * 60;
const DAY_END = 17 * 60 + 30;

/** Working minutes (Mon-Fri, 9:00-17:30 London) between two moments. */
export function workingMinutes(from: Date, to: Date): number {
  if (to <= from) return 0;
  let mins = 0;
  /* Walks in 15-minute steps: an update lives a day or two, so this is a few
     hundred steps at most, and it is exact about weekends and the clocks. */
  const step = 15 * 60_000;
  for (let t = from.getTime(); t < to.getTime(); t += step) {
    const p = londonParts(new Date(t));
    const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
    const m = p.hour * 60 + p.minute;
    if (dow >= 1 && dow <= 5 && m >= DAY_START && m < DAY_END) mins += 15;
  }
  return mins;
}

/** A working morning after the update was made has begun. */
function nextWorkingMorningPassed(created: Date, now: Date): boolean {
  const c = londonParts(created);
  const n = londonParts(now);
  const dow = new Date(Date.UTC(n.year, n.month - 1, n.day)).getUTCDay();
  const sameDay = c.year === n.year && c.month === n.month && c.day === n.day;
  return !sameDay && dow >= 1 && dow <= 5 && n.hour * 60 + n.minute >= DAY_START;
}

/**
 * Run from the five-minute scheduled-sends cron. Four working hours untouched
 * is a reminder to the agent; still untouched the working morning after that
 * reminder puts a row on Kirstie's feed. Each happens once per update.
 */
export async function runUpdateNudges(now = new Date()): Promise<{ nudged: number; escalated: number }> {
  if (!hasDb()) return { nudged: 0, escalated: 0 };
  const open = (await q<Row>(`SELECT * FROM os_customer_updates WHERE state = 'open' AND (nudged_at IS NULL OR escalated_at IS NULL) ORDER BY created_at LIMIT 200`)).map(fromRow);
  let nudged = 0;
  let escalated = 0;
  for (const u of open) {
    const created = new Date(u.createdAt);
    let nudgedAt = u.nudgedAt ? new Date(u.nudgedAt) : null;
    if (!nudgedAt && workingMinutes(created, now) >= 4 * 60) {
      if (await tellAgent(u, "nudge").catch(() => false)) nudged += 1;
      else await q(`UPDATE os_customer_updates SET nudged_at = $2 WHERE id = $1`, [u.id, now]);
      nudgedAt = now;
    }
    /* Kirstie hears the working morning AFTER the agent was reminded, so the
       agent always gets their reminder first - an update made at four on a
       Friday is not hers at nine on Monday. */
    if (!u.escalatedAt && nudgedAt && nextWorkingMorningPassed(nudgedAt, now)) {
      await q(
        `INSERT INTO os_deal_events (deal_id, property, agent_email, agent_name, event, from_status, to_status)
         VALUES ($1,$2,$3,$4,'update_untouched',NULL,$5)`,
        [`upd-${u.id}`, u.property, u.agentEmail, u.agentName, u.headline]
      );
      await q(`UPDATE os_customer_updates SET escalated_at = $2 WHERE id = $1`, [u.id, now]);
      escalated += 1;
    }
  }
  return { nudged, escalated };
}
