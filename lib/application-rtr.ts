import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { followUpFor } from "@/lib/id-checks";
import { isScottish } from "@/lib/property-flags";
import { letPeople, type LetPeople } from "@/lib/let-people";
import type { OsUser } from "@/lib/users";

/**
 * A TENANT'S RIGHT TO RENT EXPIRY, ON THE LET (Kirstie Mulholland, 12 Oct 2026:
 * "how do I put in a tenants right to rent expiry date").
 *
 * The let's own right-to-rent answer is a yes or no, read from the REX notes or
 * the offer, with no date and nowhere to write one. The only dated record in
 * the OS is an ID check (os_id_checks), which needs the document or share code
 * result behind it and belongs to a person, not a let. So the date goes here,
 * beside the let's answer: until a date (and then the follow-up check owed,
 * worked out the way the ID checks work it out), or no time limit.
 *
 * Who may record one is who may open the let: lib/let-people's rule, the same
 * one the let's own page, its messages and its cancellation use - an agent
 * their own lets, the office and owners any. A Scottish let has no right to
 * rent (3475dd62) and is refused, on the same test the let's page uses to hide
 * the check.
 */

export interface RtrRecord {
  id: string;
  applicationId: string;
  tenant: string;
  tenantEmail: string;
  /** YYYY-MM-DD, or null with noTimeLimit. */
  rightUntil: string | null;
  noTimeLimit: boolean;
  followUpOn: string | null;
  by: string;
  at: string;
  /* Ticket 066bb29e (16 Oct 2026): the home it is on, whose list, and Kirstie's check. */
  listingId?: string | null;
  property?: string;
  agentName?: string;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

type Row = {
  id: string; application_id: string; tenant_name: string; tenant_email: string;
  right_until: Date | string | null; no_time_limit: boolean; follow_up_on: Date | string | null;
  recorded_by_name: string; recorded_at: Date; property?: string;
  listing_id?: string | null; agent_name?: string; verified_at?: Date | null; verified_by_name?: string;
};

const COLS = `id, application_id, tenant_name, tenant_email, property, right_until, no_time_limit, follow_up_on, recorded_by_name, recorded_at, listing_id, agent_name, verified_at, verified_by_name`;

/* A DATE comes back as local midnight: read in local parts (lib/id-checks). */
const day = (v: Date | string | null) =>
  v ? (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : String(v).slice(0, 10)) : null;

const shape = (r: Row): RtrRecord => ({
  id: r.id,
  applicationId: r.application_id,
  tenant: r.tenant_name,
  tenantEmail: r.tenant_email,
  rightUntil: day(r.right_until),
  noTimeLimit: r.no_time_limit,
  followUpOn: day(r.follow_up_on),
  by: r.recorded_by_name,
  at: new Date(r.recorded_at).toISOString(),
  listingId: r.listing_id ?? null,
  property: r.property ?? "",
  agentName: r.agent_name ?? "",
  verifiedAt: r.verified_at ? new Date(r.verified_at).toISOString() : null,
  verifiedBy: r.verified_by_name || null,
});

const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** The newest record for each tenant on a let. */
export async function rtrFor(applicationId: string): Promise<RtrRecord[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT DISTINCT ON (lower(tenant_name)) ${COLS}
       FROM os_application_rtr WHERE application_id = $1
      ORDER BY lower(tenant_name), recorded_at DESC`,
    [applicationId]
  );
  return rows.map(shape);
}

/** The let, if this person may record on it, and whether right to rent applies. */
export async function rtrLet(ref: string, me: OsUser): Promise<{ ok: true; let: LetPeople; scottish: boolean } | { ok: false; error: string }> {
  const r = await letPeople(ref, me);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, let: r.let, scottish: isScottish(r.let.locality, r.let.property) };
}

/** The tenant on the let a name points at - exact first, then a first name that only one of them has. */
export function tenantOn(l: LetPeople, said: string): LetPeople["tenants"][number] | null {
  const exact = l.tenants.find((t) => same(t.name, said) || (t.email && same(t.email, said)));
  if (exact) return exact;
  const first = said.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const byFirst = l.tenants.filter((t) => t.name.trim().split(/\s+/)[0]?.toLowerCase() === first);
  return byFirst.length === 1 ? byFirst[0] : l.tenants.length === 1 && !said.trim() ? l.tenants[0] : null;
}

/** Record it, having checked the let and the tenant again at the moment of saving. */
export async function recordRtr(
  ref: string,
  tenantName: string,
  until: string | null,
  noTimeLimit: boolean,
  me: OsUser,
  via: "steve" | "screen" = "steve"
): Promise<{ ok: true; record: RtrRecord; property: string } | { ok: false; error: string }> {
  if (!hasDb()) return { ok: false, error: "There's no database on this environment, so there's nowhere to keep it." };
  const got = await rtrLet(ref, me);
  if (!got.ok) return got;
  if (got.scottish) return { ok: false, error: "This is a Scottish let, and right to rent doesn't apply in Scotland, so there's no expiry to record." };
  const tenant = tenantOn(got.let, tenantName);
  if (!tenant) return { ok: false, error: `${tenantName || "That person"} isn't a tenant on this let.` };
  return insertRtr({
    applicationId: ref,
    listingId: got.let.listingId,
    property: `${got.let.property}${got.let.locality ? `, ${got.let.locality}` : ""}`,
    agentName: got.let.agentName ?? "",
    tenant: { name: tenant.name, email: tenant.email ?? "" },
    until, noTimeLimit, me, via,
  });
}

/** The date checked and kept: shared by a let and a sitting tenant on a home. */
async function insertRtr(p: {
  applicationId: string; listingId: string | null; property: string; agentName: string;
  tenant: { name: string; email: string }; until: string | null; noTimeLimit: boolean; me: OsUser; via: string;
}): Promise<{ ok: true; record: RtrRecord; property: string } | { ok: false; error: string }> {
  if (!p.noTimeLimit) {
    const until = p.until;
    if (!until || !/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(new Date(`${until}T12:00:00Z`).getTime())) return { ok: false, error: "That date didn't read. Give it as a day, month and year." };
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    if (until <= today) return { ok: false, error: "That date has already passed - a right to rent that has run out needs a fresh check, not an expiry date." };
  }
  const rightUntil = p.noTimeLimit ? null : p.until;
  const followUpOn = followUpFor(rightUntil);
  const id = uid();
  const by = p.me.name || p.me.email;
  await q(
    `INSERT INTO os_application_rtr (id, application_id, tenant_name, tenant_email, property, right_until, no_time_limit, follow_up_on, recorded_by, recorded_by_name, via, listing_id, agent_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, p.applicationId, p.tenant.name, p.tenant.email, p.property.slice(0, 200), rightUntil, p.noTimeLimit, followUpOn, p.me.id, by, p.via, p.listingId, p.agentName]
  );
  return {
    ok: true,
    property: p.property,
    record: {
      id, applicationId: p.applicationId, tenant: p.tenant.name, tenantEmail: p.tenant.email, rightUntil, noTimeLimit: p.noTimeLimit, followUpOn,
      by, at: new Date().toISOString(), listingId: p.listingId, property: p.property, agentName: p.agentName, verifiedAt: null, verifiedBy: null,
    },
  };
}

/**
 * A sitting tenant's right to rent on a home (ticket 066bb29e): the renewals
 * agents chase are mostly on homes already let. The route has checked the
 * home is in the person's book and given its tenants; recorded under
 * "home:<listing>" with the home's listing id.
 */
export async function recordRtrOnHome(
  home: { listingId: string; property: string; locality: string; agentName: string; tenants: { name: string; email: string | null }[] },
  tenantName: string,
  until: string | null,
  noTimeLimit: boolean,
  me: OsUser
): Promise<{ ok: true; record: RtrRecord; property: string } | { ok: false; error: string }> {
  if (!hasDb()) return { ok: false, error: "There's no database on this environment, so there's nowhere to keep it." };
  if (isScottish(home.locality, home.property)) return { ok: false, error: "This is a Scottish home, and right to rent doesn't apply in Scotland, so there's no expiry to record." };
  const tenant = home.tenants.find((t) => same(t.name, tenantName) || (t.email && same(t.email, tenantName)));
  if (!tenant) return { ok: false, error: `${tenantName || "That person"} isn't a tenant on this home.` };
  return insertRtr({
    applicationId: `home:${home.listingId}`,
    listingId: home.listingId,
    property: `${home.property}${home.locality ? `, ${home.locality}` : ""}`,
    agentName: home.agentName,
    tenant: { name: tenant.name, email: tenant.email ?? "" },
    until, noTimeLimit, me, via: "screen",
  });
}

/** The newest record for each tenant on a home, whether made on its let or on the home. */
export async function rtrForHome(listingId: string): Promise<RtrRecord[]> {
  if (!hasDb() || !listingId) return [];
  const rows = await q<Row>(
    `SELECT DISTINCT ON (lower(tenant_name)) ${COLS}
       FROM os_application_rtr WHERE listing_id = $1 OR application_id = $2
      ORDER BY lower(tenant_name), recorded_at DESC`,
    [listingId, `home:${listingId}`]
  );
  return rows.map(shape);
}

/** Kirstie's check (ticket 066bb29e: "I will need to verify all"). The office only; the route says who. */
export async function verifyRtr(id: string, me: OsUser): Promise<RtrRecord | null> {
  if (!hasDb() || !id) return null;
  const rows = await q<Row>(
    `UPDATE os_application_rtr SET verified_at = NOW(), verified_by = $2, verified_by_name = $3 WHERE id = $1 AND verified_at IS NULL RETURNING ${COLS}`,
    [id, me.id, me.name || me.email]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function rtrById(id: string): Promise<RtrRecord | null> {
  if (!hasDb() || !id) return null;
  const rows = await q<Row>(`SELECT ${COLS} FROM os_application_rtr WHERE id = $1`, [id]);
  return rows[0] ? shape(rows[0]) : null;
}

/**
 * The list to chase from: the newest record per tenant per home, an agent's
 * own (by the let's agent) or everybody's for the office. Kept to dates that
 * still matter: no time limit is listed only while it waits for Kirstie.
 */
export async function rtrChaseList(me: OsUser, office: boolean): Promise<RtrRecord[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT * FROM (
       SELECT DISTINCT ON (coalesce(listing_id, application_id), lower(tenant_name)) ${COLS}
         FROM os_application_rtr ORDER BY coalesce(listing_id, application_id), lower(tenant_name), recorded_at DESC
     ) latest
     WHERE ($1 OR lower(agent_name) = lower($2))
       AND (right_until IS NOT NULL OR verified_at IS NULL)
     ORDER BY (verified_at IS NULL) DESC, right_until NULLS LAST`,
    [office, me.name ?? ""]
  );
  return rows.map(shape);
}

/** Follow-up checks owed within `days`, newest record per tenant only - for the office's bell. */
export async function rtrFollowUpsDue(days = 28): Promise<(RtrRecord & { property: string })[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT * FROM (
       SELECT DISTINCT ON (application_id, lower(tenant_name)) ${COLS}
         FROM os_application_rtr ORDER BY application_id, lower(tenant_name), recorded_at DESC
     ) latest
     WHERE follow_up_on IS NOT NULL AND follow_up_on <= (NOW() AT TIME ZONE 'Europe/London')::date + $1::int
     ORDER BY follow_up_on`,
    [days]
  ).catch(() => [] as Row[]);
  return rows.map((r) => ({ ...shape(r), property: r.property ?? "" }));
}
