import "server-only";
import { getApplications, type Application } from "@/lib/applications";

/**
 * Who is actually living in each home.
 *
 * ── Why this is not read off the listing ──────────────────────────────────
 *
 * The listing's contact relationships carry the landlord reliably and the
 * tenant hardly ever: 40 of 264 homes on the compliance book, measured 7 Sep
 * 2026. REX keeps the real property-landlord-tenant link on a
 * TenancyApplication instead - which is exactly what lib/tenancy-link writes
 * when the OS makes one - so that is where the sitting tenant is.
 *
 * ── The rule, and why it is careful ───────────────────────────────────────
 *
 * An accepted application is not proof somebody is in the property today. A
 * tenancy that ended two years ago still reads accepted, and a home can
 * carry several accepted applications for different people across
 * successive lets. Naming the wrong person on the screen an engineer rings
 * to get through a door is worse than naming nobody.
 *
 * So (James, 7 Sep 2026): the most recent ACCEPTED application per property,
 * and only where the tenancy has not already run its term. An application
 * with no agreement length is treated as still running - a fixed term that
 * has lapsed usually rolls to a periodic tenancy with the same people in it,
 * so the length is a floor on how long they stay, never a ceiling.
 */

export interface TenantParty {
  contactId: string;
  name: string;
  email: string;
  phone: string;
}

export interface SittingTenants {
  /** The people, in the shape the managed book already uses for a party. */
  people: TenantParty[];
  names: string[];
  /** When their tenancy began, so a screen can show how sure this is. */
  startDate: string | null;
  /** True once the fixed term is behind us: probably periodic, possibly gone. */
  pastTerm: boolean;
}

const ACCEPTED = new Set(["accepted"]);

/** REX pages at 100 and the book is a few hundred; 1000 is headroom, not a guess. */
const MAX = 1000;

/**
 * One walk, shared.
 *
 * Both books ask for this - the compliance book once, the managed book once
 * per agent scope - and the answer is the same every time because a tenant
 * is a tenant whoever listed the home. Without this, five agents opening
 * Portfolio would be five walks of the same service.
 */
const TTL_MS = 30 * 60 * 1000;
let held: { at: number; map: Map<string, SittingTenants> } | null = null;
let inflight: Promise<Map<string, SittingTenants>> | null = null;

function ended(a: Application): { end: number | null; pastTerm: boolean } {
  if (!a.startDate) return { end: null, pastTerm: false };
  const start = new Date(a.startDate).getTime();
  if (!Number.isFinite(start)) return { end: null, pastTerm: false };
  if (!a.agreementMonths) return { end: null, pastTerm: false };
  const d = new Date(start);
  d.setMonth(d.getMonth() + a.agreementMonths);
  return { end: d.getTime(), pastTerm: d.getTime() < Date.now() };
}

/**
 * propertyId → who is in it. Only homes we can answer for appear; a missing
 * key means "we do not know", never "empty".
 */
export async function sittingTenantsByProperty(): Promise<Map<string, SittingTenants>> {
  if (held && Date.now() - held.at < TTL_MS) return held.map;
  if (!inflight) {
    inflight = walk().finally(() => { inflight = null; });
  }
  return inflight;
}

async function walk(): Promise<Map<string, SittingTenants>> {
  const out = new Map<string, SittingTenants>();
  const apps = await getApplications(MAX, null).catch(() => [] as Application[]);

  /* Newest accepted wins. Sorted by start date, falling back to the id,
     which climbs, so a property with two accepted lets keeps the later. */
  const accepted = apps
    .filter((a) => a.propertyId && ACCEPTED.has(a.status) && a.applicants.some((t) => t.name))
    .sort((x, y) => {
      const dx = x.startDate ? new Date(x.startDate).getTime() : 0;
      const dy = y.startDate ? new Date(y.startDate).getTime() : 0;
      if (dx !== dy) return dx - dy;
      return Number(x.id) - Number(y.id);
    });

  for (const a of accepted) {
    const { pastTerm } = ended(a);
    /* The rule: a tenancy that has run its term is not claimed as current. */
    if (pastTerm) { out.delete(a.propertyId as string); continue; }
    const people: TenantParty[] = a.applicants
      .filter((t) => t.name && t.name !== "Name not recorded")
      .map((t) => ({ contactId: t.contactId ?? "", name: t.name, email: t.email ?? "", phone: t.phone ?? "" }));
    out.set(a.propertyId as string, { people, names: people.map((t) => t.name), startDate: a.startDate, pastTerm });
  }
  for (const [k, v] of out) if (v.people.length === 0) out.delete(k);
  held = { at: Date.now(), map: out };
  return out;
}
