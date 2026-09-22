import "server-only";
import { hasDb, q } from "@/lib/db";
import { switchOn } from "@/lib/switches";
import { findUserById, type OsUser } from "@/lib/users";
import { alreadyDone, claim, deliver, firstName, logDone, london, release, validEmail } from "@/lib/tenant-email-send";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { SITE } from "@/lib/email/tle-documents";
import { presentAgentFor } from "@/lib/rex-agents";
import { applicationEmails, feedbackRequests, matchesAgain, rebooks } from "@/lib/tenant-journey-emails";
import { alertsDue, markAlertSent, stopLink } from "@/lib/tenant-find";
import { homesOnMarket } from "@/lib/tenant-homes";

/**
 * The tenant emails that go on a timer (16 Sep 2026).
 *
 *   passport nudge 1   two days after a passport invite nobody has started
 *   passport nudge 2   seven days after, still nothing - and the last one
 *   viewing reminder   from 7am on the day of a TLE viewing
 *
 * Run hourly by os-cron-reminders (POST /api/tenant/reminders/run). Every send
 * is keyed in os_tenant_email_log, so an hourly run can never send one twice.
 *
 * ── Three things that keep this from writing to the wrong people ──────────
 *
 * THE SWITCH. `tenant_reminders` on Admin, Switches, and customer email as
 * well - sendAsAgent and sendEmail both check that one themselves.
 *
 * NO BACKLOG. The windows are narrow on purpose: a passport invited three
 * weeks ago is not nudged the day this ships, and a viewing is only reminded
 * about on its own day. Switching this on writes to the people it would have
 * written to today, nobody else.
 *
 * WHAT IS LOGGED. A row is written when the send is settled: sent, or refused
 * for a reason a retry cannot fix (no usable address). Switched off, or a
 * transport that is not connected, writes nothing, so the next hour tries
 * again - which is also what lets `dry` show the whole list without using it
 * up.
 */

export interface ReminderResult {
  key: string;
  emailId: string;
  to: string;
  subject: string;
  state: "sent" | "would" | "skipped" | "failed";
  detail: string;
}

export interface ReminderRun {
  ok: boolean;
  on: boolean;
  dry: boolean;
  ukHour: number;
  results: ReminderResult[];
  error?: string;
}

/* ── Passport nudges ──────────────────────────────────────────────────── */

type PassportRow = { token: string; name: string; email: string; agent_id: string | null };

/**
 * "Nothing typed" is `updated_at` still equal to `invited_at`: markInvited
 * stamps both in one statement, and the passport's own save moves updated_at
 * on the first answer. A few seconds of slack covers a mint and an invite
 * that landed in separate statements.
 */
async function untouchedInvites(fromDays: number, toDays: number): Promise<PassportRow[]> {
  return q<PassportRow>(
    `SELECT token, name, email, agent_id FROM os_tenant_passports
      WHERE invited_at IS NOT NULL
        AND submitted_at IS NULL
        AND COALESCE(contact_id, '') <> 'demo'
        AND invited_at <= NOW() - ($1 || ' days')::interval
        AND invited_at >  NOW() - ($2 || ' days')::interval
        AND updated_at <= invited_at + interval '10 seconds'`,
    [String(fromDays), String(toDays)]
  );
}

async function passportNudges(dry: boolean, out: ReminderResult[]) {
  const rounds: { n: 1 | 2; emailId: string; from: number; to: number }[] = [
    { n: 1, emailId: "tenant-passport-nudge-1", from: 2, to: 5 },
    { n: 2, emailId: "tenant-passport-nudge-2", from: 7, to: 10 },
  ];
  const agents = new Map<string, OsUser | null>();
  for (const round of rounds) {
    for (const p of await untouchedInvites(round.from, round.to)) {
      const key = `passport-nudge-${round.n}:${p.token}`;
      if (await alreadyDone(key)) continue;
      const to = (p.email ?? "").trim();
      const { subject, html } = await renderTleEmailLive(round.emailId, {
        firstName: firstName(p.name),
        link: `${SITE}/tenant/passport/${p.token}`,
      });
      if (!validEmail(to)) {
        if (!dry) await logDone(key, round.emailId, to, "no_address", "No usable email address.");
        out.push({ key, emailId: round.emailId, to, subject, state: "skipped", detail: "No usable email address on the passport." });
        continue;
      }
      if (dry) {
        out.push({ key, emailId: round.emailId, to, subject, state: "would", detail: `Would send nudge ${round.n}.` });
        continue;
      }
      if (p.agent_id && !agents.has(p.agent_id)) agents.set(p.agent_id, await findUserById(p.agent_id).catch(() => null));
      /* Claim it, then send it: a second run finds the claim and leaves it. */
      if (!(await claim(key, round.emailId, to))) continue;
      const r = await deliver({ agent: p.agent_id ? agents.get(p.agent_id) ?? null : null, to, toName: p.name, subject, html });
      if (r.final) await logDone(key, round.emailId, to, r.sent ? "sent" : "refused", r.detail);
      else await release(key);
      out.push({ key, emailId: round.emailId, to, subject, state: r.sent ? "sent" : "failed", detail: r.detail });
    }
  }
}

/* ── The morning-of viewing reminder ─────────────────────────────────── */

type ViewingRow = {
  id: string;
  starts_at: string | Date;
  agent: string | null;
  contacts: { name?: string; email?: string | null }[] | null;
  label: string | null;
  type: string | null;
};

/**
 * From 7am to 1pm London time, today's TLE viewings that have not started.
 *
 * TLE only: the ledger holds every brand on the shared REX account (TPE,
 * TCPE, PPE), and those tenants are not ours to write to. The type name is
 * the only thing that says whose a viewing is, so it is matched on the
 * prefix REX gives TLE's own appointment types.
 *
 * Not before 7am, because an email at 1am about a 10am viewing is the one a
 * tenant reads as spam. Not after 1pm, because by then the reminder for an
 * afternoon viewing has already gone at 7 and anything booked since was
 * confirmed minutes ago.
 */
async function viewingReminders(dry: boolean, now: Date, out: ReminderResult[]) {
  const { date, hour } = london(now);
  if (hour < 7 || hour >= 13) return;
  const rows = await q<ViewingRow>(
    `SELECT id, starts_at, agent, contacts, payload->>'listingLabel' AS label, payload->>'type' AS type
       FROM os_viewings
      WHERE kind = 'viewing'
        AND cancelled = FALSE
        AND starts_at > $2::timestamptz
        AND (starts_at AT TIME ZONE 'Europe/London')::date = $1::date
        AND payload->>'type' ILIKE 'TLE %Viewing%'`,
    [date, now.toISOString()]
  );

  const agents = new Map<string, { user: OsUser | null; phone: string }>();
  for (const v of rows) {
    const agentName = (v.agent ?? "").trim();
    if (agentName && !agents.has(agentName)) {
      const users = await q<{ id: string }>(`SELECT id FROM os_users WHERE LOWER(name) = LOWER($1) LIMIT 1`, [agentName]).catch(() => []);
      const user = users[0] ? await findUserById(users[0].id).catch(() => null) : null;
      const phone = user
        ? await presentAgentFor(user.email, { name: user.name, email: user.email }, "", null)
            .then((a) => a.phone)
            .catch(() => "")
        : "";
      agents.set(agentName, { user, phone });
    }
    const agent = agentName ? agents.get(agentName)! : { user: null, phone: "" };
    const unaccompanied = /unaccompanied/i.test(v.type ?? "");
    const address = v.label || "the property";
    /* "3:00pm", the way the other tenant emails write a time, not "15:00". */
    const timePretty = new Date(v.starts_at)
      .toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
      .replace(/\s/g, "")
      .toLowerCase();
    const who = agentName || "Your agent";

    for (const c of v.contacts ?? []) {
      const to = (c.email ?? "").trim();
      const key = `viewing-reminder:${v.id}:${to.toLowerCase() || c.name}`;
      if (await alreadyDone(key)) continue;
      const { subject, html } = await renderTleEmailLive("viewing-reminder", {
        firstName: firstName(c.name ?? ""),
        address,
        timePretty,
        agentName: who,
        meetLine: unaccompanied
          ? `This is an unaccompanied viewing, so nobody from us will be there - ${who} will send you how to get in.`
          : `${who} will meet you there.`,
        contactLine: agent.phone
          ? `Call ${firstName(who)} on <strong>${agent.phone}</strong> or reply to this email, and we'll move it.`
          : "Reply to this email and we'll move it.",
        mapLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      });
      if (!validEmail(to)) {
        if (!dry) await logDone(key, "viewing-reminder", to, "no_address", "No usable email address.");
        out.push({ key, emailId: "viewing-reminder", to, subject, state: "skipped", detail: `${c.name ?? "The applicant"} has no usable email address.` });
        continue;
      }
      if (dry) {
        out.push({ key, emailId: "viewing-reminder", to, subject, state: "would", detail: `Would remind ${c.name ?? to} about ${address} at ${timePretty}.` });
        continue;
      }
      if (!(await claim(key, "viewing-reminder", to))) continue;
      const r = await deliver({ agent: agent.user, to, toName: c.name ?? "", subject, html });
      if (r.final) await logDone(key, "viewing-reminder", to, r.sent ? "sent" : "refused", r.detail);
      else await release(key);
      out.push({ key, emailId: "viewing-reminder", to, subject, state: r.sent ? "sent" : "failed", detail: r.detail });
    }
  }
}

/**
 * One run. `dry` works out everything and sends nothing, whether or not the
 * switch is on - it is how to see who a switch-on would write to first.
 */
export async function runTenantReminders(opts: { dry?: boolean; now?: Date } = {}): Promise<ReminderRun> {
  const now = opts.now ?? new Date();
  const on = await switchOn("tenant_reminders");
  const dry = Boolean(opts.dry) || !on;
  const run: ReminderRun = { ok: true, on, dry, ukHour: london(now).hour, results: [] };
  if (!hasDb()) return { ...run, ok: false, error: "No database is connected." };
  /* Each job on its own: one that throws (REX not answering the application
     read, say) must not stop the passport nudges going. */
  const jobs: [string, () => Promise<void>][] = [
    ["passport nudges", () => passportNudges(dry, run.results)],
    ["viewing reminders", () => viewingReminders(dry, now, run.results)],
    ["feedback requests", () => feedbackRequests(dry, now, run.results)],
    ["rebooks", () => rebooks(dry, run.results)],
    ["anything close", () => matchesAgain(dry, run.results)],
    ["applications", () => applicationEmails(dry, run.results)],
    ["new-home alerts", () => homeAlerts(dry, now, run.results)],
  ];
  const errors: string[] = [];
  for (const [name, job] of jobs) {
    try {
      await job();
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) {
    run.ok = false;
    run.error = errors.join("; ");
  }
  return run;
}

/**
 * New-home alerts a tenant signed up to on Find a home (18 Sep 2026), with
 * their own tick. Hourly from 8am to 8pm London time, and at most once a day
 * each: the key carries the date, so a busy day's new homes wait for
 * tomorrow's email rather than arriving one at a time. Sent from The Letting
 * Experts rather than an agent - an alert belongs to no single listing.
 */
async function homeAlerts(dry: boolean, now: Date, out: ReminderResult[]) {
  const { date, hour } = london(now);
  if (hour < 8 || hour >= 20) return;
  const market = await homesOnMarket();
  if (!market.ok) return;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
  for (const a of await alertsDue(market.homes)) {
    const key = `tenant-home-alert:${a.email}:${date}`;
    if (await alreadyDone(key)) continue;
    if (!validEmail(a.email)) continue;
    const n = a.homes.length;
    const first = firstName(a.name);
    const shown = a.homes.slice(0, 6);
    const homesList =
      shown
        .map((h) => {
          const rent = `£${Math.round(h.rent).toLocaleString("en-GB")} ${h.rentPeriod === "week" ? "a week" : "a month"}`;
          const what = [h.beds != null ? (h.beds === 0 ? "Studio" : `${h.beds} bed`) : null, h.propertyType?.toLowerCase()].filter(Boolean).join(" ");
          const miles = h.miles != null ? ` · ${h.miles < 10 ? h.miles.toFixed(1) : Math.round(h.miles)} miles away` : "";
          return `<a href="${SITE}/tenant/homes/${h.id}" style="color:#56423e;text-decoration:none"><strong>${rent}</strong> · ${esc([what, h.name, h.locality].filter(Boolean).join(", "))}</a>${miles}`;
        })
        .join("<br>") + (n > shown.length ? `<br>And ${n - shown.length} more in your tenant area.` : "");
    const vars = {
      firstName: first,
      subjectLine: n === 1 ? `A new home for you, ${first}` : `${n} new homes for you, ${first}`,
      introLine: `${n < WORDS.length ? WORDS[n] : n} new ${n === 1 ? "home has" : "homes have"} come on that ${n === 1 ? "fits" : "fit"} your search: <strong>${esc(a.search)}</strong>.`,
      homesList,
      link: `${SITE}/tenant/homes`,
      stopLink: stopLink(SITE, a.email),
    };
    const { subject, html } = await renderTleEmailLive("tenant-home-alert", vars);
    if (dry) {
      out.push({ key, emailId: "tenant-home-alert", to: a.email, subject, state: "would", detail: `Would tell ${a.name || a.email} about ${n} new home${n === 1 ? "" : "s"}: ${shown.slice(0, 3).map((h) => h.name).join(", ")}.` });
      continue;
    }
    const r = await deliver({ agent: null, to: a.email, toName: a.name, subject, html });
    if (r.final) await logDone(key, "tenant-home-alert", a.email, r.sent ? "sent" : "refused", r.detail, { homes: shown.map((h) => h.id) });
    if (r.sent) await markAlertSent(a.email);
    out.push({ key, emailId: "tenant-home-alert", to: a.email, subject, state: r.sent ? "sent" : "failed", detail: r.detail });
  }
}
