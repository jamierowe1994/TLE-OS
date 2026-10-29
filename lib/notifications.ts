import "server-only";
import { ukDaysFromToday } from "@/lib/london-clock";
import { hasDb, q } from "@/lib/db";
import { aiOutage } from "@/lib/ai-outage";
import { WATCHERS, watchNotices } from "@/lib/cron-watch";
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
import { gapsForBell } from "@/lib/propoly-mail";
import { recentBankChanges } from "@/lib/bank-vault";
import { bookFor } from "@/lib/listings-cache";
import { recentTenantSends } from "@/lib/tenant-documents";
import { termsForAgent } from "@/lib/terms/store";

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
 *   offers in                the listing's agent, when somebody else put the
 *                            offer on (the tenant, a colleague, the office) -
 *                            not their own, never a test file's. The last
 *                            week, read from the offer itself (Howard, ticket
 *                            0268fdcc, 15 Oct 2026). Matched by the
 *                            listing being on their book as well as by the
 *                            address the offer email went to (23 Oct 2026)
 *   files in                 the agent who sent the tenant their passport,
 *                            when the tenant sends ID, references or
 *                            payslips from their tenant area (23 Oct 2026),
 *                            for a week
 *   still looking            the agent who sent "it's been let", when that
 *                            person pressed Show Me Other Homes (lib/let-
 *                            notice, 22 Oct 2026), for a week
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
     desk's notices as well as Michael and Josel. Kirstie has been
     super_admin since 26 Oct 2026, and is the only one. */
  const desk = me.role === "compliance" || me.role === "pretenancy" || me.role === "super_admin";

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

  /* Their automations (lib/automations, 22 Oct 2026): a first send waiting
     for them to check, and "tell me in the bell" lines, the last three days. */
  const automationLines = await import("@/lib/automations/bell").then((m) => m.automationNotices(me.id)).catch(() => []);

  /* A document compliance queried, on a home of yours (4 Oct 2026). */
  const queried = await queriesFor(me.id).catch(() => []);

  /* Right to Rent follow-up checks owed inside four weeks (4 Oct 2026): the office. */
  const rtrDue = desk ? await followUpsDue(28).catch(() => []) : [];
  /* ...and the ones recorded on a let itself (lib/application-rtr, 15 Oct 2026). */
  const rtrLetDue = desk ? await import("@/lib/application-rtr").then((m) => m.rtrFollowUpsDue(28)).catch(() => []) : [];

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

  /* Offers in on their listings, made by somebody else (ticket 0268fdcc,
     15 Oct 2026). sent_to is the listing's agent each offer path wrote to;
     the agent's own offers carry recordedBy with their email. Test offers
     live on the test file, not here, so a test listing never rings. */
  /* sent_to alone missed offers (23 Oct 2026): it is the agent's email as
     REX holds it, which is not always their sign-in (Bernadine's REX address
     is bernadine@thepropertyexperts.co.uk), and it is empty when REX could
     not be read as the offer came in. So a listing on their own book counts
     too - the same book their Listings board and Offers tab are read from. */
  const myListings = me.rexUserId
    ? ((await bookFor(me.rexUserId).catch(() => null))?.listings ?? []).map((l) => String(l.id))
    : [];
  const offersIn = await q<{ id: string; name: string; email: string; address: string | null; listing_id: string; amount: string | null; created_at: Date }>(
    `SELECT id, name, email, address, listing_id, payload->>'amount' AS amount, created_at FROM os_tenant_viewing_responses
      WHERE kind = 'offer' AND listing_id IS NOT NULL AND created_at > NOW() - INTERVAL '7 days'
        AND (LOWER(sent_to) = LOWER($1) OR listing_id = ANY($2::text[]))
        AND LOWER(COALESCE(payload->'recordedBy'->>'email', '')) <> LOWER($1)
      ORDER BY created_at DESC LIMIT 20`,
    [me.email, myListings]
  ).catch(() => []);
  const filesIn = await recentTenantSends(me.id).catch(() => []);

  /* Still looking (22 Oct 2026): somebody told a home was let pressed Show
     Me Other Homes in the agent's email (lib/let-notice recordAsked). The
     agent who sent it, for a week. */
  const stillLooking = await q<{ listing_id: string; email: string; name: string | null; address: string | null; lead_id: string | null; asked_at: Date }>(
    `SELECT listing_id, email, name, address, lead_id, asked_at FROM os_let_notices
      WHERE asked_at > NOW() - INTERVAL '7 days' AND LOWER(by_email) = LOWER($1)
      ORDER BY asked_at DESC LIMIT 20`,
    [me.email]
  ).catch(() => []);

  /* A contractor who hasn't come back 48 hours after the final reminder
     (lib/works-chase, Sean McMahon, 26 Oct 2026): whoever set the chase up,
     and whoever raised the job. Nothing is cancelled on its own, so it waits
     here until they decide, the contractor answers, or the job moves on. */
  const silent = await q<{ order_id: string; contractor_name: string; silent_at: Date; ref: number; title: string; property_name: string }>(
    `SELECT c.order_id, c.contractor_name, c.silent_at, w.ref, w.title, w.property_name
       FROM os_works_chases c JOIN os_works_orders w ON w.id = c.order_id
      WHERE c.stopped_at IS NULL AND c.silent_at IS NOT NULL AND NOT w.rehearsal
        AND w.status IN ('reported', 'approved', 'scheduled') AND w.contractor_id = c.contractor_id
        AND (c.set_by_id = $1 OR LOWER(w.raised_by) = LOWER($2) OR LOWER(w.raised_by) = LOWER($3))
      ORDER BY c.silent_at DESC LIMIT 10`,
    [me.id, me.name ?? "", me.email]
  ).catch(() => []);

  const out: Notice[] = [...reminders];
  for (const s of silent) {
    out.push({
      id: `chase-silent:${s.order_id}:${new Date(s.silent_at).toISOString()}`,
      kind: "reminder",
      at: new Date(s.silent_at).toISOString(),
      title: `No word from ${s.contractor_name || "the contractor"}`,
      body: `Job #${s.ref}, ${s.title}, ${s.property_name}. 48 hours since the final reminder. Nothing has been cancelled: place it elsewhere, or keep waiting.`,
      href: `/maintenance/${encodeURIComponent(s.order_id)}?chase=1`,
      tone: "warn",
    });
  }
  for (const s of stillLooking) {
    const who = s.name || s.email;
    out.push({
      id: `still-looking:${s.listing_id}:${s.email}`,
      kind: "lead",
      at: new Date(s.asked_at).toISOString(),
      title: `Still looking: ${who}`,
      body: `Told ${s.address || "a home"} is let, they pressed Show Me Other Homes. Worth a call.`,
      href: s.lead_id ? `/leads?open=${encodeURIComponent(s.lead_id)}` : `/listings/${encodeURIComponent(s.listing_id)}?tab=enquiries`,
      tone: "warn",
    });
  }
  for (const f of filesIn) {
    out.push({
      id: `files-in:${f.email}:${f.last}`,
      kind: "lead",
      at: f.last,
      title: `Files in: ${f.name}`,
      body: `${f.files === 1 ? "A file" : `${f.files} files`} sent from their tenant area. They're on their passport.`,
      href: f.leadId ? `/leads?open=${encodeURIComponent(f.leadId)}&passport=1` : null,
      tone: "warn",
    });
  }
  for (const o of offersIn) {
    const amount = Number(o.amount);
    out.push({
      id: `offer:${o.id}`,
      kind: "deal",
      at: new Date(o.created_at).toISOString(),
      title: `Offer in: ${o.name || o.email}`,
      body: `${Number.isFinite(amount) && amount > 0 ? `£${amount.toLocaleString("en-GB")} a month on ` : "On "}${o.address || "one of your listings"}. Accept, decline or send it to the landlord.`,
      href: `/listings/${encodeURIComponent(o.listing_id)}?tab=applications&offer=${encodeURIComponent(`os:${o.id}`)}`,
      tone: "warn",
    });
  }
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
  /* A lead passed to them in the OS ("Not my lead", lib/lead-owner), and for
     owners and the office, a lead sent back to the office and still there. */
  const { movesForBell } = await import("@/lib/lead-owner");
  for (const m of await movesForBell({ rexUserId: me.rexUserId, email: me.email, pool: owner }).catch(() => [])) {
    const who = m.name || "A lead";
    out.push({
      id: `moved:${m.leadId}:${m.at}`,
      kind: "lead",
      at: m.at,
      title: m.pool ? `Back to the office: ${who}` : `Lead passed to you: ${who}`,
      body: [
        m.pool ? `${m.byName} sent it back${m.fromName && m.fromName !== m.byName ? ` from ${m.fromName}` : ""}. Give it to the right agent.` : `From ${m.byName}.`,
        m.reason ? `"${m.reason}"` : null,
      ].filter(Boolean).join(" "),
      href: `/leads?open=${encodeURIComponent(m.leadId)}`,
      tone: m.pool ? "warn" : "none",
    });
  }
  for (const c of rtrDue) {
    /* UK calendar days (Rig run 4, P-066): rounding milliseconds said "was due
       1 day ago" every afternoon of the day it was due. */
    const days = ukDaysFromToday(String(c.followUpOn).slice(0, 10));
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
  for (const c of rtrLetDue) {
    const days = ukDaysFromToday(String(c.followUpOn).slice(0, 10));
    out.push({
      id: `rtr-let:${c.id}`,
      kind: "reminder",
      at: c.at,
      title: c.tenant,
      body: `Right to Rent follow-up check ${days < 0 ? `was due ${-days} day${days === -1 ? "" : "s"} ago` : days <= 0 ? "is due today" : `is due in ${days} day${days === 1 ? "" : "s"}`}${c.property ? ` (${c.property})` : ""}.`,
      /* A sitting tenant's is kept on the home (ticket 066bb29e). */
      href: c.applicationId.startsWith("home:") ? `/portfolio/${encodeURIComponent(c.applicationId.slice(5))}` : `/applications/${encodeURIComponent(c.applicationId)}`,
      tone: "warn",
    });
  }
  for (const x of prepDue) {
    /* A DATE column: pg hands back midnight on that day, so its ISO date is the day itself. */
    const dueDay = typeof x.due_on === "string" ? x.due_on.slice(0, 10) : new Date(x.due_on as unknown as string).toISOString().slice(0, 10);
    const days = ukDaysFromToday(dueDay);
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
  out.push(...automationLines);
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
  /* Somebody paused for opening too much too fast (the middleware's pace
     cap, 10 Oct 2026): owners, for three days, linking to the person's file,
     where what they opened is listed and Lock out is one press away. */
  const paused =
    me.role === "owner"
      ? await q<{ id: string; actor_id: string | null; actor_email: string; detail: string; at: Date }>(
          `SELECT id, actor_id, actor_email, detail, at FROM os_audit
            WHERE kind = 'reading_paused' AND at > NOW() - INTERVAL '3 days'
            ORDER BY at DESC LIMIT 10`
        ).catch(() => [])
      : [];
  for (const p of paused) {
    out.push({
      id: `paused:${p.id}`,
      kind: "compliance",
      at: new Date(p.at).toISOString(),
      title: `${p.actor_email || "Somebody"} was paused for reading too fast`,
      body: `${p.detail}. See what they opened, and lock them out if it isn't their work.`,
      href: p.actor_id ? `/admin/people/${p.actor_id}` : "/admin/activity",
      tone: "warn",
    });
  }
  /* Claude refused for credit or the key (lib/ai-outage, 22 Oct 2026):
     owners, one line per outage however many files it stopped, for three
     days. It says when it came back, so the line answers itself. */
  if (me.role === "owner") {
    const offline = await q<{ id: string; detail: string; at: Date }>(
      `SELECT id, detail, at FROM os_audit
        WHERE kind = 'ai_offline' AND at > NOW() - INTERVAL '3 days'
        ORDER BY at DESC LIMIT 5`
    ).catch(() => []);
    const now = offline.length ? await aiOutage().catch(() => null) : null;
    for (const [i, o] of offline.entries()) {
      const at = new Date(o.at).toISOString();
      /* Only the newest outage can still be open. */
      const open = i === 0 && Boolean(now?.since);
      const back = !open && i === 0 && now?.backAt && now.backAt > at ? now.backAt : null;
      const credit = /credit|spend limit/i.test(o.detail);
      out.push({
        id: `ai-offline:${o.id}`,
        kind: "compliance",
        at,
        title: open ? "The document reader is offline" : "The document reader was offline",
        body: open
          ? `${credit ? "The Anthropic account is out of credit or over its spend limit" : "The Anthropic key was refused"}. PLC files are waiting to read and will read themselves once it's back. ${credit ? "Top up at console.anthropic.com." : "Check ANTHROPIC_API_KEY on Railway."}`
          : `${credit ? "The Anthropic account ran out of credit" : "The Anthropic key was refused"}${back ? `, back since ${new Date(back).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}` : ""}. Waiting PLC files read themselves once it answered.`,
        href: "/admin/ai-costs",
        tone: open ? "warn" : "none",
      });
    }
  }
  /* A Railway timer that stopped reaching the OS, or a rent read gone stale
     (lib/cron-watch, 28 Oct 2026): James and Howard, while it lasts and for
     three days after it came back. */
  if (WATCHERS.includes((me.email ?? "").trim().toLowerCase())) {
    for (const w of await watchNotices().catch(() => [])) out.push({ ...w, kind: "compliance", href: "/admin/connections" });
  }
  /* A contractor's bank details replaced (lib/bank-vault, 26 Oct 2026): the
     classic payment fraud, so owners hear about each one for a fortnight. */
  if (me.role === "owner") {
    for (const c of await recentBankChanges(14).catch(() => [])) {
      out.push({
        id: `bank-change:${c.contractorId}:${c.at}`,
        kind: "money",
        at: c.at,
        title: `${c.contractorName}'s bank details were changed`,
        body: `By ${c.by}. Before their next invoice is paid, someone should ring them on a number we already had to confirm the new details.`,
        href: `/contractors?id=${encodeURIComponent(c.contractorId)}`,
        tone: "warn",
      });
    }
  }
  /* Whose Outlook isn't connected, so Propoly's copies to them (the move-in
     pack above all) can't be logged (lib/propoly-mail, 22 Oct 2026). Owners,
     one line per set of names: told once, gone once ticked. */
  if (me.role === "owner") {
    const gaps = await gapsForBell().catch(() => null);
    if (gaps) {
      out.push({
        id: `propoly-gap:${gaps.names.join("|")}`,
        kind: "compliance",
        at: gaps.since,
        title: gaps.names.length === 1 ? `${gaps.names[0]}'s Outlook isn't connected` : `${gaps.names.length} people's Outlook isn't connected`,
        body: `${gaps.names.join(", ")}. Propoly's emails to them, the move-in pack included, can't be logged on the let until they connect it on their Profile.`,
        href: "/admin/propoly",
        tone: "warn",
      });
    }
  }
  /* The landlord's answers to the pre-appraisal pack's quick questions
     (lib/pre-pack, 23 Oct 2026), to the agent who sent the pack, for a
     fortnight: the four answers in the line, opening the appraisal. */
  const packAnswers = await q<{ token: string; ref: string; recipient: string; answers: { q: string; a: string }[]; answered_at: Date }>(
    `SELECT p.token, p.ref, p.deck->>'recipientName' AS recipient, a.answers, a.answered_at
       FROM os_present_answers a JOIN os_presentations p ON p.token = a.token
      WHERE p.author_id = $1 AND a.answered_at > NOW() - INTERVAL '14 days'
      ORDER BY a.answered_at DESC LIMIT 10`,
    [me.id]
  ).catch(() => []);
  for (const r of packAnswers) {
    const who = (r.recipient || "Your landlord").trim().split(/\s+/)[0];
    out.push({
      id: `pack-answers:${r.token}:${new Date(r.answered_at).getTime()}`,
      kind: "lead",
      at: new Date(r.answered_at).toISOString(),
      title: `${who} answered your pre-appraisal questions`,
      body: (r.answers ?? []).map((x) => `${x.q.replace(/\?$/, "")}: ${x.a}`).join(" · "),
      href: r.ref ? `/market-appraisals/${encodeURIComponent(r.ref)}` : "/market-appraisals",
      tone: "ok",
    });
  }
  /* Terms of Business sent from the OS (lib/terms, 23 Oct 2026), to the
     agent who sent them: your part still to sign, an email that didn't go,
     each landlord as they sign, and all signed. Two weeks, then gone. */
  const recentTerms = await termsForAgent(me.id, 20).catch(() => []);
  const fortnight = Date.now() - 14 * 86400000;
  for (const t of recentTerms) {
    const href = t.listingId ? `/listings/${t.listingId}?tab=compliance` : "/listings";
    const street = t.propertyAddress.split(",")[0] || t.propertyAddress;
    if (t.status === "agent" && Date.parse(t.createdAt) > fortnight) {
      out.push({ id: `terms-agent:${t.id}`, kind: "lead", at: t.createdAt, title: `Sign your part of the terms for ${street}`, body: "Nothing goes to the landlord until you do.", href, tone: "warn" });
    }
    for (const p of t.parties) {
      if (p.emailError && !p.emailedAt && !p.signedAt) {
        out.push({ id: `terms-email:${t.id}:${p.key}`, kind: "lead", at: t.sentAt ?? t.createdAt, title: `The terms email to ${p.name} didn't go`, body: `${p.emailError.replace(/[.\s]+$/, "")}. Copy their link from the Compliance tab, or send again.`, href, tone: "warn" });
      }
      if (p.signedAt && Date.parse(p.signedAt) > fortnight && t.status !== "signed") {
        out.push({ id: `terms-signed:${t.id}:${p.key}`, kind: "lead", at: p.signedAt, title: `${p.name} signed the terms for ${street}`, body: `${t.parties.filter((x) => !x.signedAt).length} still to sign.`, href, tone: "ok" });
      }
    }
    if (t.status === "signed" && t.completedAt && Date.parse(t.completedAt) > fortnight) {
      out.push({ id: `terms-done:${t.id}`, kind: "lead", at: t.completedAt, title: `Terms signed for ${street}`, body: "Everyone has signed. The copy is on the Compliance tab.", href, tone: "ok" });
    }
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
      href: `/portfolio/${encodeURIComponent(x.listingId)}?tab=tenancy&notice=${encodeURIComponent(x.id)}`,
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

/* Done on the dashboard (James, 14 Oct 2026: "when things are marked as done they clear from
   the list"). The ids a person ticked on Needs attention, newest first, their own like the read
   marker. Notice ids are stable (deal:<id>, task:<id>...), so a ticked line stays gone; a new
   event is a new id and shows up again. The bell keeps everything. */
const DONE_KEY = "notifications.done";
const DONE_KEEP = 500;

export async function doneIds(userId: string): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ value: unknown }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, DONE_KEY]).catch(
    () => []
  );
  const v = rows[0]?.value;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function markDone(userId: string, id: string, done: boolean): Promise<void> {
  if (!hasDb()) return;
  const now = (await doneIds(userId)).filter((x) => x !== id);
  const next = (done ? [id, ...now] : now).slice(0, DONE_KEEP);
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, DONE_KEY, JSON.stringify(next)]
  );
}

export async function markSeen(userId: string, at = new Date()): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, SEEN_KEY, JSON.stringify(at.toISOString())]
  );
}
