import "server-only";
import { hasDb, q } from "@/lib/db";
import { fetchLeadBook } from "@/lib/rex-leads";
import { allSpines } from "@/lib/lead-touches";
import { listAppraisals } from "@/lib/appraisal-store";
import { withLiveStages } from "@/lib/appraisal-stage";
import { presentationsFor } from "@/lib/present-store";
import { getApplications } from "@/lib/applications";
import { listCases } from "@/lib/plc-store";
import { outstandingTerms } from "@/lib/rex-esign";
import { rexConfigured } from "@/lib/rex";
import { whenAgo } from "@/lib/lead-spine";
import type { Notice } from "@/lib/notices";

/**
 * Smart reminders: what each person should do next, worked out from the
 * records rather than typed by anyone.
 *
 * James, 6 Sep 2026: "smart reminders based on what they're looking to do"
 * and "the agents are just receiving the notifications and that it actually
 * matters". So every reminder here is a thing the person can act on today,
 * on their own book, and each one clears itself the moment the record says
 * it is done - there is nothing to tick off and nothing to snooze.
 *
 * ── The five, and where each is read from ─────────────────────────────────
 *
 *   lead_quiet      a lead of theirs still at New, over a day old, nobody
 *                   has logged an attempt        REX leads + os_lead_touches
 *   deck_due        an appraisal within two days with no pre-appraisal
 *                   deck sent                    os_market_appraisals + os_presentations
 *   valuation_due   the visit has passed and no figure is recorded
 *                                                os_market_appraisals (live stage)
 *   plc_due         an application accepted two or more days ago with no
 *                   PLC pack started             REX applications + os_plc_cases
 *   terms_unsigned  terms of business sent three or more days ago, still
 *                   unsigned                     REX e-sign
 *
 * ── Whose is whose ────────────────────────────────────────────────────────
 *
 * Every source names the agent differently: a lead carries the assignee's
 * name, an application the agent's name, an appraisal a name or an email,
 * terms the sender's name. So a person is matched by NAME (case-insensitive)
 * or by email, against os_users. Somebody with no OS account gets nothing,
 * which is right - there is no bell to ring.
 *
 * ── Why a table and a schedule ────────────────────────────────────────────
 *
 * The bell polls once a minute. Working this out live would walk REX five
 * ways a minute per open tab. So a cron runs it (every ten minutes is
 * plenty), writes the rows, and the bell reads a table. The id is stable
 * per record, so a run refreshes a reminder in place and deletes the ones
 * whose condition has cleared - a reminder can never outlive its reason.
 */

export const REMINDER_KINDS = ["lead_quiet", "deck_due", "valuation_due", "plc_due", "terms_unsigned"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface Reminder {
  id: string;
  userId: string;
  kind: ReminderKind;
  title: string;
  body: string;
  href: string | null;
  tone: "warn" | "none";
  dueAt: string;
}

type Person = { id: string; name: string; email: string };

const DAY = 86400000;
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Everyone who could be reminded. */
async function people(): Promise<Person[]> {
  return q<Person>(`SELECT id, name, email FROM os_users`).catch(() => []);
}

/** The person a record names, by name or email. */
function whose(list: Person[], agent: string | null | undefined): Person | null {
  const a = norm(agent);
  if (!a) return null;
  return list.find((p) => norm(p.name) === a || norm(p.email) === a) ?? null;
}

/* ── the five ───────────────────────────────────────────────────────────── */

async function leadReminders(list: Person[], now: number): Promise<Reminder[]> {
  const [book, spines] = await Promise.all([fetchLeadBook(null), allSpines().catch(() => ({}))]);
  const out: Reminder[] = [];
  for (const l of book.leads) {
    if (l.stage !== "New" || !l.receivedAt) continue;
    const age = now - new Date(l.receivedAt).getTime();
    /* Over a day and under a fortnight: a lead nobody has touched in two
       weeks is not a reminder, it is a lead to close, and the list should
       not open every morning with the same dead names at the top. */
    if (age < DAY || age > 14 * DAY) continue;
    const spine = (spines as Record<string, { attempts: number; nurture: unknown; booked: boolean }>)[l.id];
    if (spine && (spine.attempts > 0 || spine.nurture || spine.booked)) continue;
    const who = whose(list, l.agent);
    if (!who) continue;
    out.push({
      id: `lead_quiet:${l.id}`,
      userId: who.id,
      kind: "lead_quiet",
      title: `Ring ${l.name === "(no name given)" ? "the new lead" : l.name}`,
      body: `${l.enquiry} enquiry via ${l.source}, in ${whenAgo(l.receivedAt, now)} - nobody has tried yet.`,
      href: `/leads?open=${encodeURIComponent(l.id)}`,
      tone: age > 3 * DAY ? "warn" : "none",
      dueAt: new Date(new Date(l.receivedAt).getTime() + DAY).toISOString(),
    });
  }
  return out;
}

async function appraisalReminders(list: Person[], now: number): Promise<Reminder[]> {
  const appraisals = await withLiveStages(await listAppraisals(), new Date(now));
  const out: Reminder[] = [];
  for (const ma of appraisals) {
    if (ma.stage === "won" || ma.stage === "lost" || !ma.appointmentAt) continue;
    const who = whose(list, ma.agent);
    if (!who) continue;
    const at = new Date(ma.appointmentAt).getTime();
    const href = `/market-appraisals/${encodeURIComponent(ma.id)}`;
    const when = new Date(ma.appointmentAt).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

    if (at > now && at - now <= 2 * DAY) {
      const sent = (await presentationsFor(ma.leadId ?? ma.id).catch(() => [])).some((p) => p.kind === "pre-appraisal");
      if (!sent) {
        out.push({
          id: `deck_due:${ma.id}`,
          userId: who.id,
          kind: "deck_due",
          title: `Send the pre-appraisal deck for ${ma.address}`,
          body: `${ma.landlord} is expecting you ${when}. Landlords open the deck before you arrive.`,
          href,
          tone: at - now <= DAY ? "warn" : "none",
          dueAt: new Date(at - 2 * DAY).toISOString(),
        });
      }
    }

    if (at < now - DAY && ma.valuation == null && (ma.stage === "appraisal" || ma.stage === "pre_appraisal" || ma.stage === "booked")) {
      out.push({
        id: `valuation_due:${ma.id}`,
        userId: who.id,
        kind: "valuation_due",
        title: `Record the valuation for ${ma.address}`,
        body: `You visited ${whenAgo(ma.appointmentAt, now)} and no figure is on the record. The post-appraisal deck waits on it.`,
        href,
        tone: "warn",
        dueAt: new Date(at + DAY).toISOString(),
      });
    }
  }
  return out;
}

async function plcReminders(list: Person[], now: number): Promise<Reminder[]> {
  const [apps, cases] = await Promise.all([getApplications(200, null), listCases().catch(() => [])]);
  const started = new Set(cases.map((c) => String(c.applicationRef)));
  const out: Reminder[] = [];
  for (const a of apps) {
    if (a.status !== "accepted" || !a.dateAccepted) continue;
    const at = new Date(a.dateAccepted).getTime();
    /* Two days to thirty: the PLC check moved into the OS on 5 Sep 2026, and
       an application accepted months before that had its pack done the old
       way. Reminding somebody to start one would be wrong twice. */
    if (!Number.isFinite(at) || now - at < 2 * DAY || now - at > 30 * DAY) continue;
    if (started.has(String(a.id))) continue;
    const who = whose(list, a.agent);
    if (!who) continue;
    const lead = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
    out.push({
      id: `plc_due:${a.id}`,
      userId: who.id,
      kind: "plc_due",
      title: `Start the PLC check for ${a.property}`,
      body: `${lead?.name ?? "The applicant"} was accepted ${whenAgo(a.dateAccepted, now)} and no pack has been started.${a.startDate ? ` Move-in ${a.startDate}.` : ""}`,
      href: `/applications?open=${encodeURIComponent(a.id)}`,
      tone: now - at > 5 * DAY ? "warn" : "none",
      dueAt: new Date(at + 2 * DAY).toISOString(),
    });
  }
  return out;
}

async function termsReminders(list: Person[], now: number): Promise<Reminder[]> {
  const rows = await outstandingTerms().catch(() => []);
  const out: Reminder[] = [];
  for (const t of rows) {
    /* Three days to sixty. Older than that is a landlord who went elsewhere,
       and the Outstanding terms list is the place for those. */
    if (t.age == null || t.age < 3 || t.age > 60 || !t.sentAt) continue;
    const who = whose(list, t.sentBy);
    if (!who) continue;
    const landlord = t.signers.find((s) => s.role.toLowerCase() !== "agent")?.name ?? "the landlord";
    out.push({
      id: `terms_unsigned:${t.id}`,
      userId: who.id,
      kind: "terms_unsigned",
      title: `Chase ${landlord}'s terms${t.address ? ` for ${t.address}` : ""}`,
      body: `Sent ${t.age} days ago and still unsigned. A property cannot go live without them.`,
      href: t.listingId ? `/listings?open=${t.listingId}` : "/market-appraisals",
      tone: t.age >= 7 ? "warn" : "none",
      dueAt: new Date(new Date(t.sentAt).getTime() + 3 * DAY).toISOString(),
    });
  }
  return out;
}

/* ── the run ────────────────────────────────────────────────────────────── */

export interface ReminderRun {
  ok: boolean;
  reason?: string;
  people: number;
  written: number;
  cleared: number;
  byKind: Record<string, number>;
  failed: string[];
}

/**
 * Work everything out and write it down. Each source is tried on its own,
 * so REX refusing one search does not blank the other four - and a source
 * that failed keeps its previous rows rather than deleting them on bad
 * information.
 */
export async function runReminders(now = Date.now()): Promise<ReminderRun> {
  const empty = { people: 0, written: 0, cleared: 0, byKind: {}, failed: [] };
  if (!hasDb()) return { ok: false, reason: "No database on this environment.", ...empty };
  if (!rexConfigured()) return { ok: false, reason: "REX isn't connected on this environment.", ...empty };

  const list = await people();
  const sources: { kinds: ReminderKind[]; run: () => Promise<Reminder[]> }[] = [
    { kinds: ["lead_quiet"], run: () => leadReminders(list, now) },
    { kinds: ["deck_due", "valuation_due"], run: () => appraisalReminders(list, now) },
    { kinds: ["plc_due"], run: () => plcReminders(list, now) },
    { kinds: ["terms_unsigned"], run: () => termsReminders(list, now) },
  ];

  const fresh: Reminder[] = [];
  const okKinds: ReminderKind[] = [];
  const failed: string[] = [];
  for (const s of sources) {
    try {
      fresh.push(...(await s.run()));
      okKinds.push(...s.kinds);
    } catch (e) {
      failed.push(`${s.kinds.join("/")}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  let written = 0;
  for (const r of fresh) {
    await q(
      `INSERT INTO os_reminders (id, user_id, kind, title, body, href, tone, due_at, refreshed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, id) DO UPDATE
         SET title = EXCLUDED.title, body = EXCLUDED.body, href = EXCLUDED.href,
             tone = EXCLUDED.tone, due_at = EXCLUDED.due_at, refreshed_at = NOW()`,
      [r.id, r.userId, r.kind, r.title, r.body, r.href, r.tone, r.dueAt]
    );
    written += 1;
  }

  /* Cleared: anything of a kind that ran successfully and was not written
     this time round. Its reason has gone - the lead was rung, the deck went,
     the figure is in - so the reminder goes with it. */
  let cleared = 0;
  if (okKinds.length) {
    const keepUsers = fresh.map((r) => r.userId);
    const keepIds = fresh.map((r) => r.id);
    const rows = await q<{ n: string }>(
      `WITH keep AS (
         SELECT unnest($2::text[]) AS user_id, unnest($3::text[]) AS id
       ), gone AS (
         DELETE FROM os_reminders r
          WHERE r.kind = ANY($1::text[])
            AND NOT EXISTS (SELECT 1 FROM keep k WHERE k.user_id = r.user_id AND k.id = r.id)
          RETURNING 1
       ) SELECT count(*)::text AS n FROM gone`,
      [okKinds, keepUsers, keepIds]
    );
    cleared = Number(rows[0]?.n ?? 0);
  }

  const byKind: Record<string, number> = {};
  for (const r of fresh) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  return {
    ok: failed.length < sources.length,
    reason: failed.length ? "Some sources failed - see failed." : undefined,
    people: list.length,
    written,
    cleared,
    byKind,
    failed,
  };
}

/**
 * A person's reminders, as bell notices.
 *
 * Timed by when the reminder FIRST APPEARED, not by when the thing fell due:
 * the bell counts "newer than you last looked" as unread, and a lead that
 * went quiet three days ago is still news the morning the reminder is
 * raised. The body carries the age ("in 4 days ago").
 */
export async function remindersFor(userId: string, limit = 40): Promise<Notice[]> {
  if (!hasDb()) return [];
  const rows = await q<{ id: string; kind: string; title: string; body: string; href: string | null; tone: string; first_seen_at: Date }>(
    `SELECT id, kind, title, body, href, tone, first_seen_at FROM os_reminders WHERE user_id = $1 ORDER BY first_seen_at DESC LIMIT $2`,
    [userId, limit]
  ).catch(() => []);
  return rows.map((r) => ({
    id: `reminder:${r.id}`,
    kind: "reminder" as const,
    at: new Date(r.first_seen_at).toISOString(),
    title: r.title,
    body: r.body,
    href: r.href,
    tone: r.tone === "warn" ? "warn" : "none",
  }));
}
