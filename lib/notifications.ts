import "server-only";
import { hasDb, q } from "@/lib/db";
import { can } from "@/lib/roles";
import type { OsUser } from "@/lib/users";
import { listDealEvents } from "@/lib/business/deal-watch";
import { eventSentence, eventTone, hrefFor, type DealEventKind } from "@/lib/business/deal-events";
import type { Notice } from "@/lib/notices";
import { remindersFor } from "@/lib/reminders";
import { queriesFor, verifyQueue, worksToCheck } from "@/lib/compliance-desk";
import { followUpsDue } from "@/lib/id-checks";
import { newLeadsFor } from "@/lib/lead-ledger";
import { newBookingsFor } from "@/lib/rex-viewings";
import { decisionsFor, waitingOnDesk } from "@/lib/section-notices";
import { SPECS, STATUS_LABEL } from "@/lib/section-notices-spec";

/**
 * What the bell shows, gathered from the tables where things already happen.
 *
 * ── No notifications table ────────────────────────────────────────────────
 *
 * Every event worth telling somebody about is already a row somewhere: the
 * watcher writes deal moves and money, the PLC route writes decisions into
 * the same table, the scheduler writes the steps that need a person, the
 * handover writes its runs, the chaser writes what it sent. A second table
 * of "notifications" would be a copy that could disagree with its source.
 * So this reads the sources, scoped to the person, and sorts by time.
 *
 * ── Who sees what ─────────────────────────────────────────────────────────
 *
 *   deal moves, money, PLC   the deal's agent (matched on email, as the
 *                            feed does), or the whole book for anyone with
 *                            see:pretenancy or see:everything
 *   campaign steps for a     see:marketing or an owner - a call step is a job
 *   person                   for the office, not for a lead's agent
 *   handover runs            owners and pre-tenancy, who own the process -
 *                            LIVE runs only. Rehearsals are a log for James
 *                            (Admin), not news for anyone (James, 7 Sep 2026)
 *   chases                   NOT here. The chase email already carries the
 *                            same line; a second copy in the bell was noise
 *                            (James, 7 Sep 2026)
 *   reminders                the person alone - worked out from their own
 *                            book by lib/reminders, never anybody else's
 *   a document compliance    the agent it was emailed to (4 Oct 2026), until
 *   queried                  it is put right or 30 days pass
 *   new enquiries            the agent the lead is for: tenant enquiries,
 *                            viewing requests and landlord leads (5 Oct
 *                            2026), the last three days. Owners also get
 *                            every landlord lead (lib/lead-ledger newLeadsFor)
 *   viewings booked          the agent whose diary it is in, when somebody
 *                            else booked it; owners, every new one (lib/rex-
 *                            viewings newBookingsFor, 5 Oct 2026)
 *   section notices          a Section 13 or 8 submitted: the desk, until he
 *                            decides it. His decision: the agent who sent it,
 *                            for a fortnight (7 Oct 2026)
 *   documents to verify,     the compliance role alone (Michael, 20 Sep 2026:
 *   finished works orders    "he needs to also be notified"). Read from his
 *                            own two lists, so a notice goes when he ticks the
 *                            thing off. Not owners: James and Susan can open
 *                            his desk, and neither wants a ping per upload
 *
 * ── Read state ────────────────────────────────────────────────────────────
 *
 * One timestamp per person in os_user_prefs ("notifications.seen_at").
 * Unread = newer than that. Marking read is one write, and nothing about a
 * notice itself changes.
 */

/** A tenant asking to see the home, in the words portals and people use. */
const WANTS_VIEWING = /\b(arrange|book|request|requesting|organise|schedule)\s+(a\s+)?view(ing)?\b|\binterested in viewing\b|\b(like|love|want|keen) to (view|see)\b|\bcan i (view|see)\b|\bavailable (for|to) (a )?view|\bbook a viewing\b/i;

const MONEY: DealEventKind[] = ["holding_in", "holding_reconciled", "deposit_in", "deposit_reconciled", "deposit_registered", "rent_in"];
const PLC: DealEventKind[] = ["plc_submitted", "plc_checked", "plc_decided", "plc_opened", "move_in_ready"];

function kindOf(e: DealEventKind): Notice["kind"] {
  if (MONEY.includes(e)) return "money";
  if (PLC.includes(e)) return "plc";
  return "deal";
}

export async function noticesFor(me: OsUser, limit = 40): Promise<Notice[]> {
  if (!hasDb()) return [];
  const whole = can(me.role, "see:pretenancy") || can(me.role, "see:everything");
  const office = can(me.role, "see:marketing") || me.role === "owner";
  const ops = me.role === "owner" || can(me.role, "see:pretenancy");

  /* The office covers for each other (James, 30 Sep 2026): Kirstie gets the
     desk's notices as well as Michael and Josel. */
  const desk = me.role === "compliance" || me.role === "pretenancy";

  const [deals, steps, handovers, reminders, toVerify, toCheck, sections, decided] = await Promise.all([
    listDealEvents({ agentEmail: whole ? null : me.email, limit }).catch(() => []),
    office
      ? q<{ id: string; campaign_id: string; subject: string; detail: string; at: Date; name: string }>(
          `SELECT s.id, s.campaign_id, s.subject, s.detail, s.at, e.name
             FROM os_campaign_sends s
             LEFT JOIN os_campaign_enrolments e ON e.id = s.enrolment_id
            WHERE s.outcome = 'for_human'
            ORDER BY s.at DESC LIMIT $1`,
          [limit]
        ).catch(() => [])
      : [],
    ops
      ? q<{ id: string; application_id: string; status: string; mode: string; finished_at: Date; error: string | null; steps: unknown }>(
          `SELECT id, application_id, status, mode, finished_at, error, steps
             FROM os_handovers WHERE finished_at IS NOT NULL AND mode <> 'shadow'
            ORDER BY finished_at DESC LIMIT $1`,
          [limit]
        ).catch(() => [])
      : [],
    remindersFor(me.id, limit).catch(() => []),
    desk ? verifyQueue().catch(() => []) : [],
    desk ? worksToCheck().catch(() => []) : [],
    desk ? waitingOnDesk().catch(() => []) : [],
    decisionsFor(me.email).catch(() => []),
  ]);

  /* An appraisal somebody else booked for you: the pre-presentation goes in
     two hours unless you record a video or send it first (lib/pre-send, 1 Oct
     2026). Read from the note we sent them, so the bell and the email say the
     same thing. A week is plenty - by then the visit has been. */
  const preHeadsUp = await q<{ id: string; ref: string; subject: string; body: string; created_at: Date }>(
    `SELECT id, ref, subject, body, created_at FROM os_scheduled_sends
      WHERE kind = 'pre-heads-up' AND LOWER(to_email) = LOWER($1) AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC LIMIT 10`,
    [me.email]
  ).catch(() => []);

  /* Their own open tasks (2 Oct 2026): anything Steve or a colleague put on
     their list, and anything of theirs due by tomorrow. Read from os_tasks,
     so it leaves the bell the moment it is ticked. */
  const tasks = await q<{ id: string; title: string; detail: string; due_at: Date | null; created_at: Date; created_by: string; kind: string }>(
    `SELECT id, title, detail, due_at, created_at, created_by, kind FROM os_tasks
      WHERE user_id = $1 AND done_at IS NULL
        AND (kind = 'steve' OR (due_at IS NOT NULL AND due_at < NOW() + INTERVAL '1 day'))
      ORDER BY COALESCE(due_at, created_at) ASC LIMIT 20`,
    [me.id]
  ).catch(() => []);

  /* What Steve's standing jobs reported (lib/steve-jobs, 2 Oct 2026). Opens
     his chat, where the whole report is. */
  const { runsFor } = await import("@/lib/steve-jobs");
  const jobRuns = await runsFor(me.id, 3).catch(() => []);

  /* A document compliance queried, on a home of yours (4 Oct 2026). */
  const queried = await queriesFor(me.id).catch(() => []);

  /* Right to Rent follow-up checks owed inside four weeks (4 Oct 2026): the office. */
  const rtrDue = desk ? await followUpsDue(28).catch(() => []) : [];

  /* Agreed works not done, inside a week of move day (Michael, 29 Sep 2026):
     the office, who run the move-in. */
  const prepDue = desk
    ? await q<{ id: string; property: string; title: string; due_on: Date | string | null; created_at: Date }>(
        `SELECT id, property, title, due_on, created_at FROM os_landlord_prep
          WHERE done_at IS NULL AND due_on IS NOT NULL AND due_on <= (NOW() AT TIME ZONE 'Europe/London')::date + 7
          ORDER BY due_on LIMIT 20`
      ).catch(() => [])
    : [];

  const owner = me.role === "owner" || can(me.role, "see:everything");
  /* New enquiries (5 Oct 2026), so a viewing request reaches the agent's
     phone while the tenant is still on Rightmove. */
  const leads = await newLeadsFor({
    rexUserId: me.rexUserId,
    email: me.email,
    allLandlords: owner,
  }).catch(() => []);

  const booked = owner || me.name?.trim() ? await newBookingsFor({ name: me.name ?? "", everyone: owner }).catch(() => []) : [];

  const out: Notice[] = [...reminders];
  for (const b of booked) {
    const when = new Date(b.startsAt).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const mine = b.agent.toLowerCase() === (me.name ?? "").toLowerCase();
    out.push({
      id: `booked:${b.id}`,
      kind: "lead",
      at: b.at,
      title: `Viewing booked${b.who ? `: ${b.who}` : ""}`,
      body: [
        `${b.address || "A home"}, ${when}.`,
        mine ? null : b.agent ? `With ${b.agent}.` : null,
        b.bookedBy && b.bookedBy.toLowerCase() !== b.agent.toLowerCase() ? `Booked by ${b.bookedBy}.` : null,
      ].filter(Boolean).join(" "),
      href: "/viewings",
      tone: "none",
    });
  }
  for (const l of leads) {
    const who = l.name && l.name !== "(no name given)" ? l.name : null;
    const where = l.address && l.address !== "—" ? l.address : null;
    const viewing = !l.landlord && WANTS_VIEWING.test(l.words) && !/cancel/i.test(l.words);
    const sort = l.landlord ? "landlord" : viewing ? "viewing" : "tenant";
    out.push({
      id: `lead:${sort}:${l.id}`,
      kind: "lead",
      at: l.at,
      title: l.landlord ? `New landlord lead${who ? `: ${who}` : ""}` : viewing ? `Viewing request${who ? `: ${who}` : ""}` : `New enquiry${who ? `: ${who}` : ""}`,
      body: l.landlord
        ? `${where ?? "A valuation request"}, via ${l.source}.`
        : `${viewing ? "Wants to view" : "Asked about"} ${where ?? "one of your homes"}, via ${l.source}.`,
      href: l.id.startsWith("tenant-area:") ? "/leads" : `/leads?open=${encodeURIComponent(l.id)}`,
      tone: viewing || l.landlord ? "warn" : "none",
    });
  }
  for (const c of rtrDue) {
    const days = Math.round((new Date(`${c.followUpOn}T00:00:00`).getTime() - Date.now()) / 86_400_000);
    out.push({
      id: `rtr:${c.id}`,
      kind: "reminder",
      at: c.at,
      title: c.name,
      body: `Right to Rent follow-up check ${days < 0 ? `was due ${-days} day${days === -1 ? "" : "s"} ago` : days <= 0 ? "is due today" : `is due in ${days} day${days === 1 ? "" : "s"}`}${c.property ? ` (${c.property})` : ""}.`,
      href: me.role === "compliance" ? "/compliance-desk/id-checks" : "/pre-tenancy/id-checks",
      tone: "warn",
    });
  }
  for (const x of prepDue) {
    const due = new Date(x.due_on as string);
    const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
    out.push({
      id: `prep:${x.id}`,
      kind: "reminder",
      at: new Date(x.created_at).toISOString(),
      title: x.property,
      body: `Agreed before moving in and not done yet: ${x.title}. Move day ${days < 0 ? "has passed" : days === 0 ? "is today" : `is in ${days} day${days === 1 ? "" : "s"}`}.`,
      href: "/pre-tenancy",
      tone: "warn",
    });
  }
  for (const x of queried) {
    out.push({
      id: `queried:${x.kind}:${x.id}`,
      kind: "compliance",
      at: x.at,
      title: x.property,
      body: `${x.by || "Compliance"} queried the ${x.what}: ${x.note}`,
      href: x.link,
      tone: "warn",
    });
  }
  for (const r of jobRuns) {
    out.push({
      id: `steve-job:${r.id}`,
      kind: "steve",
      at: r.at,
      title: `Steve: ${r.title}`,
      body: r.text.replace(/\s+/g, " ").slice(0, 180),
      href: "/dashboard?steve=chat",
      tone: r.ok ? "none" : "warn",
    });
  }
  for (const t of tasks) {
    const overdue = t.due_at && new Date(t.due_at).getTime() < Date.now();
    out.push({
      id: `task:${t.id}`,
      kind: "reminder",
      at: new Date(t.created_at).toISOString(),
      title: overdue ? `Overdue: ${t.title}` : t.title,
      body: [t.detail, t.created_by && t.created_by !== me.name ? `From ${t.created_by}` : null].filter(Boolean).join(" · ") || "On your task list",
      href: "/dashboard?steve=tasks",
      tone: overdue ? "warn" : "none",
    });
  }
  for (const p of preHeadsUp) {
    out.push({
      id: `pre:${p.id}`,
      kind: "chase",
      at: new Date(p.created_at).toISOString(),
      title: "Pre-presentation booked for you",
      body: p.body,
      href: `/record/${encodeURIComponent(p.ref)}`,
      tone: "warn",
    });
  }

  for (const e of deals) {
    out.push({
      id: `deal:${e.id}`,
      kind: kindOf(e.event),
      at: e.at,
      title: e.property || "A deal",
      body: eventSentence(e),
      /* An agent's bell used to send them to Kirstie's workspace for their
         own pack and bounce (18 Sep sweep, item 10): a pack event opens the
         agent's wizard for them, the queue for pre-tenancy and the office. */
      href: me.role === "agent" && (e.event === "plc_submitted" || e.event === "plc_decided")
        ? `/plc/start?application=${encodeURIComponent(e.dealId.replace(/^plc-/, ""))}`
        : hrefFor(e),
      tone: eventTone(e.event),
    });
  }
  for (const s of steps) {
    out.push({
      id: `campaign:${s.id}`,
      kind: "campaign",
      at: new Date(s.at).toISOString(),
      title: s.name || "A landlord on a campaign",
      body: `Needs a person: ${s.subject}${s.detail ? ` - ${s.detail}` : ""}`,
      href: "/marketing",
      tone: "warn",
    });
  }
  for (const h of handovers) {
    /* A failed run keeps its reason on the step that failed, not in the
       error column, so the line says which step and why. */
    const steps = Array.isArray(h.steps) ? (h.steps as { label?: string; state?: string; detail?: string }[]) : [];
    const stuck = steps.find((st) => st.state === "failed" || st.state === "blocked");
    const why = h.error ?? (stuck ? `${stuck.label ?? "A step"}: ${stuck.detail ?? "failed"}` : null);
    out.push({
      id: `handover:${h.id}`,
      kind: "handover",
      at: new Date(h.finished_at).toISOString(),
      title: `Handover ${h.status}${h.mode === "shadow" ? " (rehearsal)" : ""}`,
      body: why ? `Application ${h.application_id}. ${why}` : `Application ${h.application_id}${h.status === "ok" ? " went through every step." : "."}`,
      href: `/applications?open=${encodeURIComponent(h.application_id)}`,
      tone: h.status === "ok" ? "ok" : "warn",
    });
  }
  for (const v of toVerify) {
    out.push({
      id: `verify:${v.kind}:${v.id}`,
      kind: "compliance",
      at: v.addedAt,
      title: v.property,
      body: `${v.what} ${v.door === "Landlord" ? `uploaded by ${v.by}` : `filed by ${v.by || "somebody"}`} (${v.door.toLowerCase()}). Waiting for you to verify.`,
      href: "/compliance-desk/verify",
      tone: "warn",
    });
  }
  for (const o of toCheck) {
    out.push({
      id: `works:${o.id}`,
      kind: "compliance",
      at: o.completedAt,
      title: o.property || `Job #${o.ref}`,
      body: `Job #${o.ref} is finished: ${o.title}${o.contractor ? `, ${o.contractor}` : ""}. Waiting for you to check.`,
      href: "/compliance-desk/works",
      tone: "warn",
    });
  }
  for (const x of sections) {
    out.push({
      id: `section:${x.id}`,
      kind: "compliance",
      at: x.at,
      title: x.label,
      body: `${SPECS[x.kind].short} ${x.kind === "s13" ? "rent increase" : "possession notice"} ${x.again ? "sent back" : "submitted"} by ${x.by || "an agent"}. Waiting for your decision.`,
      href: `/compliance-desk/sections?open=${encodeURIComponent(x.id)}`,
      tone: "warn",
    });
  }
  for (const x of decided) {
    out.push({
      id: `section-decided:${x.id}:${x.status}`,
      kind: "compliance",
      at: x.at,
      title: x.label,
      body: `${SPECS[x.kind].short}: ${STATUS_LABEL[x.status].toLowerCase()}${x.by ? ` by ${x.by}` : ""}.${x.note && x.status !== "approved" ? ` ${x.note}` : ""}`,
      href: `/portfolio?open=${encodeURIComponent(x.listingId)}&notice=${encodeURIComponent(x.id)}`,
      tone: x.status === "approved" || x.status === "served" ? "ok" : "warn",
    });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return out.slice(0, limit);
}

const SEEN_KEY = "notifications.seen_at";

export async function seenAt(userId: string): Promise<string | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: unknown }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, SEEN_KEY]).catch(
    () => []
  );
  const v = rows[0]?.value;
  return typeof v === "string" ? v : null;
}

export async function markSeen(userId: string, at = new Date()): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, SEEN_KEY, JSON.stringify(at.toISOString())]
  );
}
