import "server-only";
import { hasDb, q } from "@/lib/db";
import { sendingLocked, switchOn } from "@/lib/switches";
import { isInternalAddress } from "@/lib/email-policy";
import { managedBookFor } from "@/lib/managed-book-cache";
import { MANAGED_HOME_SERVICES } from "@/lib/current-lets";
import { houseKeyOf } from "@/lib/address-parse";
import { sittingLets } from "@/lib/tenant-logins";
import { ensureTenantAccount } from "@/lib/tenant-account";
import { startVerification } from "@/lib/verification";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { SITE } from "@/lib/email/tle-documents";
import { agentPhone, OFFICE_PHONE } from "@/lib/agent-phone";
import { inspectionRules } from "@/lib/inspections";
import { isTestCase, isTestFile } from "@/lib/test-guard";
import { findUserByRexId, normaliseEmail, type OsUser } from "@/lib/users";
import { alreadyDone, claim, deliver, dryFor, firstName, logDone, london, release, userByName, validEmail, type Dry } from "@/lib/tenant-email-send";
import type { ReminderResult } from "@/lib/tenant-reminders";
import type { ManagedProperty, Party } from "@/lib/portfolio-types";

/**
 * WELCOME, ONCE THE TENANTS HAVE MOVED IN (Kirstie Mulholland, ticket
 * f180d1eb, 8 Nov 2026: "Please can we create a welcome email to tenants and
 * landlords for managed properties - we had one on rex pm and could we make
 * it so it goes out automatically once tenants have moved in". James, 10 Nov
 * 2026: "Feel free to make those automatic welcome emails after moving in.")
 *
 * James decided on 2 Oct 2026 that nothing on a let writes to a landlord or
 * tenant by itself - every update goes to the agent first (lib/customer-
 * updates). These two are his own exception to that, given on 10 Nov.
 *
 *   tenant-move-in-welcome     each tenant with an email on the let
 *   landlord-move-in-welcome   each landlord with an email on the home
 *
 * ── How the OS knows they have moved in ────────────────────────────────────
 *
 * The managed book's moveIn (lib/book-lets moveInsFor): the day the tenancy
 * began as the let page has it - a move-in put right in the OS, else the
 * Propoly deal the let was pushed into, else the accepted application's
 * start. The same date inspections, reviews and notices count from, so the
 * welcome and the first visit agree. A home with no OS let behind it (no
 * accepted application, so no letRefs) has only REX's let date, which is a
 * week or more off and is also what a management transfer carries, so it is
 * never welcomed: a sitting tenant taken on from another agent has not just
 * moved in.
 *
 * Sent the MORNING AFTER the move-in date, 9am to 6pm London, so the keys
 * have changed hands and nobody is welcomed to a home they are still on the
 * way to. Run hourly on the tenant reminders run (os-cron-reminders, POST
 * /api/tenant/reminders/run), which also gives it a dry run: ?dry=1.
 *
 * ── Which lets ──────────────────────────────────────────────────────────────
 *
 * Managed and Fully Managed only (MANAGED_HOME_SERVICES): Let Only is the
 * landlord's own to look after, and Rent Collect is rent and nothing else
 * (James, 2 Oct 2026), so neither has a property manager to introduce. Every
 * room of a shared house is its own let (lib/tenant-logins sittingLets).
 * Never a test home, a test application or a test address. Not a home
 * whose tenants have given notice or that stands empty.
 *
 * The landlord is welcomed once per home, and not at all when the book holds
 * an earlier let of that home (or another room of that house) with them on
 * it: a re-let to a landlord we already manage for is not a welcome.
 *
 * ── No backlog ──────────────────────────────────────────────────────────────
 *
 * Switching it on must not write to every tenant already living in a managed
 * home. Two limits, both on the move-in date:
 *
 *   - never more than WINDOW_DAYS (7) after it, so a let read late, or a
 *     move-in put right weeks later, does not set off a welcome weeks in;
 *   - never before the day the switch was last turned on, less GRACE_DAYS
 *     (3), so the first morning welcomes only the last few days' move-ins.
 *
 * Turned off and on again, the boundary moves to the new day: lets that moved
 * in while it was off are not caught up. That is the safe way round.
 *
 * ── Gates, the same as every automatic tenant email ────────────────────────
 *
 * Its own switch, `move_in_welcome` (Admin, Switches: Move-in welcome
 * emails), default off. Off, the run is "held": nothing goes, except a send
 * addressed to ALWAYS_SEND_TO (Howard), as lib/tenant-reminders does. And
 * customer email, which sendAsAgent and sendEmail check themselves.
 * SENDING_LOCKED stops all of it.
 *
 * Once per person per let, recorded in os_tenant_email_log before it is
 * sent (claim, then send, then logDone), so two overlapping runs cannot both
 * send. A dry run writes nothing and makes no account or sign-in link.
 *
 * Read only towards REX, REX PM, PayProp and Propoly: nothing is written to
 * any of them. The tenant's portal account and the tie to the home are our
 * own tables, the same rows Send out logins makes.
 */

export const MOVE_IN_WELCOME_SWITCH = "move_in_welcome";
const WINDOW_DAYS = 7;
const GRACE_DAYS = 3;
const FROM_HOUR = 9;
const TO_HOUR = 18;
const LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const day = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

function addDays(isoDay: string, n: number): string {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const prettyDay = (isoDay: string) =>
  new Date(`${isoDay}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const months = (n: number) => `${WORDS[n] ?? String(n)} month${n === 1 ? "" : "s"}`;

/** The London day the switch was last turned on, or null when it is off or no row says. */
async function armedSince(): Promise<string | null> {
  const rows = await q<{ is_on: boolean; changed_at: Date | string }>(
    `SELECT is_on, changed_at FROM os_switches WHERE key = $1`,
    [MOVE_IN_WELCOME_SWITCH]
  ).catch(() => []);
  const r = rows[0];
  return r?.is_on ? london(new Date(r.changed_at)).date : null;
}

/**
 * The earliest and latest move-in the run welcomes. Off (held, or a dry run
 * before it is ever on) it reads as if switched on today, which is what a
 * dry run is asked: who would the first morning write to?
 */
export async function moveInWindow(now: Date): Promise<{ from: string; through: string; armedOn: string | null }> {
  const today = london(now).date;
  const armedOn = await armedSince();
  const byWindow = addDays(today, -WINDOW_DAYS);
  const bySwitch = addDays(armedOn ?? today, -GRACE_DAYS);
  return { from: byWindow > bySwitch ? byWindow : bySwitch, through: addDays(today, -1), armedOn };
}

type Agent = { user: OsUser | null; name: string; first: string; phone: string; email: string };

async function agentFor(p: ManagedProperty, cache: Map<string, Agent>): Promise<Agent> {
  const key = p.agent?.id || p.agent?.name || "";
  const held = cache.get(key);
  if (held) return held;
  const user = (p.agent?.id ? await findUserByRexId(p.agent.id).catch(() => null) : null) ?? (await userByName(p.agent?.name));
  const name = (user?.name || p.agent?.name || "").trim();
  /* Their own number, or the office's: never "ring us" with no number. */
  const own = user ? await agentPhone(user.id).catch(() => "") : "";
  const a: Agent = {
    user,
    name: name || "The Letting Experts",
    first: own && name ? firstName(name) : "the office",
    phone: own || OFFICE_PHONE,
    email: user?.email?.trim() || "Reply to this email",
  };
  cache.set(key, a);
  return a;
}

/** Each person once, by email; nobody without a usable one. */
function withEmails(people: (Party | null | undefined)[]): { name: string; email: string }[] {
  const seen = new Set<string>();
  const out: { name: string; email: string }[] = [];
  for (const x of people) {
    const raw = (x?.email ?? "").trim();
    if (!x || !validEmail(raw)) continue;
    const email = normaliseEmail(raw);
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name: x.name ?? "", email });
  }
  return out;
}

const addressOf = (p: ManagedProperty) => [p.name, p.locality].filter(Boolean).join(", ");

/** Has the book an earlier let of this home (or another room of its house) with this landlord on it? */
function landlordKnown(p: ManagedProperty, email: string, all: ManagedProperty[]): boolean {
  const house = houseKeyOf(addressOf(p));
  const since = p.letSince ?? "";
  return all.some((o) => {
    if (o === p || o.listingId === p.listingId) return false;
    const sameHome = (p.propertyId && o.propertyId === p.propertyId) || (house && houseKeyOf(addressOf(o)) === house);
    if (!sameHome) return false;
    if ((o.letSince ?? "") >= since && (o.moveIn ?? "") >= (p.moveIn ?? "")) return false;
    return [o.landlord, ...(o.otherLandlords ?? [])].some((l) => l?.email && normaliseEmail(l.email) === email);
  });
}

/**
 * The tenant's way in, made only on a real send: their tenant account if
 * they have none, the home tied to it in os_tenant_portal_homes so a repair
 * they report lands on the right home, and a single-use sign-in link for 14
 * days. The same three steps as Send out logins (lib/tenant-logins
 * sendLogins), kept beside it rather than through it because that one is a
 * press by a signed-in agent.
 */
async function tenantLink(p: ManagedProperty, t: { name: string; email: string }, agent: Agent): Promise<string> {
  await ensureTenantAccount({ email: t.email, name: t.name || t.email });
  await q(
    `INSERT INTO os_tenant_portal_homes (email, listing_id, property_id, name, property_name, locality, let_since, rent_pcm, agent_user_id, sent_by, sends)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Move-in welcome',0)
     ON CONFLICT (email, listing_id) DO NOTHING`,
    [t.email, String(p.listingId), p.propertyId, t.name, p.name, p.locality, p.moveIn ?? p.letSince, p.rentMonthly, agent.user?.id ?? null]
  );
  const { token } = await startVerification(t.email, "tenant", { ttlMs: LINK_TTL_MS });
  return `${SITE}/tenant/enter?token=${encodeURIComponent(token)}&next=/tenant/maintenance`;
}

/** Would a real customer at this address be written to right now? */
async function mayWrite(to: string): Promise<boolean> {
  if (isInternalAddress(to) && !sendingLocked()) return true;
  return switchOn("customer_email");
}

async function sendOne(
  out: ReminderResult[],
  dry: Dry,
  o: { key: string; emailId: string; to: string; toName: string; agent: Agent; would: string; render: () => Promise<{ subject: string; html: string }>; before?: () => Promise<void> }
) {
  if (await alreadyDone(o.key)) return;
  if (dryFor(dry, o.to)) {
    const { subject } = await o.render();
    out.push({ key: o.key, emailId: o.emailId, to: o.to, subject, state: "would", detail: o.would });
    return;
  }
  /* Customer email decides it BEFORE anything is made (as Send out logins
     does): off, no account, no tie and no sign-in link, and nothing logged,
     so the next hour tries again inside the window. */
  if (!(await mayWrite(o.to))) {
    out.push({ key: o.key, emailId: o.emailId, to: o.to, subject: "", state: "skipped", detail: "Email to landlords and tenants is switched off on Admin, Switches, so nothing was sent." });
    return;
  }
  /* Claim it, then send it: a second run finds the claim and leaves it. */
  if (!(await claim(o.key, o.emailId, o.to))) return;
  try {
    await o.before?.();
    const { subject, html } = await o.render();
    const r = await deliver({ agent: o.agent.user, to: o.to, toName: o.toName, subject, html });
    if (r.final) await logDone(o.key, o.emailId, o.to, r.sent ? "sent" : "refused", r.detail);
    else await release(o.key);
    out.push({ key: o.key, emailId: o.emailId, to: o.to, subject, state: r.sent ? "sent" : "failed", detail: r.detail });
  } catch (e) {
    await release(o.key);
    out.push({ key: o.key, emailId: o.emailId, to: o.to, subject: "", state: "failed", detail: e instanceof Error ? `Not sent: ${e.message}` : "Not sent." });
  }
}

/**
 * One pass. `forceDry` is the run's own ?dry=1: works everything out, sends
 * nothing and writes nothing, whatever the switch says.
 */
export async function moveInWelcomes(forceDry: boolean, now: Date, out: ReminderResult[]): Promise<void> {
  if (!hasDb()) return;
  const { hour } = london(now);
  if (hour < FROM_HOUR || hour >= TO_HOUR) return;
  const on = await switchOn(MOVE_IN_WELCOME_SWITCH);
  /* Off is "held": nothing goes, except to the people in ALWAYS_SEND_TO. */
  const dry: Dry = forceDry ? true : on ? false : "held";
  const { from, through } = await moveInWindow(now);

  const { book } = await managedBookFor(null);
  const all = book.properties.filter((p) => !p.test);
  const lets = sittingLets(all).filter((p) => {
    const moveIn = day(p.moveIn);
    return (
      MANAGED_HOME_SERVICES.has(p.service ?? "") &&
      Boolean(p.letRefs?.length) &&
      moveIn != null &&
      moveIn >= from &&
      moveIn <= through &&
      !p.notice &&
      !p.vacantSince
    );
  });
  if (!lets.length) return;

  const rules = await inspectionRules();
  const agents = new Map<string, Agent>();
  for (const p of lets) {
    const ref = p.letRefs![0];
    const moveIn = day(p.moveIn)!;
    const address = addressOf(p);
    if (isTestCase({ applicationRef: ref, address }) || (await isTestFile({ address }))) continue;
    const agent = await agentFor(p, agents);
    const base = { address, agentName: agent.name, agentFirst: agent.first, agentPhone: agent.phone, agentEmail: agent.email };

    /* The tenants as the book has them now. Where PayProp's running tenancy
       stands in for them and began well before this move-in, PayProp has
       not caught up with the let yet and they are the OLD tenants: nobody is
       welcomed to a home they are leaving. The next hour looks again. */
    const pp = day(p.tenantsFromPayProp?.startDate);
    const stalePayProp = Boolean(pp && p.tenantsFromPayProp?.replaced && pp < addDays(moveIn, -14));
    if (stalePayProp) {
      out.push({ key: `tenant-move-in-welcome:${ref}`, emailId: "tenant-move-in-welcome", to: "", subject: "", state: "skipped", detail: `${address}: the tenants on the book are from an earlier tenancy, so nobody was welcomed yet.` });
    } else {
      for (const t of withEmails(p.tenants)) {
        let link = `${SITE}/tenant/sign-in`;
        await sendOne(out, dry, {
          key: `tenant-move-in-welcome:${ref}:${t.email}`,
          emailId: "tenant-move-in-welcome",
          to: t.email,
          toName: t.name,
          agent,
          would: `Would welcome ${t.name || t.email} to ${address} (moved in ${moveIn}), from ${agent.name}.`,
          before: async () => {
            link = await tenantLink(p, t, agent);
          },
          render: () =>
            renderTleEmailLive("tenant-move-in-welcome", {
              ...base,
              firstName: firstName(t.name),
              link,
              signInLink: `${SITE.replace(/^https?:\/\//, "")}/tenant/sign-in`,
              signInHref: `${SITE}/tenant/sign-in?link=1`,
            }),
        });
      }
    }

    const homeKey = p.propertyId ? `p${p.propertyId}` : `l${p.listingId}`;
    for (const l of withEmails([p.landlord, ...(p.otherLandlords ?? [])])) {
      if (landlordKnown(p, l.email, all)) continue;
      await sendOne(out, dry, {
        key: `landlord-move-in-welcome:${homeKey}:${l.email}`,
        emailId: "landlord-move-in-welcome",
        to: l.email,
        toName: l.name,
        agent,
        would: `Would welcome ${l.name || l.email} to fully managed at ${address} (moved in ${moveIn}), from ${agent.name}.`,
        render: () =>
          renderTleEmailLive("landlord-move-in-welcome", {
            ...base,
            firstName: firstName(l.name),
            moveInPretty: prettyDay(moveIn),
            firstVisit: months(rules.firstAfterMonths),
            everyVisit: months(rules.thenEveryMonths),
            link: `${SITE}/landlord/sign-in`,
          }),
      });
    }
  }
}
