import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { NOT_SALES } from "@/lib/lead-ledger";
import { findDonePassportByEmail, getPassport } from "@/lib/passport";
import { sendPassportInvite } from "@/lib/passport-invite";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { findUserById, type OsUser } from "@/lib/users";
import { claim, firstName, logDone, release, validEmail } from "@/lib/tenant-email-send";

/**
 * AUTOMATE PASSPORT (Dan Richards and Sean McMahon, 21 Oct 2026).
 *
 * A switch on a listing's Enquiries tab. While it is on, every new enquiry
 * on that home gets the tenant passport straight away - the same email, sent
 * the same way, as the agent pressing Send passports (lib/passport-invite):
 * from the mailbox of whoever turned it on, behind the customer email switch,
 * one passport per tenant per agent.
 *
 * A day later, if the passport is not finished, ONE reminder goes
 * (tenant-passport-reminder). Dan wanted it encouraging, not pushy. It waits
 * in os_scheduled_sends like any timed email, and the runner asks this file
 * whether it still stands before it goes: a finished passport, or the switch
 * turned off, cancels it.
 *
 * Swept on the five-minute leads scan (app/api/leads/scan), beside the
 * enquiry reply. Only enquiries first seen AFTER the switch went on, and
 * received in the last day, so turning it on is never a backlog of old
 * enquirers suddenly emailed. Not the diary's own viewers, not sales, not
 * leads removed by hand, and only the leads the switcher can see on their own
 * board. Anyone who already has a finished passport, with any agent, is left
 * alone: they would only be asked to fill it in twice.
 */

export const PASSPORT_REMINDER_KIND = "passport-reminder";
const REMINDER_EMAIL = "tenant-passport-reminder";
const REMINDER_AFTER_HOURS = 24;

export type AutoPassport = { listingId: string; userId: string; userName: string; rexUserId: string | null; home: string; onSince: string };

type Row = { listing_id: string; user_id: string; user_name: string; rex_user_id: string | null; home: string; on_since: Date | string };
const asAuto = (r: Row): AutoPassport => ({
  listingId: r.listing_id,
  userId: r.user_id,
  userName: r.user_name,
  rexUserId: r.rex_user_id,
  home: r.home,
  onSince: new Date(r.on_since).toISOString(),
});

export async function getAutoPassport(listingId: string): Promise<AutoPassport | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(`SELECT * FROM os_listing_auto_passport WHERE listing_id = $1`, [listingId]);
  return rows[0] ? asAuto(rows[0]) : null;
}

/** On from now, as `me`; or off, which also stops every reminder still waiting. */
export async function setAutoPassport(p: { listingId: string; on: boolean; me: OsUser; rexUserId: string | null; home: string }): Promise<AutoPassport | null> {
  if (!p.on) {
    await q(`DELETE FROM os_listing_auto_passport WHERE listing_id = $1`, [p.listingId]);
    await q(
      `UPDATE os_scheduled_sends SET state = 'cancelled', error = $2
        WHERE kind = $3 AND state = 'queued' AND ref LIKE $1 || ':%'`,
      [p.listingId, `Automate passport was turned off by ${p.me.name || p.me.email}, so it was not sent.`, PASSPORT_REMINDER_KIND]
    );
    return null;
  }
  /* Already on stays on as it was: its start and its sender do not move. */
  const rows = await q<Row>(
    `INSERT INTO os_listing_auto_passport (listing_id, user_id, user_name, rex_user_id, home)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (listing_id) DO UPDATE SET home = EXCLUDED.home
     RETURNING *`,
    [p.listingId, p.me.id, p.me.name || p.me.email, p.rexUserId, p.home]
  );
  return asAuto(rows[0]);
}

/** Who on a listing has had theirs automatically, for the tab to say so. */
export async function autoSentEmails(listingId: string): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ key: string }>(
    `SELECT key FROM os_tenant_email_log WHERE key LIKE $1 AND outcome = 'sent'`,
    [`auto-passport:${listingId}:%`]
  ).catch(() => []);
  return rows.map((r) => r.key.slice(`auto-passport:${listingId}:`.length));
}

type Vars = { firstName: string; address: string; agentName: string; link: string };

async function renderReminder(vars: Vars) {
  return renderTleEmailLive(REMINDER_EMAIL, vars);
}

type SweepResult = { listingId: string; to: string; state: "sent" | "already" | "done" | "waiting" | "failed"; detail: string };

export async function autoPassportSweep(origin: string): Promise<SweepResult[]> {
  const out: SweepResult[] = [];
  if (!hasDb()) return out;
  const autos = (await q<Row>(`SELECT * FROM os_listing_auto_passport`)).map(asAuto);
  for (const a of autos) {
    const leads = await q<{ id: string; name: string | null; email: string | null }>(
      `SELECT id, name, email FROM os_leads
        WHERE listing_id = $1
          AND first_seen >= $2
          AND COALESCE(received_at, first_seen) > NOW() - interval '1 day'
          AND COALESCE(email, '') <> ''
          AND COALESCE(source, '') <> 'REX diary'
          AND ${NOT_SALES}
          AND id NOT IN (SELECT id FROM os_hidden_leads)
          AND ($3::text IS NULL OR assignee_id = $3)
        ORDER BY first_seen`,
      [a.listingId, a.onSince, a.rexUserId]
    ).catch(() => []);
    if (!leads.length) continue;
    const me = await findUserById(a.userId).catch(() => null);
    /* Whoever turned it on has gone: nothing goes out in their name. */
    if (!me || me.locked) continue;
    const seen = new Set<string>();
    for (const l of leads) {
      const email = (l.email ?? "").trim().toLowerCase();
      if (!validEmail(email) || seen.has(email)) continue;
      seen.add(email);
      const key = `auto-passport:${a.listingId}:${email}`;
      if (!(await claim(key, "tenant-passport-request", email))) continue;
      const name = (l.name ?? "").trim();
      if (await findDonePassportByEmail(email).catch(() => null)) {
        await logDone(key, "tenant-passport-request", email, "done", "Already has a finished passport.");
        out.push({ listingId: a.listingId, to: email, state: "done", detail: "Already has a finished passport." });
        continue;
      }
      const r = await sendPassportInvite({ me, origin, name, email, home: a.home }).catch((e) => ({ ok: false as const, status: 500, error: e instanceof Error ? e.message : "The send failed." }));
      if (!r.ok) {
        /* Customer email off: try again next scan, while the enquiry is still
           a day old or less. Anything else is logged and left to the agent's
           own Send passports, which still shows them as not sent. */
        if (r.status === 409) {
          await release(key);
          out.push({ listingId: a.listingId, to: email, state: "waiting", detail: r.error });
        } else {
          await logDone(key, "tenant-passport-request", email, "failed", r.error);
          out.push({ listingId: a.listingId, to: email, state: "failed", detail: r.error });
        }
        continue;
      }
      if (r.alreadySent) {
        await logDone(key, "tenant-passport-request", email, "already", `Already sent ${r.invitedAt}.`);
        out.push({ listingId: a.listingId, to: email, state: "already", detail: "They had already been sent one." });
        continue;
      }
      await logDone(key, "tenant-passport-request", email, "sent", r.said, { lead: l.id, token: r.token });
      /* The day-later reminder. Its words are rendered when it goes, from
         the catalogue as it stands then; these are only its blanks. */
      const vars: Vars = { firstName: firstName(name), address: a.home || "the home", agentName: me.name || "The Letting Experts", link: `${origin}${r.path}` };
      const { subject } = await renderReminder(vars);
      await q(
        `INSERT INTO os_scheduled_sends (id, kind, ref, to_email, subject, body, send_at, queued_by, queued_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + make_interval(hours => $7), $8, $9)`,
        [randomBytes(9).toString("base64url"), PASSPORT_REMINDER_KIND, `${a.listingId}:${r.token}`, email, subject, JSON.stringify(vars), REMINDER_AFTER_HOURS, me.name || me.email, me.id]
      );
      out.push({ listingId: a.listingId, to: email, state: "sent", detail: r.said });
    }
  }
  return out;
}

/**
 * Should a queued reminder still go? Null when it should, otherwise the
 * reason it was not sent. `ref` is "<listingId>:<passport token>".
 */
export async function passportReminderStands(ref: string): Promise<string | null> {
  const at = ref.indexOf(":");
  const listingId = ref.slice(0, at);
  const token = ref.slice(at + 1);
  if (!(await getAutoPassport(listingId))) return "Automate passport is off on this listing now, so it was not sent.";
  const rec = await getPassport(token).catch(() => null);
  if (!rec) return "The passport no longer exists, so it was not sent.";
  if (rec.submittedAt) return "They finished their passport before this was due, so it was not sent.";
  return null;
}

/** The reminder's finished email, from the blanks the sweep stored. */
export async function reminderMail(body: string): Promise<{ subject: string; html: string }> {
  return renderReminder(JSON.parse(body) as Vars);
}

/**
 * The reminder, to the agent themself, so they read it as a tenant will
 * (and James signs the words off before any go to a tenant).
 */
export async function sendReminderToMe(p: { me: OsUser; home: string; origin: string }): Promise<{ sent: boolean; detail: string; subject: string; html: string }> {
  const { subject, html } = await renderReminder({
    firstName: firstName(p.me.name || ""),
    address: p.home || "the home",
    agentName: p.me.name || "The Letting Experts",
    link: `${p.origin}/tenant/passport/your-own-link`,
  });
  const r = await sendAsAgent({ me: p.me, to: p.me.email, toName: p.me.name || undefined, subject: `[Preview] ${subject}`, html });
  return { sent: r.sent, detail: r.detail, subject, html };
}
