import "server-only";
import { hasDb, q } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { currentLets } from "@/lib/current-lets";
import { findUserByRexId } from "@/lib/users";
import { sendEmail } from "@/lib/resend";
import { proseEmail } from "@/lib/email/prose";
import { ALWAYS_SEND_TO, switchOn } from "@/lib/switches";
import { current, lastDueDate, matchHome, rentBook } from "@/lib/rent-status";

/**
 * RENT 48 HOURS BEHIND: THE AGENT HEARS (James, 8 Oct 2026).
 *
 * "When they go 48 hours behind a payment, we should send the agent a nudge
 * to say, Hey, I hope all is well. Just to let you know, this property is
 * falling behind on their rent. We've sent them a gentle reminder email.
 * There's nothing you need to action. This is more for your records."
 *
 * The tenant's reminder is PayProp's, from Michael's set-up - the OS never
 * emails the tenant. This only tells the home's agent (their REX agent's OS
 * account), or Howard when the home has none.
 *
 * Run from the scheduled-sends cron, at most once an hour, weekdays 8am to
 * 6pm London. A tenant counts when they still owe at least £1 and the rent
 * day passed at least 48 hours ago - and only rent days in the last 10 days,
 * so switching it on does not email every agent about every old debt at once.
 * Once per tenant per rent day (os_rent_nudges). Off in code until
 * RENT_NUDGES_FROM is set, then behind the "Rent behind: tell the agent"
 * switch for everyone - Howard is NOT sent these while it is off.
 */

const DAY = 86_400_000;

/**
 * OFF, IN CODE (James, 8 Oct 2026: "they should not go out under any
 * circumstances. They're not ready to go out yet."). While this is null
 * nothing is sent to anybody - not with the switch on, and not to Howard,
 * who otherwise gets every switch's emails. Two went to him on 8 Oct before
 * this was here. Going live is a code change: set it to the day they start,
 * "YYYY-MM-DD", and only rent days from that day on are ever told.
 */
export const RENT_NUDGES_FROM: string | null = null;

function londonParts(now = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { weekday: g("weekday"), hour: Number(g("hour")), stamp: `${g("year")}-${g("month")}-${g("day")}T${g("hour")}` };
}

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const dayWords = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export async function runRentNudges(origin: string, opts: { force?: boolean } = {}): Promise<{ checked: number; sent: number; held: number; skipped?: string; failed: string[] }> {
  const out = { checked: 0, sent: 0, held: 0, failed: [] as string[] };
  if (!hasDb()) return { ...out, skipped: "no database" };
  if (!RENT_NUDGES_FROM) return { ...out, skipped: "not live - nothing is sent until RENT_NUDGES_FROM is set" };
  const t = londonParts();
  if (!opts.force) {
    if (t.weekday === "Sat" || t.weekday === "Sun" || t.hour < 8 || t.hour >= 18) return { ...out, skipped: "outside working hours" };
    /* Once an hour, however often the cron calls. */
    const claimed = await q<{ key: string }>(`INSERT INTO os_rent_nudges (key, outcome) VALUES ($1, 'run') ON CONFLICT (key) DO NOTHING RETURNING key`, [`run|${t.stamp}`]).catch(() => []);
    if (!claimed.length) return { ...out, skipped: "already checked this hour" };
  }

  const book = await rentBook({ wait: true });
  if (!book) return { ...out, skipped: "PayProp couldn't be read" };
  const { book: homes } = await managedBookFor(null);
  const armed = await switchOn("rent_nudges");
  const now = Date.now();
  const base = origin.replace(/\/+$/, "");

  for (const home of currentLets(homes.properties)) {
    const hit = matchHome(book, { name: home.name, address: home.address, postcode: home.postcode });
    if (typeof hit === "string") continue;
    for (const tenant of book.balances.filter((b) => b.account === hit.account && b.propertyId === hit.id && current(b))) {
      out.checked++;
      if (tenant.owed < 1) continue;
      const dueOn = tenant.paymentDay ? lastDueDate(tenant.paymentDay) : tenant.lastInvoice?.slice(0, 10) ?? null;
      if (!dueOn) continue;
      const due = new Date(`${dueOn}T00:00:00Z`).getTime();
      if (now - due < 2 * DAY || now - due > 10 * DAY) continue;
      /* ONLY NEWLY BEHIND (James, 8 Oct 2026): "only new properties moving
         forwards ... not properties that are already behind". A rent day
         before going live is never told; nor is a tenant owing more than this
         one rent, who was behind already. */
      if (dueOn < RENT_NUDGES_FROM) continue;
      if (tenant.rent && tenant.owed > tenant.rent + 1) continue;
      /* A tenancy that had not started by the rent day owes nothing yet. */
      if (tenant.tenancyStart && tenant.tenancyStart.slice(0, 10) > dueOn) continue;

      const agent = home.agent?.id ? await findUserByRexId(home.agent.id).catch(() => null) : null;
      const to = agent?.email ?? ALWAYS_SEND_TO[0];
      /* The switch as well, for every recipient - Howard included. */
      if (!armed) {
        out.held++;
        continue;
      }
      const key = `${hit.account}|${hit.id}|${tenant.tenantId || tenant.tenant}|${dueOn}`;
      const fresh = await q<{ key: string }>(
        `INSERT INTO os_rent_nudges (key, listing_id, address, tenant, owed, due_on, sent_to, outcome) VALUES ($1,$2,$3,$4,$5,$6,$7,'sending')
         ON CONFLICT (key) DO NOTHING RETURNING key`,
        [key, String(home.listingId), home.name, tenant.tenant, tenant.owed, dueOn, to]
      ).catch(() => []);
      if (!fresh.length) continue;

      const first = (agent?.name ?? "").trim().split(/\s+/)[0] || "there";
      const address = [home.name, home.locality].filter(Boolean).join(", ");
      const body = [
        `Hi ${first},`,
        `I hope all is well. Just to let you know, ${address} is falling behind on the rent: ${tenant.tenant} is ${gbp(tenant.owed)} behind, with rent due on ${dayWords(dueOn)}.`,
        `We've sent them a gentle reminder email. There's nothing you need to action - this is more for your records.`,
        `See the home: ${base}/portfolio/${encodeURIComponent(String(home.listingId))}`,
      ].join("\n\n");
      try {
        await sendEmail({ to, subject: `Rent behind at ${home.name}`, html: proseEmail(body), audience: "internal" });
        await q(`UPDATE os_rent_nudges SET outcome = 'sent' WHERE key = $1`, [key]).catch(() => null);
        out.sent++;
      } catch (e) {
        /* Not sent: let the next hour try again. */
        await q(`DELETE FROM os_rent_nudges WHERE key = $1`, [key]).catch(() => null);
        out.failed.push(`${home.name}: ${e instanceof Error ? e.message : "did not send"}`);
      }
    }
  }
  return out;
}
