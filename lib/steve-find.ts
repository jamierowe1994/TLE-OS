import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { can } from "@/lib/roles";
import type { OsUser } from "@/lib/users";
import type { Scope } from "@/lib/scope";
import { sealPayload, openPayload } from "@/lib/auth";
import { record as audit } from "@/lib/audit";
import { isPreTenancyEmail } from "@/lib/business/brand";
import { managedBookFor, forgetBooks } from "@/lib/managed-book-cache";
import { bookFor } from "@/lib/listings-cache";
import { landlordsOfHome, type HomeLandlord } from "@/lib/landlords-for-home";
import { recordRowsFor, isRecordLandlord } from "@/lib/record-landlords";
import { payPropOwnerFor } from "@/lib/landlord-home";
import { payPropContacts, samePerson } from "@/lib/business/payprop-tenant-contacts";
import { rentKey } from "@/lib/business/payprop-portfolio";
import { getAllPropolyDeals, type BusinessDeal } from "@/lib/business/propoly-deals";
import { ensureTenantContacts, nameKey, saveTenantContact } from "@/lib/tenant-contacts";
import { saveOverrides, overridesFor } from "@/lib/home-overrides";
import { changedLandlordFor, saveChange, undoChange } from "@/lib/landlord-change";
import { recordOn } from "@/lib/report-deflect";
import { SOURCE_ADMIN, SOURCE_SAYS, type FindAnswer, type FindSource, type FindWho, type FoundPerson } from "@/lib/steve-find-shared";
import type { ManagedProperty, Party } from "@/lib/portfolio-types";

/**
 * STEVE FINDS WHAT'S MISSING - the server half. What it is for, and James's
 * rules for it, are in lib/steve-find-shared.
 *
 * WHERE HE LOOKS, for a home on Portfolio:
 *   landlord  everyone the one landlord reader knows (lib/landlords-for-home:
 *             the listing's and the property's owners in REX, an OS change,
 *             the appraisal, the record), the same home's other let in the
 *             OS's book (a home can stand in two agents' books, one as its REX
 *             listing and one as its REX PM record: Flat 3B, 37 Union Street,
 *             24 Nov 2026, where the record had the company's name and the
 *             listing had their email and mobile), PayProp's owner by that
 *             name, and the landlord on the home's Propoly deal
 *   tenants   the same home's other let (same name only), PayProp's current
 *             tenancy at the address, and the tenants on the home's Propoly
 *             deal (the newest one that wasn't cancelled)
 * and for a listing, its landlord only, from its Propoly deal, when the one
 * reader finds nobody at all.
 *
 * WHAT HE WILL SAY YES TO: one person per gap, and only when every place
 * that names somebody names the SAME person. Two different landlords, or a
 * tenant two places spell differently, and he finds "nothing he can be sure
 * of" - the report goes to James. A wrong person reached Propoly once
 * (10 Thornton Road, 19 Nov 2026); a blank is safer than a guess.
 *
 * WHERE YES IS KEPT (all OS, blanks only):
 *   a home's landlord      the home's record (os_properties.landlord_*), as
 *                          Add the landlord does; only when the landlord the
 *                          home shows IS the record's, or there is none
 *   a REX PM tenant        os_tenant_contacts, as the tenant's own card does
 *   a home with no tenant  the home's Edit ("who lives here", os_home_overrides)
 *   a listing's landlord   Add the landlord (os_landlord_changes)
 * A tenant held as a REX contact with no email is left for James: the only
 * way to change one is a REX write.
 *
 * Every yes is a row in os_steve_fills with what was there before, so James
 * can see them all on Admin > Tickets and undo any.
 */

/* ── Who may use it ─────────────────────────────────────────────────────── */

/** James, 24 Nov 2026: "they can only fix files that are in their name, unless it's Michael or Kirsty." */
export const DEFAULT_ANY_HOME = ["michael.healy@thelettingexperts.co.uk", "kirstie.mulholland@thelettingexperts.co.uk"];
const ANY_KEY = "steve_find_any_home";

export async function findsAnyHome(user: Pick<OsUser, "email" | "role">): Promise<boolean> {
  if (can(user.role, "admin:open")) return true;
  const e = (user.email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (isPreTenancyEmail(e)) return true;
  let list = DEFAULT_ANY_HOME;
  if (hasDb()) {
    const rows = await q<{ value: { emails?: unknown } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [ANY_KEY]).catch(() => []);
    const saved = Array.isArray(rows[0]?.value?.emails) ? (rows[0]!.value!.emails as unknown[]).map((x) => String(x).trim().toLowerCase()).filter(Boolean) : [];
    if (saved.length) list = saved;
  }
  return list.includes(e);
}

/* ── The log ────────────────────────────────────────────────────────────── */

let ready: Promise<void> | null = null;
function ensure(): Promise<void> {
  ready ??= q(`
    CREATE TABLE IF NOT EXISTS os_steve_fills (
      id          TEXT PRIMARY KEY,
      at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      by_id       TEXT NOT NULL,
      by_email    TEXT NOT NULL,
      by_name     TEXT NOT NULL,
      record_kind TEXT NOT NULL,
      record_id   TEXT NOT NULL,
      home        TEXT NOT NULL,
      who         TEXT NOT NULL,
      name        TEXT NOT NULL,
      added       JSONB NOT NULL,
      source      TEXT NOT NULL,
      target      JSONB NOT NULL,
      was         JSONB,
      undone_at   TIMESTAMPTZ,
      undone_by   TEXT
    );
    CREATE INDEX IF NOT EXISTS os_steve_fills_at ON os_steve_fills (at DESC);
  `).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/* ── What a yes writes ──────────────────────────────────────────────────── */

type Target =
  | { kind: "record-landlord"; propertyId: string }
  | { kind: "tenant-contact"; osPropertyId: string; recordName: string }
  | { kind: "home-tenants"; propertyId: string | null; listingId: string }
  | { kind: "listing-landlord"; listingId: string; propertyId: string | null; address: string };

type Plan = FoundPerson & { target: Target };

/* ── Reading ────────────────────────────────────────────────────────────── */

const tidy = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");
const lowerEmail = (s: unknown) => tidy(s).toLowerCase() || null;
const isEmail = (s: string | null) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPhone = (s: string | null) => !!s && /^[+\d][\d\s()-]{6,}$/.test(s);

/** A company's name, as two places write it: "Example Homes Ltd", "EXAMPLE HOMES LIMITED". */
function companyKey(s: string): string {
  return s.toLowerCase().replace(/\b(?:ltd|limited|llp|plc|co|company)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function sameName(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ca = companyKey(a);
  if (ca && ca === companyKey(b)) return true;
  return samePerson(a, b);
}

type Seen = { name: string; email: string | null; phone: string | null; source: FindSource };

/** The newest deal on any of these listings that wasn't cancelled, from the held Propoly book. */
async function dealFor(listingIds: string[]): Promise<BusinessDeal | null> {
  const ids = new Set(listingIds.filter((x) => /^\d+$/.test(x)));
  if (!ids.size) return null;
  const deals = await getAllPropolyDeals().catch(() => null);
  const hits = (deals ?? [])
    .filter((d) => d.app.listingId && ids.has(String(d.app.listingId)) && !/cancel/i.test(d.statusKey))
    .sort((a, b) => String(b.app.startDate ?? "").localeCompare(String(a.app.startDate ?? "")));
  return hits[0] ?? null;
}

const landlordSource = (l: HomeLandlord): FindSource => (l.from === "listing" || l.from === "property" ? "rex" : l.from === "record" ? "record" : "os");

/**
 * One landlord to offer, or why not. `known` is the name the home already
 * shows, if any: every place must agree with it, or with each other.
 */
function pickLandlord(known: Party | null, seen: Seen[], needs: Array<"name" | "email" | "phone">): { person: Omit<FoundPerson, "who"> } | { why: string } | null {
  const useful = seen.filter((s) => s.name && (isEmail(s.email) || isPhone(s.phone)));
  if (!useful.length) return null;
  const name = known?.name || useful[0].name;
  const agree = useful.filter((s) => sameName(s.name, name));
  const other = useful.filter((s) => !sameName(s.name, name));
  if (!agree.length || (!known && other.length)) return { why: "Two different landlords are named for this home, so I didn't pick one." };
  const email = known?.email ? null : agree.find((s) => isEmail(s.email))?.email ?? null;
  const phone = known?.phone ? null : agree.find((s) => isPhone(s.phone))?.phone ?? null;
  const adds = needs.filter((n) => (n === "name" ? !known : n === "email" ? !!email : !!phone));
  if (!adds.some((a) => a !== "name")) return null;
  const from = agree.find((s) => (email && s.email === email) || (phone && s.phone === phone)) ?? agree[0];
  return { person: { name: known?.name || from.name, email: email ?? known?.email ?? null, phone: phone ?? known?.phone ?? null, adds, source: from.source } };
}

async function landlordOfHome(p: ManagedProperty, siblings: ManagedProperty[], looked: Set<string>): Promise<Plan | { why: string } | null> {
  if (!p.propertyId) return null;
  if (p.landlord?.email && p.landlord.phone) return null;
  looked.add("the home's file").add("the home's own record");
  /* The landlord the home's page shows is the one reader's (HomeLandlords), which can name somebody the book doesn't. */
  const one = await landlordsOfHome({ listingId: /^\d+$/.test(p.listingId) ? p.listingId : null, propertyId: p.propertyId }).catch(() => null);
  const shown = one?.ok ? one.landlords.find((l) => l.from !== "joint") ?? null : null;
  if (shown?.email && shown.phone) return null;
  const known: Party | null = shown ? { contactId: shown.contactId ?? shown.key, name: shown.name, email: shown.email, phone: shown.phone } : p.landlord;
  /* A landlord REX holds as a contact is changed on their card (a REX write), never here. */
  if (known && !isRecordLandlord(known.contactId) && /^\d+$/.test(known.contactId)) return null;
  if (shown && (shown.from === "changed" || shown.from === "appraisal")) return null;
  const needs: Array<"name" | "email" | "phone"> = known ? (["email", "phone"] as const).filter((k) => !known[k]) : ["name", "email", "phone"];
  const seen: Seen[] = [];
  if (shown) seen.push({ name: shown.name, email: lowerEmail(shown.email), phone: tidy(shown.phone) || null, source: landlordSource(shown) });
  for (const s of siblings) if (s.landlord) seen.push({ name: s.landlord.name, email: lowerEmail(s.landlord.email), phone: tidy(s.landlord.phone) || null, source: "rex" });

  looked.add("PayProp");
  const name = known?.name || seen[0]?.name;
  if (name) {
    const owner = await payPropOwnerFor({ name, email: known?.email ?? null }).catch(() => null);
    if (owner?.email) seen.push({ name, email: owner.email, phone: null, source: "payprop" });
  }

  looked.add("Propoly");
  const deal = await dealFor([p.listingId, ...siblings.map((s) => s.listingId)]);
  const dl = deal?.app.propoly?.landlords?.[0] ?? deal?.app.propoly?.landlord ?? null;
  if (dl?.name) seen.push({ name: tidy(dl.name), email: lowerEmail(dl.email), phone: tidy(dl.phone) || null, source: "propoly" });

  const pick = pickLandlord(known, seen, needs);
  if (!pick || "why" in pick) return pick;
  const rows = await recordRowsFor(p.propertyId);
  if (!rows.length) return { why: "I found them, but this home has no file of its own in the OS to keep them on yet." };
  return { who: "landlord", ...pick.person, target: { kind: "record-landlord", propertyId: p.propertyId } };
}

async function tenantsOfHome(p: ManagedProperty, siblings: ManagedProperty[], looked: Set<string>): Promise<{ plans: Plan[]; why: string | null }> {
  const seen: Seen[] = [];
  /* Only the same home's other let when it is no older than this one: an older let's tenants have moved out. */
  for (const s of siblings) {
    if (p.letSince && s.letSince && s.letSince < p.letSince) continue;
    for (const t of s.tenants) seen.push({ name: t.name, email: lowerEmail(t.email), phone: tidy(t.phone) || null, source: "rex" });
  }
  looked.add("PayProp");
  const key = rentKey(p.name, p.postcode);
  const pp = key ? (await payPropContacts().catch(() => new Map())).get(key) ?? [] : [];
  for (const r of pp) {
    const name = r.lead ? tidy(`${r.lead.first} ${r.lead.last}`) : tidy(r.display);
    if (name) seen.push({ name, email: lowerEmail(r.email), phone: tidy(r.phone) || null, source: "payprop" });
  }
  looked.add("Propoly");
  const deal = await dealFor([p.listingId, ...siblings.map((s) => s.listingId)]);
  for (const t of deal?.app.tenants ?? []) seen.push({ name: tidy(t.name), email: lowerEmail(t.email), phone: tidy(t.phone) || null, source: "propoly" });

  const plans: Plan[] = [];
  /* Nobody named: a household only one place names, all of it. */
  if (!p.tenants.length) {
    const bySource = new Map<FindSource, Seen[]>();
    for (const s of seen) if (s.name && (isEmail(s.email) || isPhone(s.phone))) bySource.set(s.source, [...(bySource.get(s.source) ?? []), s]);
    const households = [...bySource.values()];
    if (!households.length) return { plans, why: null };
    const first = households[0];
    const agrees = households.every((h) => h.length === first.length && h.every((x) => first.some((f) => samePerson(f.name, x.name))));
    if (!agrees) return { plans, why: "Different tenants are named for this home in different places, so I didn't pick." };
    for (const t of first)
      plans.push({ who: "tenant", name: t.name, email: isEmail(t.email) ? t.email : null, phone: isPhone(t.phone) ? t.phone : null, adds: ["name", ...(isEmail(t.email) ? (["email"] as const) : []), ...(isPhone(t.phone) ? (["phone"] as const) : [])], source: t.source, target: { kind: "home-tenants", propertyId: p.propertyId, listingId: p.listingId } });
    return { plans, why: null };
  }

  let why: string | null = null;
  for (const t of p.tenants) {
    if (t.email && t.phone) continue;
    const pm = /^rexpm:([^:]+):\d+$/.exec(String(t.contactId ?? ""));
    const mine = seen.filter((s) => samePerson(s.name, t.name) && (isEmail(s.email) || isPhone(s.phone)));
    if (!mine.length) continue;
    const emails = new Set(mine.map((m) => m.email).filter(isEmail));
    const phones = new Set(mine.map((m) => (m.phone ?? "").replace(/\D/g, "")).filter(Boolean));
    if (emails.size > 1 || phones.size > 1) {
      why = `${t.name} has different details in different places, so I didn't pick.`;
      continue;
    }
    const email = t.email ? null : [...emails][0] ?? null;
    const phone = t.phone ? null : mine.find((m) => isPhone(m.phone))?.phone ?? null;
    if (!email && !phone) continue;
    if (!pm) {
      why ??= `I found ${t.name}'s details, but they're kept on their contact, which I can't change. James will add them.`;
      continue;
    }
    const from = mine.find((m) => m.email === email || m.phone === phone) ?? mine[0];
    plans.push({
      who: "tenant",
      name: t.name,
      email: email ?? t.email ?? null,
      phone: phone ?? t.phone ?? null,
      adds: [...(email ? (["email"] as const) : []), ...(phone ? (["phone"] as const) : [])],
      source: from.source,
      target: { kind: "tenant-contact", osPropertyId: pm[1], recordName: t.recordName || t.name },
    });
  }
  return { plans, why };
}

/* ── The look ───────────────────────────────────────────────────────────── */

type Sealed = { v: 1; by: string; path: string; plans: Plan[] };

async function plansFor(user: OsUser, scope: Scope, path: string, who: FindWho | null): Promise<{ answer: FindAnswer; plans: Plan[] }> {
  const record = recordOn(path);
  const id = decodeURIComponent(path.split("/")[2] ?? "");
  if (!record || record === "let" || !id) return { answer: { state: "error", error: "Steve can only look for people on a home or a listing." }, plans: [] };
  const any = await findsAnyHome(user);
  if (!any && scope.unlinked) return { answer: { state: "not-yours" }, plans: [] };
  const rexUserId = any ? null : scope.rexUserId;
  const looked = new Set<string>();

  if (record === "home") {
    const own = (await managedBookFor(rexUserId)).book.properties;
    const p = own.find((x) => String(x.listingId) === id);
    if (!p) return { answer: { state: "not-yours" }, plans: [] };
    const whole = rexUserId === null ? own : (await managedBookFor(null)).book.properties;
    const siblings = p.propertyId ? whole.filter((x) => x.propertyId === p.propertyId && x.listingId !== p.listingId).sort((a, b) => String(b.letSince ?? "").localeCompare(String(a.letSince ?? ""))) : [];
    const plans: Plan[] = [];
    const whys: string[] = [];
    if (who !== "tenant") {
      const l = await landlordOfHome(p, siblings, looked);
      if (l && "why" in l) whys.push(l.why);
      else if (l) plans.push(l);
    }
    if (who !== "landlord") {
      const t = await tenantsOfHome(p, siblings, looked);
      plans.push(...t.plans);
      if (t.why) whys.push(t.why);
    }
    const home = p.name;
    const complete = !plans.length && !whys.length && (who === "tenant" || !!(p.landlord?.email && p.landlord?.phone)) && (who === "landlord" || (p.tenants.length > 0 && p.tenants.every((t) => t.email && t.phone)));
    if (complete) return { answer: { state: "complete", home }, plans };
    if (!plans.length) return { answer: { state: "none", home, looked: [...looked], why: whys[0] ?? "" }, plans };
    return { answer: { state: "found", home, people: plans.map(({ target: _t, ...rest }) => rest), token: sealPayload({ v: 1, by: user.id, path, plans } satisfies Sealed), looked: [...looked] }, plans };
  }

  /* A listing: its landlord, when nobody at all is named. */
  const listing = (await bookFor(rexUserId)).listings.find((l) => String(l.id) === id);
  if (!listing) return { answer: { state: "not-yours" }, plans: [] };
  const home = `${listing.name}`;
  const now = await landlordsOfHome({ listingId: id, propertyId: listing.propertyId ? String(listing.propertyId) : null }, { fromTerms: true }).catch(() => null);
  if (now?.ok && now.landlords.length) return { answer: { state: "complete", home }, plans: [] };
  looked.add("the home's file").add("Propoly");
  const deal = await dealFor([id]);
  const dl = deal?.app.propoly?.landlords?.[0] ?? deal?.app.propoly?.landlord ?? null;
  const email = lowerEmail(dl?.email);
  const phone = tidy(dl?.phone) || null;
  if (!dl?.name || (!isEmail(email) && !isPhone(phone))) return { answer: { state: "none", home, looked: [...looked], why: "" }, plans: [] };
  const plan: Plan = {
    who: "landlord",
    name: tidy(dl.name),
    email: isEmail(email) ? email : null,
    phone: isPhone(phone) ? phone : null,
    adds: ["name", ...(isEmail(email) ? (["email"] as const) : []), ...(isPhone(phone) ? (["phone"] as const) : [])],
    source: "propoly",
    target: { kind: "listing-landlord", listingId: id, propertyId: listing.propertyId ? String(listing.propertyId) : null, address: `${listing.name}, ${listing.locality}` },
  };
  const { target: _t, ...shown } = plan;
  return { answer: { state: "found", home, people: [shown], token: sealPayload({ v: 1, by: user.id, path, plans: [plan] } satisfies Sealed), looked: [...looked] }, plans: [plan] };
}

export async function findMissing(user: OsUser, scope: Scope, path: string, who: FindWho | null): Promise<FindAnswer> {
  try {
    return (await plansFor(user, scope, path, who)).answer;
  } catch (e) {
    console.error("[steve-find] look failed", e);
    return { state: "error", error: "I couldn't look just now. Your report can still go to James." };
  }
}

/* ── Yes ────────────────────────────────────────────────────────────────── */

const samePlan = (a: Plan, b: Plan) => JSON.stringify([a.who, a.name, a.email, a.phone, a.target]) === JSON.stringify([b.who, b.name, b.email, b.phone, b.target]);

/**
 * The agent said yes. The sealed card is checked against a fresh look - same
 * person, same home, still on their book, still blank - and only what is
 * still blank is written. Anything that moved since means "look again".
 */
export async function confirmFind(user: OsUser, scope: Scope, token: string): Promise<{ ok: true; saved: number; home: string } | { ok: false; error: string }> {
  const sealed = openPayload<Sealed>(token);
  if (!sealed || sealed.v !== 1 || sealed.by !== user.id) return { ok: false, error: "That card has run out. Ask Steve to look again." };
  const fresh = await plansFor(user, scope, sealed.path, null);
  if (fresh.answer.state !== "found") return { ok: false, error: fresh.answer.state === "complete" ? "Somebody has already filled this in." : "That's changed since Steve looked. Ask him to look again." };
  const plans = sealed.plans.filter((s) => fresh.plans.some((f) => samePlan(s, f)));
  if (plans.length !== sealed.plans.length) return { ok: false, error: "That's changed since Steve looked. Ask him to look again." };
  if (!hasDb()) return { ok: false, error: "No database here." };
  await ensure();

  const by = { id: user.id, name: user.name || user.email, email: user.email };
  const [kind, id] = [recordOn(sealed.path) ?? "", decodeURIComponent(sealed.path.split("/")[2] ?? "")];
  const home = fresh.answer.home;
  let saved = 0;

  /* A household with nobody named goes in as one Edit, as the home's page does it. */
  const household = plans.filter((x) => x.target.kind === "home-tenants");
  if (household.length) {
    const t = household[0].target as Extract<Target, { kind: "home-tenants" }>;
    const homeRef = { propertyId: t.propertyId, listingId: t.listingId };
    const before = (await overridesFor(homeRef)).tenants?.value;
    if (!Array.isArray(before) || !before.length) {
      const value = household.map((x) => ({ name: x.name, email: x.email, phone: x.phone }));
      await saveOverrides(homeRef, [{ field: "tenants", value, from: null }], { name: by.name, email: by.email });
      for (const x of household) await logFill(by, kind, id, home, x, { tenants: null });
      saved += household.length;
    }
  }

  for (const x of plans) {
    const t = x.target;
    if (t.kind === "record-landlord") {
      const rows = await q<{ id: string; landlord_name: string | null; landlord_email: string | null; landlord_phone: string | null }>(
        `SELECT id, landlord_name, landlord_email, landlord_phone FROM os_properties WHERE active AND (id = $1 OR rex_property_id = $1)`,
        [t.propertyId]
      );
      if (!rows.length) continue;
      /* Blanks only, row by row. */
      for (const r of rows) {
        await q(
          `UPDATE os_properties SET
             landlord_name  = COALESCE(NULLIF(btrim(landlord_name), ''), $2),
             landlord_email = COALESCE(NULLIF(btrim(landlord_email), ''), $3),
             landlord_phone = COALESCE(NULLIF(btrim(landlord_phone), ''), $4),
             updated_at = NOW()
           WHERE id = $1`,
          [r.id, x.name, x.email, x.phone]
        );
      }
      await logFill(by, kind, id, home, x, { rows });
      saved++;
    } else if (t.kind === "tenant-contact") {
      await ensureTenantContacts();
      const held = await q<{ email: string | null; phone: string | null; shown_as: string | null; source: string | null }>(
        `SELECT email, phone, shown_as, source FROM os_tenant_contacts WHERE os_property_id = $1 AND name_key = $2`,
        [t.osPropertyId, nameKey(t.recordName)]
      );
      const was = held[0] ?? null;
      await saveTenantContact(t.osPropertyId, t.recordName, { email: was?.email || x.email, phone: was?.phone || x.phone }, `steve-find:${by.email}`);
      await logFill(by, kind, id, home, x, { row: was });
      saved++;
    } else if (t.kind === "listing-landlord") {
      if (await changedLandlordFor({ listingId: t.listingId, propertyId: t.propertyId })) continue;
      const company = /\b(?:ltd|limited|llp|plc)\b/i.test(x.name);
      const change = await saveChange({
        listingId: t.listingId,
        propertyId: t.propertyId,
        address: t.address,
        value: { kind: company ? "company" : "private", name: x.name, companyNumber: null, contactName: null, email: x.email, phone: x.phone, directors: [], lateOwner: null },
        previous: null,
        by: { id: by.id, name: by.name },
      });
      await logFill(by, kind, id, home, x, { changeId: change.id });
      saved++;
    }
  }
  if (saved) await forgetBooks().catch(() => undefined);
  return { ok: true, saved, home };
}

async function logFill(by: { id: string; name: string; email: string }, kind: string, id: string, home: string, x: Plan, was: unknown): Promise<void> {
  await q(
    `INSERT INTO os_steve_fills (id, by_id, by_email, by_name, record_kind, record_id, home, who, name, added, source, target, was)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb)`,
    [randomUUID(), by.id, by.email, by.name, kind, id, home.slice(0, 300), x.who, x.name, JSON.stringify({ adds: x.adds, email: x.email, phone: x.phone }), x.source, JSON.stringify(x.target), JSON.stringify(was)]
  );
  await audit({
    kind: "steve_filled",
    actorId: by.id,
    actorEmail: by.email,
    detail: `${home}: ${x.who} ${x.name}, added ${x.adds.join(", ")} from ${SOURCE_ADMIN[x.source]} on their yes. OS only.`,
  }).catch(() => undefined);
}

/* ── James's list, and undo ─────────────────────────────────────────────── */

export type FillRow = {
  id: string;
  at: string;
  by: string;
  home: string;
  path: string;
  who: FindWho;
  name: string;
  added: string;
  source: string;
  undone: string | null;
};

export async function recentFills(days = 14): Promise<FillRow[]> {
  if (!hasDb()) return [];
  await ensure();
  const rows = await q<{ id: string; at: Date; by_name: string; home: string; record_kind: string; record_id: string; who: string; name: string; added: { adds?: string[]; email?: string | null; phone?: string | null }; source: string; undone_at: Date | null; undone_by: string | null }>(
    `SELECT id, at, by_name, home, record_kind, record_id, who, name, added, source, undone_at, undone_by FROM os_steve_fills
      WHERE at > NOW() - make_interval(days => $1) ORDER BY at DESC LIMIT 200`,
    [days]
  );
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.at).toISOString(),
    by: r.by_name,
    home: r.home,
    path: `/${r.record_kind === "listing" ? "listings" : "portfolio"}/${encodeURIComponent(r.record_id)}`,
    who: r.who as FindWho,
    name: r.name,
    added: (r.added.adds ?? []).map((a) => (a === "email" ? r.added.email : a === "phone" ? r.added.phone : a)).filter(Boolean).join(" · "),
    source: SOURCE_ADMIN[r.source as FindSource] ?? r.source,
    undone: r.undone_at ? `${r.undone_by ?? "Undone"}, ${new Date(r.undone_at).toISOString().slice(0, 10)}` : null,
  }));
}

/** Put back what was there before Steve's fill (James only: the route checks). */
export async function undoFill(fillId: string, by: { name: string; email: string }): Promise<boolean> {
  if (!hasDb()) return false;
  await ensure();
  const rows = await q<{ target: Target; was: Record<string, unknown> | null; name: string; home: string; record_kind: string; record_id: string; undone_at: Date | null }>(
    `SELECT target, was, name, home, record_kind, record_id, undone_at FROM os_steve_fills WHERE id = $1`,
    [fillId]
  );
  const r = rows[0];
  if (!r || r.undone_at) return false;
  const t = r.target;
  const was = r.was ?? {};
  if (t.kind === "record-landlord") {
    for (const row of (was.rows ?? []) as Array<{ id: string; landlord_name: string | null; landlord_email: string | null; landlord_phone: string | null }>)
      await q(`UPDATE os_properties SET landlord_name = $2, landlord_email = $3, landlord_phone = $4, updated_at = NOW() WHERE id = $1`, [row.id, row.landlord_name, row.landlord_email, row.landlord_phone]);
  } else if (t.kind === "tenant-contact") {
    const row = was.row as { email: string | null; phone: string | null; shown_as: string | null; source: string | null } | null;
    if (row) await q(`UPDATE os_tenant_contacts SET email = $3, phone = $4, source = $5 WHERE os_property_id = $1 AND name_key = $2`, [t.osPropertyId, nameKey(t.recordName), row.email, row.phone, row.source ?? "os-edit"]);
    /* No row before: Steve's own row goes, and the tenant is as they were. */
    else await q(`DELETE FROM os_tenant_contacts WHERE os_property_id = $1 AND name_key = $2 AND source = 'os-edit' AND source_ref LIKE 'steve-find:%'`, [t.osPropertyId, nameKey(t.recordName)]);
  } else if (t.kind === "home-tenants") {
    await saveOverrides({ propertyId: t.propertyId, listingId: t.listingId }, [{ field: "tenants", value: null, from: null }], by);
    /* One undo takes the whole household, so its other rows are marked too. */
    await q(`UPDATE os_steve_fills SET undone_at = NOW(), undone_by = $3 WHERE record_kind = $1 AND record_id = $2 AND target->>'kind' = 'home-tenants' AND undone_at IS NULL`, [r.record_kind, r.record_id, by.name]);
  } else if (t.kind === "listing-landlord") {
    if (typeof was.changeId === "string") await undoChange(was.changeId, by.name);
  }
  await q(`UPDATE os_steve_fills SET undone_at = NOW(), undone_by = $2 WHERE id = $1 AND undone_at IS NULL`, [fillId, by.name]);
  await forgetBooks().catch(() => undefined);
  await audit({ kind: "steve_fill_undone", actorEmail: by.email, detail: `${r.home}: Steve's fill for ${r.name} undone.` }).catch(() => undefined);
  return true;
}

export { SOURCE_SAYS };
