import "server-only";
import { hasDb, q } from "@/lib/db";
import { currentLets } from "@/lib/current-lets";
import { addrOf, isRoomAddress, norm } from "@/lib/address-parse";
import { ensureTenantAccount } from "@/lib/tenant-account";
import { startVerification } from "@/lib/verification";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { SITE } from "@/lib/email/tle-documents";
import { sendAsAgent } from "@/lib/send-as-agent";
import { isInternalAddress } from "@/lib/email-policy";
import { sendingLocked, switchOn } from "@/lib/switches";
import { agentPhone, OFFICE_PHONE } from "@/lib/agent-phone";
import { normaliseEmail, type OsUser } from "@/lib/users";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * SEND OUT LOGINS (Sean McMahon, agent call, 16 Oct 2026).
 *
 * Sean gets five to ten repair requests a week by phone and email. Fixflow
 * used to send every tenant their login, and tenants then reported repairs
 * themselves. This is that: the agent presses Send out logins on a home, or
 * reviews a list across their whole book first, and each sitting tenant with
 * an email gets "Your tenant account is ready" from the agent.
 *
 * ── What a send does, in order ────────────────────────────────────────────
 *
 *   1. makes a tenant account for the address if there is none (and leaves
 *      one that exists exactly as it is: ensureTenantAccount)
 *   2. ties the address to the home in os_tenant_portal_homes, so the portal
 *      knows their tenancy without a Propoly deal - which a sitting tenant
 *      never had - and a repair they report lands on the right home
 *   3. mints a single-use sign-in link that lasts 14 days (a tenant opens
 *      an email like this when they next have a repair, not the same day)
 *   4. sends it from the agent through sendAsAgent: their own Outlook with
 *      their footer where that is armed and connected, our sender otherwise
 *
 * No password, ever: after the link they sign in with their email (Email me
 * a link on /tenant/sign-in), which works because step 1 made the account.
 *
 * ── The brakes ──────────────────────────────────────────────────────────
 *
 * "Email to landlords and tenants" (customer_email) decides it, checked
 * BEFORE anything is written, so with it off nothing is made, tied or minted
 * and the answer says so. Our own addresses still go, for testing, unless
 * sending is locked. It is a press, not a timer, so the Automatic tenant
 * emails switch is not involved (the same rule as the passport thank-you).
 * Test homes are never sent.
 */

const LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginRow = {
  listingId: string;
  propertyId: string | null;
  home: string;
  locality: string;
  name: string;
  email: string | null;
  /** When this address was last sent a login for this home, if ever. */
  lastSentAt: string | null;
  sends: number;
};

/** Every sitting tenant on these homes, one row each, current lets only. */
export async function loginRows(homes: ManagedProperty[]): Promise<LoginRow[]> {
  const lets = sittingLets(homes.filter((h) => !h.test && h.tenants.length > 0));
  const sent = new Map<string, { at: string; sends: number }>();
  if (hasDb() && lets.length) {
    const rows = await q<{ email: string; listing_id: string; last_sent_at: Date | string; sends: number }>(
      `SELECT email, listing_id, last_sent_at, sends FROM os_tenant_portal_homes WHERE listing_id = ANY($1)`,
      [lets.map((h) => String(h.listingId))]
    ).catch(() => []);
    /* sends 0: tied to the home, but the email never went. */
    for (const r of rows) if (r.sends > 0) sent.set(`${r.email}|${r.listing_id}`, { at: new Date(r.last_sent_at).toISOString(), sends: r.sends });
  }
  const out: LoginRow[] = [];
  for (const h of lets) {
    const seen = new Set<string>();
    for (const t of h.tenants) {
      const email = t.email && EMAIL.test(t.email.trim()) ? normaliseEmail(t.email) : null;
      const k = email ?? `name:${t.name.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const s = email ? sent.get(`${email}|${h.listingId}`) : undefined;
      out.push({
        listingId: String(h.listingId),
        propertyId: h.propertyId,
        home: h.name,
        locality: h.locality,
        name: t.name,
        email,
        lastSentAt: s?.at ?? null,
        sends: s?.sends ?? 0,
      });
    }
  }
  return out;
}

/** The words for one tenant's login email: what the send fills in, and the preview shows. */
export async function loginVars(me: OsUser, home: { name: string; locality: string }, tenantName: string, link: string): Promise<Record<string, string>> {
  /* Their own number, or the office's: never "ring us" with no number. */
  const own = await agentPhone(me.id).catch(() => "");
  const first = (me.name || "").trim().split(/\s+/)[0] || "your agent";
  const ring = own ? `Ring ${first} on ${own}.` : `Ring the office on ${OFFICE_PHONE}.`;
  return {
    firstName: (tenantName || "").trim().split(/\s+/)[0] || "there",
    agentName: me.name || "The Letting Experts",
    address: [home.name, home.locality].filter(Boolean).join(", "),
    link,
    signInLink: `${SITE.replace(/^https?:\/\//, "")}/tenant/sign-in`,
    signInHref: `${SITE}/tenant/sign-in?link=1`,
    emergencyLine: `For an emergency, like a gas smell, a flood or no heating, please don't wait for a reply online. ${ring}`,
  };
}

/**
 * The lets whose tenants are living there now. currentLets keeps one let per
 * property, which drops the old tenants of a home re-let - but the rooms of a
 * shared house can sit on one REX property, and every room's tenant is a
 * sitting tenant. So a room whose address differs from the current let's is
 * kept too, newest per room.
 */
export function sittingLets(homes: ManagedProperty[]): ManagedProperty[] {
  const current = currentLets(homes);
  const keep = new Set(current);
  const rooms = new Map<string, ManagedProperty>();
  for (const h of homes) {
    if (keep.has(h) || !isRoomAddress(addrOf(h))) continue;
    const k = `${h.propertyId ?? h.listingId}|${norm(addrOf(h))}`;
    const cur = current.find((c) => c.propertyId && c.propertyId === h.propertyId);
    if (cur && norm(addrOf(cur)) === norm(addrOf(h))) continue;
    const held = rooms.get(k);
    if (!held || (h.letSince ?? "") > (held.letSince ?? "")) rooms.set(k, h);
  }
  for (const r of rooms.values()) keep.add(r);
  return homes.filter((h) => keep.has(h));
}

export type LoginResult = { listingId: string; email: string; name: string; sent: boolean; detail: string };

/** Would a real tenant at this address be written to right now? */
async function mayWrite(to: string): Promise<boolean> {
  if (isInternalAddress(to) && !sendingLocked()) return true;
  return switchOn("customer_email");
}

/**
 * Send one login per (home, address) asked for. `homes` is the sender's own
 * book, so an address can only be sent for a home it is a tenant on there.
 */
export async function sendLogins(p: {
  me: OsUser;
  homes: ManagedProperty[];
  picks: { listingId: string; email: string }[];
}): Promise<LoginResult[]> {
  const rows = await loginRows(p.homes);
  const byKey = new Map(rows.filter((r) => r.email).map((r) => [`${r.email}|${r.listingId}`, r]));
  const book = new Map(p.homes.map((h) => [String(h.listingId), h]));
  const out: LoginResult[] = [];

  for (const pick of p.picks.slice(0, 300)) {
    const email = normaliseEmail(pick.email ?? "");
    const row = byKey.get(`${email}|${String(pick.listingId)}`);
    const home = book.get(String(pick.listingId));
    if (!row || !home) {
      out.push({ listingId: String(pick.listingId), email, name: "", sent: false, detail: "Not a sitting tenant on a home in your book, so nothing was sent." });
      continue;
    }
    if (!(await mayWrite(email))) {
      out.push({ listingId: row.listingId, email, name: row.name, sent: false, detail: "Email to landlords and tenants is switched off on Admin, Switches, so nothing was sent." });
      continue;
    }
    try {
      await ensureTenantAccount({ email, name: row.name || email });
      await q(
        `INSERT INTO os_tenant_portal_homes (email, listing_id, property_id, name, property_name, locality, let_since, rent_pcm, agent_user_id, sent_by, sends)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0)
         ON CONFLICT (email, listing_id) DO UPDATE SET
           property_id = EXCLUDED.property_id, name = EXCLUDED.name, property_name = EXCLUDED.property_name,
           locality = EXCLUDED.locality, let_since = EXCLUDED.let_since, rent_pcm = EXCLUDED.rent_pcm,
           agent_user_id = EXCLUDED.agent_user_id, sent_by = EXCLUDED.sent_by`,
        [email, row.listingId, row.propertyId, row.name, home.name, home.locality, home.letSince, home.rentMonthly, p.me.id, p.me.name || p.me.email]
      );
      const { token } = await startVerification(email, "tenant", { ttlMs: LINK_TTL_MS });
      const { subject, html } = await renderTleEmailLive(
        "tenant-portal-login",
        await loginVars(p.me, home, row.name, `${SITE}/tenant/enter?token=${encodeURIComponent(token)}&next=/tenant/maintenance`)
      );
      const r = await sendAsAgent({ me: p.me, to: email, toName: row.name, subject, html });
      if (r.sent) {
        await q(`UPDATE os_tenant_portal_homes SET last_sent_at = NOW(), sends = sends + 1 WHERE email = $1 AND listing_id = $2`, [email, row.listingId]);
      }
      out.push({ listingId: row.listingId, email, name: row.name, sent: r.sent, detail: r.detail });
    } catch (e) {
      out.push({ listingId: row.listingId, email, name: row.name, sent: false, detail: e instanceof Error ? `Not sent: ${e.message}` : "Not sent." });
    }
  }
  return out;
}

/* ── The tenant portal side ─────────────────────────────────────────────── */

export type PortalHome = {
  listingId: string;
  propertyId: string | null;
  propertyName: string;
  locality: string;
  letSince: string | null;
  rentPcm: number | null;
  agentUserId: string | null;
};

/** The homes an agent has sent this address a login for. */
export async function portalHomesFor(rawEmail: string): Promise<PortalHome[]> {
  if (!hasDb()) return [];
  const rows = await q<{ listing_id: string; property_id: string | null; property_name: string; locality: string; let_since: string | null; rent_pcm: string | number | null; agent_user_id: string | null }>(
    `SELECT listing_id, property_id, property_name, locality, let_since, rent_pcm, agent_user_id FROM os_tenant_portal_homes
      WHERE email = $1 ORDER BY last_sent_at DESC`,
    [normaliseEmail(rawEmail)]
  );
  return rows.map((r) => ({
    listingId: r.listing_id,
    propertyId: r.property_id,
    propertyName: r.property_name,
    locality: r.locality,
    letSince: r.let_since,
    rentPcm: r.rent_pcm == null ? null : Number(r.rent_pcm),
    agentUserId: r.agent_user_id,
  }));
}
