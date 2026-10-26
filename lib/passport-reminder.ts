import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { EMPTY_PASSPORT, answered, sectionsFor, type PassportData, type PassportRules } from "@/lib/passport-shape";
import { findDonePassportByEmail, getPassport, type PassportRecord } from "@/lib/passport";
import { passportRules } from "@/lib/passport-scotland";
import { escapeHtml, renderTleEmailLive } from "@/lib/email/tle-emails";
import { switchOn } from "@/lib/switches";
import { findUserById } from "@/lib/users";
import { firstName, logDone, validEmail } from "@/lib/tenant-email-send";

/**
 * THE PASSPORT REMINDER (James, 22 Oct 2026): "if someone starts filling out
 * their passport and doesn't quite fill it out, can we please send them a
 * reminder email after 24 hours."
 *
 * One email, tenant-passport-reminder, on two paths:
 *
 *   started   Anybody who has typed into their passport and stopped, however
 *             it reached them (Send passports, the bulk send, an offer link,
 *             the application form, Automate passport). Queued here by the
 *             sweep, due 24 hours after they last typed. ref "started:<token>".
 *   automate  Automate passport's day-later reminder (lib/auto-passport),
 *             typed into or not. ref "<listingId>:<token>".
 *
 * Both wait in os_scheduled_sends and go through its runner as the agent.
 * Before one goes, reminderVerdict() asks again: finished (here or with any
 * agent), their enquiry closed, their application over, or the switch off,
 * and it is cancelled; typed in since it was queued, and it moves to 24
 * hours after that. Finishing cancels it on the spot (submitPassport).
 *
 * Dan Richards, 21 Oct 2026: encouraging, never pushy. The words are
 * rendered when it goes, from where they stopped then, so the share code line
 * only appears for somebody still stuck on the share code - the step most
 * people stop at (lib/passport-funnel notes, 9 Oct).
 *
 * At most two per passport. The second only if they came back after the
 * first, typed, and stopped again, and never within three days of the first.
 * Each send is written to os_tenant_email_log.
 */

export const PASSPORT_REMINDER_KIND = "passport-reminder";
const EMAIL_ID = "tenant-passport-reminder";
const AFTER_HOURS = 24;
/** A second reminder waits at least this long after the first. */
const SECOND_AFTER_DAYS = 3;
const MOST = 2;
/** Started longer ago than this and still untouched: they have moved on. */
const LOOK_BACK_DAYS = 30;

/** What a queued row keeps: the blanks the words are filled from when it goes. */
export type ReminderVars = { firstName: string; address: string; agentName: string; link: string };

const tokenOf = (ref: string) => ref.slice(ref.indexOf(":") + 1);
const isStartedRef = (ref: string) => ref.startsWith("started:");

/** "Flat 3/6, 59 Fairley Street, Glasgow G51 2SN" -> "Flat 3/6, 59 Fairley Street". */
function shortHome(address: string): string {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(", ") : parts[0] ?? "";
}

/** Typed something beyond the name and email the invite seeds (lib/passport-states). */
function hasStarted(d: PassportData, rules: PassportRules): boolean {
  const seeded = answered({ ...EMPTY_PASSPORT, legalName: d.legalName, email: d.email }, rules).done;
  return answered(d, rules).done > seeded;
}

/** Stuck on the share code: said they have no British or Irish passport, and gave none. */
function stuckOnShareCode(d: PassportData, rules: PassportRules): boolean {
  const first = sectionsFor(rules).find((s) => !s.done(d, rules));
  return first?.key === "right-to-rent" && d.hasBritishPassport === false && !d.shareCode.trim();
}

/** The link straight back in: the form opens at the first page still to answer. */
function resumeLink(link: string): string {
  return link.includes("?") ? link : `${link}?at=resume`;
}

/** The finished email, from where the passport has got to now. */
async function render(vars: ReminderVars, rec: PassportRecord | null, opts: { application?: boolean } = {}) {
  const rules = rec ? await passportRules(rec).catch(() => ({})) : {};
  const d = rec?.data ?? EMPTY_PASSPORT;
  const started = rec ? hasStarted(d, rules) : true;
  const home = shortHome(vars.address === "the home" ? "" : vars.address);
  const thanks = home ? `Thanks again for asking about ${escapeHtml(home)}. ` : "";
  return renderTleEmailLive(EMAIL_ID, {
    ...vars,
    introLine: started
      ? `${thanks}You've made a great start on your tenant passport, and everything you've filled in so far is saved.`
      : `${thanks}We'd love to get your viewing booked in, and the only thing we need first is your tenant passport.`,
    nextLine: opts.application
      ? "Finish it, and your application can go straight to the landlord."
      : "Finish it, and all that's left is to pick a date and time for your viewing that suits you.",
    whereLine: rec && stuckOnShareCode(d, rules)
      ? `You stopped at your share code. If you don't have one yet, you can get it in a few minutes at <a href="https://www.gov.uk/prove-right-to-rent" style="color:inherit;">gov.uk/prove-right-to-rent</a>, then just pop it in.`
      : "",
    buttonLabel: started ? "Pick up where I left off" : "Start my passport",
    link: resumeLink(vars.link),
  });
}

/* ── Is their search over? ──────────────────────────────────────────────── */

type BoardApp = { id: string; status: string; osDecision?: { decision: string } | null; applicants?: { email: string | null }[] };
let board: { at: number; byEmail: Map<string, { open: boolean; why: string }[]> } | null = null;

/**
 * Their applications, from the Applications board's own held copy in
 * os_cache - never a REX read of our own, so a REX outage cannot stop or
 * start reminders. Closed is the board's own reason (moved in, home let,
 * listing withdrawn, deal cancelled); unsuccessful and declined are over too.
 */
async function applicationsByEmail(): Promise<Map<string, { open: boolean; why: string }[]>> {
  if (board && Date.now() - board.at < 60_000) return board.byEmail;
  const byEmail = new Map<string, { open: boolean; why: string }[]>();
  const rows = await q<{ payload: { applications?: BoardApp[]; closed?: [string, string][] } }>(
    `SELECT payload FROM os_cache WHERE key = 'applications:assembled:v1:all'`
  ).catch(() => []);
  const closed = new Map(rows[0]?.payload?.closed ?? []);
  for (const a of rows[0]?.payload?.applications ?? []) {
    const why = closed.get(a.id) ?? (a.status === "unsuccessful" ? "unsuccessful" : a.osDecision?.decision === "declined" ? "declined" : "");
    for (const p of a.applicants ?? []) {
      const e = (p.email ?? "").trim().toLowerCase();
      if (!e) continue;
      const list = byEmail.get(e) ?? [];
      list.push({ open: !why, why });
      byEmail.set(e, list);
    }
  }
  board = { at: Date.now(), byEmail };
  return byEmail;
}

/**
 * Why they should not be reminded, or null. Withdrawn: every enquiry of
 * theirs closed or removed by hand. On a let that is closed: they have
 * applications and none is still open.
 */
async function searchOver(email: string): Promise<{ over: string | null; application: boolean }> {
  const leads = await q<{ stage: string | null; hidden: boolean }>(
    `SELECT l.stage, (h.id IS NOT NULL) AS hidden
       FROM os_leads l LEFT JOIN os_hidden_leads h ON h.id = l.id
      WHERE lower(l.email) = lower($1)`,
    [email]
  );
  if (leads.length && leads.every((l) => l.stage === "Closed" || l.hidden)) {
    return { over: "Their enquiry has been closed, so it was not sent.", application: false };
  }
  const apps = (await applicationsByEmail()).get(email.trim().toLowerCase()) ?? [];
  if (apps.length && apps.every((a) => !a.open)) {
    return { over: `Their application is over (${apps[0].why.toLowerCase()}), so it was not sent.`, application: true };
  }
  return { over: null, application: apps.length > 0 };
}

/* ── The runner's side ─────────────────────────────────────────────────── */

export type Verdict = { cancel: string } | { later: Date } | null;

/** Should a queued reminder go now? Null when it should. */
export async function reminderVerdict(ref: string, toEmail: string): Promise<Verdict> {
  const token = tokenOf(ref);
  if (isStartedRef(ref)) {
    if (!(await switchOn("passport_reminder"))) return { cancel: "The Passport reminder switch is off, so it was not sent." };
  } else {
    const on = await q(`SELECT 1 FROM os_listing_auto_passport WHERE listing_id = $1`, [ref.slice(0, ref.indexOf(":"))]);
    if (!on.length) return { cancel: "Automate passport is off on this listing now, so it was not sent." };
  }
  const rows = await q<{ email: string; submitted_at: Date | null; updated_at: Date }>(
    `SELECT email, submitted_at, updated_at FROM os_tenant_passports WHERE token = $1`,
    [token]
  );
  const p = rows[0];
  if (!p) return { cancel: "The passport no longer exists, so it was not sent." };
  if (p.submitted_at) return { cancel: "They finished their passport before this was due, so it was not sent." };
  const email = (p.email || toEmail).trim();
  if (await findDonePassportByEmail(email).catch(() => null)) return { cancel: "They have a finished passport already, so it was not sent." };
  const { over } = await searchOver(email);
  if (over) return { cancel: over };
  /* Typed in since it was queued: a day after that instead. */
  const due = new Date(p.updated_at).getTime() + AFTER_HOURS * 3600_000;
  if (due > Date.now() + 60_000) return { later: new Date(due) };
  return null;
}

/** The email for a row that is going now. */
export async function reminderMail(row: { ref: string; body: string }): Promise<{ subject: string; html: string }> {
  const rec = await getPassport(tokenOf(row.ref)).catch(() => null);
  const { application } = rec ? await searchOver(rec.email).catch(() => ({ application: false })) : { application: false };
  return render(JSON.parse(row.body) as ReminderVars, rec, { application });
}

/** Sent: written down with the other tenant emails. */
export async function logReminderSent(row: { id: string; ref: string; to_email: string }, detail: string): Promise<void> {
  await logDone(`passport-reminder:${tokenOf(row.ref)}:${row.id}`, EMAIL_ID, row.to_email, "sent", detail, { ref: row.ref }).catch(() => null);
}

/** Finished: nothing still waiting for this passport, or this person, goes. */
export async function cancelPassportReminders(token: string, email: string): Promise<void> {
  if (!hasDb()) return;
  await q(
    `UPDATE os_scheduled_sends SET state = 'cancelled', error = 'They finished their passport, so it was not sent.'
      WHERE kind = $1 AND state = 'queued'
        AND (split_part(ref, ':', 2) = $2 OR ($3 <> '' AND lower(to_email) = lower($3)))`,
    [PASSPORT_REMINDER_KIND, token, email.trim()]
  ).catch(() => null);
}

/* ── Queuing the started ones ──────────────────────────────────────────── */

export type StartedResult = { token: string; to: string; state: "queued" | "skipped"; detail: string; sendAt?: string };

type Candidate = {
  token: string; name: string; email: string; agent_id: string | null; contact_id: string | null;
  data: Partial<PassportData> | null; updated_at: Date; scottish_home: boolean;
};

/**
 * Every started, unfinished passport without a reminder waiting gets one,
 * due 24 hours after they last typed (or now, for one already past that).
 * Run on every scheduled-sends tick; `dry` says what it would queue.
 */
export async function startedReminderSweep(origin: string, opts: { dry?: boolean } = {}): Promise<StartedResult[]> {
  const out: StartedResult[] = [];
  if (!hasDb()) return out;
  if (!opts.dry && !((await switchOn("passport_reminder")) && (await switchOn("customer_email")))) return out;

  /* Typed into since the invite (or never invited, so typed into from an
     offer or the application form), in the last month, and nothing waiting. */
  const rows = await q<Candidate>(
    `SELECT token, name, email, agent_id, contact_id, data, updated_at, scottish_home
       FROM os_tenant_passports p
      WHERE submitted_at IS NULL
        AND COALESCE(contact_id, '') <> 'demo'
        AND email <> ''
        AND updated_at > NOW() - make_interval(days => $1)
        AND (invited_at IS NULL OR updated_at > invited_at + interval '10 seconds')
        AND NOT EXISTS (
          SELECT 1 FROM os_scheduled_sends s
           WHERE s.kind = $2 AND s.state IN ('queued', 'sending') AND split_part(s.ref, ':', 2) = p.token)
      ORDER BY updated_at`,
    [LOOK_BACK_DAYS, PASSPORT_REMINDER_KIND]
  );

  for (const r of rows) {
    const to = r.email.trim();
    const skip = (detail: string) => out.push({ token: r.token, to, state: "skipped", detail });
    const d = { ...EMPTY_PASSPORT, ...(r.data ?? {}) } as PassportData;
    const rules = await passportRules({ agentId: r.agent_id, scottishHome: r.scottish_home }).catch(() => ({}));
    if (!hasStarted(d, rules)) continue;
    if (!validEmail(to)) { skip("No usable email address."); continue; }
    if (await findDonePassportByEmail(to).catch(() => null)) { skip("They have a finished passport already."); continue; }

    /* What has gone before, for this passport, on either path. */
    const before = await q<{ state: string; sent_at: Date | null; created_at: Date }>(
      `SELECT state, sent_at, created_at FROM os_scheduled_sends
        WHERE kind = $1 AND split_part(ref, ':', 2) = $2 ORDER BY created_at`,
      [PASSPORT_REMINDER_KIND, r.token]
    );
    const sent = before.filter((b) => b.state === "sent" && b.sent_at);
    const last = before[before.length - 1];
    const touched = new Date(r.updated_at).getTime();
    if (sent.length >= MOST) continue;
    /* One that was stopped (switch, a closed enquiry, too late) is not tried
       again unless they have come back and typed since. */
    if (last && last.state !== "sent" && touched <= new Date(last.created_at).getTime()) continue;
    /* The second: only once they have come back after the first. */
    if (sent.length === 1 && touched <= new Date(sent[0].sent_at!).getTime()) continue;

    const { over } = await searchOver(to);
    if (over) { skip(over); continue; }
    const me = r.agent_id ? await findUserById(r.agent_id).catch(() => null) : null;
    if (!me || me.locked) { skip("The agent who sent it is no longer here, so nothing goes in their name."); continue; }

    const sendAt = new Date(Math.max(
      touched + AFTER_HOURS * 3600_000,
      sent.length ? new Date(sent[0].sent_at!).getTime() + SECOND_AFTER_DAYS * 86400_000 : 0,
      Date.now()
    ));
    const lead = await q<{ address: string | null }>(
      `SELECT address FROM os_leads WHERE lower(email) = lower($1) AND COALESCE(address, '') <> ''
        ORDER BY COALESCE(received_at, first_seen) DESC LIMIT 1`,
      [to]
    ).catch(() => []);
    const vars: ReminderVars = {
      firstName: firstName(r.name),
      address: lead[0]?.address ?? "",
      agentName: me.name || "The Letting Experts",
      link: `${origin}/tenant/passport/${r.token}`,
    };
    if (!opts.dry) {
      const { subject } = await renderTleEmailLive(EMAIL_ID, {});
      await q(
        `INSERT INTO os_scheduled_sends (id, kind, ref, to_email, subject, body, send_at, queued_by, queued_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [randomBytes(9).toString("base64url"), PASSPORT_REMINDER_KIND, `started:${r.token}`, to, subject, JSON.stringify(vars), sendAt, me.name || me.email, me.id]
      );
    }
    out.push({ token: r.token, to, state: "queued", detail: sent.length ? "Second reminder." : "First reminder.", sendAt: sendAt.toISOString() });
  }
  return out;
}

/* ── Previews ──────────────────────────────────────────────────────────── */

/** The reminder as a tenant would get it, for the screens that show it. */
export async function reminderPreview(p: { agentName: string; home: string; origin: string; stoppedAt?: "share-code" | "started" | "not-started" }) {
  const stop = p.stoppedAt ?? "started";
  const data: PassportData = {
    ...EMPTY_PASSPORT,
    legalName: "Sophie Turner",
    email: "sophie@example.com",
    ...(stop === "not-started" ? {} : { dob: "1996-04-12", nationality: "Irish", mobile: "07700 900123" }),
    ...(stop === "share-code" ? { hasBritishPassport: false } : stop === "started" ? { hasBritishPassport: true } : {}),
  };
  const rec = { token: "preview", contactId: null, agentId: null, name: "Sophie Turner", email: data.email, data, createdAt: "", updatedAt: "", submittedAt: null, scottishHome: false } satisfies PassportRecord;
  return render({ firstName: "Sophie", address: p.home, agentName: p.agentName, link: `${p.origin}/tenant/passport/your-own-link` }, rec);
}
