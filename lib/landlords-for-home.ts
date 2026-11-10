import "server-only";
import { rexCall } from "@/lib/rex";
import { hasDb, q } from "@/lib/db";
import { listingRead } from "@/lib/listing-details";
import { isOwnerReln } from "@/lib/rex-reln";
import { recordLandlordFor } from "@/lib/record-landlords";
import { changedLandlordFor } from "@/lib/landlord-change";
import { peopleOnHome } from "@/lib/home-aliases";
import type { LandlordKind } from "@/lib/landlord-kinds";
import { heldKey } from "@/lib/rex-landlord";

/**
 * WHO ARE THE LANDLORDS OF THIS HOME - THE ONE READER (10 Nov 2026).
 *
 * The most common ticket in the three weeks to 10 Nov was "the landlord's
 * details don't pull through": a second landlord missing from the terms, no
 * landlord on a let whose listing has one, a PLC check that starts with
 * nobody. There were at least five readers, each asking one place. Only the
 * Propoly push's (this one, then in lib/deal-handoff) asked every place, so
 * the push found a landlord the listing and the let said was missing, and a
 * fix on one screen left the others wrong.
 *
 * So every screen and every email asks here, and gets ALL of them, each with
 * an email, a phone and where they were found.
 *
 * ── WHERE THE LANDLORD IS FOUND (26 Oct 2026) ─────────────────────────────
 *
 * The first place that names anybody is "the landlord"; the joint landlords
 * kept on the home in the OS always follow, whoever that is:
 *
 *   changed   the landlord an agent added or changed in the OS (Add the
 *             landlord / Change landlord, lib/landlord-change). THE NEWEST
 *             LANDLORD WINS (James, 1 Nov 2026): it stands in for every owner
 *             REX holds, so REX's owners drop out.
 *   listing   every owner REX joins to the listing ("Listing Owner", or a
 *             sub-type of it such as "Landlord" - lib/rex-reln). Every one:
 *             a listing with two owners has two landlords.
 *   property  every owner REX joins to the property itself (Properties/read
 *             with its contacts), where an appraisal's signed terms put them.
 *   record    the landlord on the home's OS record (os_properties.landlord_*,
 *             lib/record-landlords): the old system's name, changed with Edit
 *             landlord.
 *   joint     the joint landlords added on the home (lib/property-people),
 *             read under every key the home is filed under (lib/home-aliases).
 *             A point of contact is not an owner and is never here.
 *
 * A JOINT LANDLORD ALWAYS GOES (James, 2 Nov 2026), one each by email or
 * name, after whoever the landlord is.
 *
 * ── TWO WAYS IN ───────────────────────────────────────────────────────────
 *
 * `landlordsForListing` takes a listing REX has just read and answers in the
 * shape of REX contacts (id, name, email_address, phone_number,
 * company_name). It is the push's (lib/handover, lib/deal-handoff): always
 * fresh, nothing held. Only the REX ones carry a numeric id; an OS landlord's
 * id is "changed:", "record:" or "person:", never written to REX.
 *
 * `landlordsOfHome` is everybody else's: by listing id, REX property id or a
 * let's reference. It holds what REX said about a listing's owners (os_cache)
 * so a screen that asks on every open is one call to REX in a morning, and
 * reads the OS's own part - a change, the record, the joint landlords - fresh
 * every time, so a landlord added a moment ago is there at once.
 *
 * Reads only. Nothing here writes to REX, PayProp or Propoly.
 */

type Row = Record<string, unknown>;

export type LandlordFrom = "listing" | "changed" | "property" | "record" | "joint";

const FROM_NOTE: Record<LandlordFrom, string> = {
  listing: "On the listing.",
  changed: "Not on the listing. Added in the OS with Add the landlord.",
  property: "Not on the listing. Taken from the property's owner - check they are still the landlord.",
  record: "Not on the listing. Taken from the home's record in the OS - check they are still the landlord.",
  joint: "Not on the listing. Taken from the joint landlords on the home - check they are still the landlord.",
};

/** Where one landlord in the list was found, and for a changed one, what kind and which change. */
export type LandlordSource = { from: LandlordFrom; kind?: LandlordKind; changeId?: string };

export interface LandlordsFound {
  /** REX-shaped contacts, the landlord first. */
  owners: Row[];
  /** One for each of `owners`, in the same order. */
  sources: LandlordSource[];
  /** Where the first was found; null when there is nobody. */
  from: LandlordFrom | null;
  note: string | null;
}

/** A joint landlord from the home (lib/property-people), as the owners list carries them. */
export const isJointOwner = (c: Row): boolean => String(c.id ?? "").startsWith("person:");

const idOf = (v: unknown): string | null => (v == null || v === "" ? null : String(v).trim() || null);
const text = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s : null;
};
/* An OS landlord carries no company flag, so a name that is plainly a company
   goes to Propoly as one, not as Mr Limited. */
const asCompany = (name: string | null | undefined) => (/\b(limited|ltd|llp|plc)\.?$/i.test((name ?? "").trim()) ? { company_name: (name ?? "").trim() } : {});

/** The owner contacts in a list of REX relationships (a listing's or a property's). */
function ownersIn(relns: unknown): Row[] {
  return ((Array.isArray(relns) ? relns : []) as Row[])
    .filter((r) => isOwnerReln(r))
    .map((r) => (r.contact ?? null) as Row | null)
    .filter((c): c is Row => Boolean(c));
}

/** The owners REX joins to a listing it has read. */
export function listingOwners(listing: Row): Row[] {
  return ownersIn(((listing.related ?? {}) as Row).contact_reln_listing);
}

/** The owners REX joins to the property itself. null: REX did not answer. */
async function propertyOwners(propertyId: string): Promise<Row[] | null> {
  /* A home the OS took on itself ("pm-...") is not a REX property: nothing to ask. */
  if (!/^\d+$/.test(propertyId)) return [];
  const res = await rexCall("Properties", "read", { id: propertyId, extra_fields: ["contacts"] }).catch(() => null);
  if (!res?.ok) return null;
  return ownersIn((((res.result ?? {}) as Row).related as Row | undefined)?.contact_reln_property);
}

type Sources = {
  listingId: string | null;
  propertyId: string | null;
  /** The owners on the listing, already read. */
  onListing: Row[];
  /** The owners on the property; only asked when nobody is named before them. */
  onProperty: () => Promise<Row[] | null>;
  /** More keys the home's joint landlords may be filed under ("let:<ref>", "appraisal:<id>"). */
  keys?: Array<string | null | undefined>;
  /** A change of tenants: the listing's owners only, the home is already in Propoly. */
  swap?: boolean;
};

/** Every landlord, from every place, in the order above. */
async function gather(s: Sources): Promise<LandlordsFound> {
  const found = (owners: Row[], from: LandlordFrom, note = FROM_NOTE[from], each: LandlordSource = { from }): LandlordsFound => ({
    owners,
    sources: owners.map(() => each),
    from,
    note,
  });
  const nobody: LandlordsFound = { owners: [], sources: [], from: null, note: null };

  /* A swap keeps the listing's owners, as before: its landlord is already in Propoly. */
  if (s.swap) return s.onListing.length ? found(s.onListing, "listing") : nobody;

  const main = await (async (): Promise<LandlordsFound> => {
    const changed = await changedLandlordFor({ listingId: s.listingId, propertyId: s.propertyId }).catch(() => null);
    if (changed) {
      const owners: Row[] = [{
        id: `changed:${changed.id}`,
        name: changed.name,
        email_address: changed.email,
        phone_number: changed.phone,
        ...(changed.kind === "company" ? { company_name: changed.name } : asCompany(changed.name)),
      }];
      return found(
        owners,
        "changed",
        s.onListing.length ? "Changed in the OS with Change landlord, in place of the owner on the listing." : FROM_NOTE.changed,
        { from: "changed", kind: changed.kind, changeId: changed.id }
      );
    }
    if (s.onListing.length) return found(s.onListing, "listing");
    if (s.propertyId) {
      const onProperty = await s.onProperty().catch(() => null);
      if (onProperty?.length) return found(onProperty, "property");
      const record = await recordLandlordFor(s.propertyId).catch(() => null);
      if (record) return found([{ id: record.contactId, name: record.name, email_address: record.email, phone_number: record.phone, ...asCompany(record.name) }], "record");
    }
    return nobody;
  })();

  /* Every key the home is filed under, not only the REX property's (4 Nov
     2026: a joint landlord added on the appraisal or the listing never went). */
  const keys = [s.propertyId, s.listingId ? `listing:${s.listingId}` : null, ...(s.keys ?? [])].filter(Boolean) as string[];
  const joint = keys.length ? (await peopleOnHome(...keys).catch(() => [])).filter((p) => p.kind === "joint_landlord") : [];
  const key = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const emails = new Set(main.owners.map((c) => key(c.email_address)).filter(Boolean));
  const names = new Set(main.owners.map((c) => key(c.name)).filter(Boolean));
  const extra: Row[] = [];
  for (const p of joint) {
    const e = key(p.email);
    const n = key(p.name);
    if ((e && emails.has(e)) || (n && names.has(n))) continue;
    if (e) emails.add(e);
    if (n) names.add(n);
    extra.push({ id: `person:${p.id}`, name: p.name, email_address: p.email, phone_number: p.phone, ...asCompany(p.name) });
  }
  if (!extra.length) return main;
  const jointSources = extra.map((): LandlordSource => ({ from: "joint" }));
  if (!main.owners.length) return { owners: extra, sources: jointSources, from: "joint", note: FROM_NOTE.joint };
  return { ...main, owners: [...main.owners, ...extra], sources: [...main.sources, ...jointSources] };
}

/**
 * The landlords for a listing REX has just read, as REX-shaped contacts, the
 * home's joint landlords after them. The Propoly push's way in: always fresh.
 */
export async function landlordsForListing(listing: Row, opts: { listingId: number | string | null; swap?: boolean }): Promise<LandlordsFound> {
  const propertyId = idOf((listing.property as Row | null)?.id) ?? idOf(listing.property_id);
  return gather({
    listingId: idOf(opts.listingId),
    propertyId,
    onListing: listingOwners(listing),
    onProperty: () => (propertyId ? propertyOwners(propertyId) : Promise.resolve([])),
    swap: opts.swap,
  });
}

/* ── everybody else's way in ───────────────────────────────────────────── */

/** One landlord of a home, with how to reach them and where they were found. */
export type HomeLandlord = {
  /** Stable for the person: "rex:<contact id>", "changed:<id>", "record:<name>" or "person:<id>". */
  key: string;
  /** REX's contact id, for a landlord REX holds. null for one only the OS holds: nothing writes them to REX. */
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  from: LandlordFrom;
  /** For "changed": a company, an estate or a private owner, and the change behind it. */
  kind?: LandlordKind;
  changeId?: string;
};

export type LandlordsAnswer =
  /** Everybody found, the landlord first. Empty: nobody is held anywhere. */
  | { ok: true; landlords: HomeLandlord[]; from: LandlordFrom | null; note: string | null; propertyId: string | null }
  /** REX did NOT answer. Kept apart from "no landlord" all the way to the screen. */
  | { ok: false; problem: string };

type Held = { propertyId: string | null; onListing: Row[]; onProperty: Row[] | null };

/* A landlord changes hands rarely, and the viewing booker asks every time it
   opens. Twelve hours keeps a busy morning to one call per listing. */
const HELD_MS = 12 * 60 * 60 * 1000;
/* NOBODY IS NOT HELD FOR TWELVE HOURS (10 Nov 2026). "No landlord" used to be
   kept as long as a landlord was, so an owner put on the listing at nine was
   still missing from the let at five while the push, which never held
   anything, found them. Ten minutes still spares REX a screen left open. */
const NOBODY_MS = 10 * 60 * 1000;

/* What the OS keeps of a REX contact: who they are and how to reach them. */
const slim = (c: Row): Row => ({
  id: idOf(c.id),
  name: text(c.name),
  email_address: text(c.email_address),
  phone_number: text(c.phone_number),
  ...(text(c.company_name) ? { company_name: text(c.company_name) } : {}),
});

async function heldFor(listingId: string): Promise<Held | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: Held; computed_at: Date }>("SELECT payload, computed_at FROM os_cache WHERE key = $1", [heldKey(listingId)]);
    const p = rows[0]?.payload;
    if (!p || !Array.isArray(p.onListing)) return null;
    const anyone = p.onListing.length > 0 || (p.onProperty?.length ?? 0) > 0;
    if (Date.now() - new Date(rows[0].computed_at).getTime() > (anyone ? HELD_MS : NOBODY_MS)) return null;
    return p;
  } catch {
    return null;
  }
}

async function hold(listingId: string, held: Held): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
    [heldKey(listingId), JSON.stringify(held)]
  ).catch(() => undefined);
}

/** A Propoly deal's id: a let opened as its deal has no application to look up. */
const DEAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

/**
 * Every landlord of a home: by its listing, its REX property, or a let's
 * reference (an application's; its listing and home are looked up).
 *
 * A failed call to REX and "nobody is held" are DIFFERENT answers. Collapsing
 * them would make a REX outage read as a fact about the home.
 */
export async function landlordsOfHome(
  home: { listingId?: string | number | null; propertyId?: string | null; letRef?: string | null; keys?: Array<string | null | undefined> },
  opts: { fresh?: boolean } = {}
): Promise<LandlordsAnswer> {
  let listingId = idOf(home.listingId);
  let propertyId = idOf(home.propertyId);
  const letRef = idOf(home.letRef);
  if (listingId && !(Number(listingId) > 0)) listingId = null;

  /* A let names its own listing and home. */
  if (letRef && !listingId && !propertyId && !DEAL_ID.test(letRef) && !letRef.startsWith("-")) {
    const { getApplicationById } = await import("@/lib/applications");
    const app = await getApplicationById(letRef).catch(() => null);
    if (app?.listingId != null && Number(app.listingId) > 0) listingId = String(app.listingId);
    propertyId = idOf(app?.propertyId) ?? idOf(app?.swap?.rexPropertyId);
  }
  if (!listingId && !propertyId && !letRef) {
    return { ok: false, problem: "That listing has no reference in the listings system, so its landlord can't be looked up." };
  }

  let rex: Held = { propertyId, onListing: [], onProperty: null };
  if (listingId) {
    const hit = opts.fresh ? null : await heldFor(listingId);
    if (hit) {
      rex = { ...hit, propertyId: hit.propertyId ?? propertyId };
    } else {
      /* The same Listings/read the listing's page makes on open, shared
         through the per-listing read rather than asked a second time. */
      const res = await listingRead(Number(listingId), "Listings", "read", { id: Number(listingId) }).catch(() => null);
      if (!res?.ok) {
        /* NEVER return REX's own error to a browser: it carries the whole
           failing request, session token included (caught 1 Sep 2026). */
        console.error("[landlords] Listings/read failed", { listingId, status: res?.status });
        return { ok: false, problem: "The listings system didn't answer when asked who the landlord is, so nothing is being assumed." };
      }
      const listing = (res.result ?? {}) as Row;
      const pid = idOf((listing.property as Row | null)?.id) ?? idOf(listing.property_id) ?? propertyId;
      const onListing = listingOwners(listing).map(slim);
      /* The property's own owners are only wanted when the listing names
         nobody, so that is the only time REX is asked for them. */
      const onProperty = !onListing.some((c) => text(c.name)) && pid ? ((await propertyOwners(pid))?.map(slim) ?? null) : null;
      rex = { propertyId: pid, onListing, onProperty };
      await hold(listingId, rex);
    }
    propertyId = rex.propertyId;
  }

  /* A contact with no name is a record somebody half-created. It is nobody we
     can write to, so it is not a landlord here (the push keeps its own rule). */
  const named = (rows: Row[] | null) => (rows ?? []).filter((c) => text(c.name));
  const found = await gather({
    listingId,
    propertyId,
    onListing: named(rex.onListing),
    onProperty: async () => named(rex.onProperty ?? (listingId || !propertyId ? null : await propertyOwners(propertyId))),
    keys: [letRef ? `let:${letRef}` : null, ...(home.keys ?? [])],
  });

  const seen = new Set<string>();
  const landlords: HomeLandlord[] = [];
  found.owners.forEach((c, i) => {
    const id = idOf(c.id);
    const name = text(c.name) ?? "";
    const rexId = id && /^\d+$/.test(id) ? id : null;
    const key = rexId ? `rex:${rexId}` : id ?? `name:${name.toLowerCase()}`;
    if (!name || seen.has(key)) return;
    seen.add(key);
    const s = found.sources[i] ?? { from: found.from ?? "listing" };
    landlords.push({
      key,
      contactId: rexId,
      name,
      email: text(c.email_address),
      phone: text(c.phone_number),
      from: s.from,
      ...(s.kind ? { kind: s.kind } : {}),
      ...(s.changeId ? { changeId: s.changeId } : {}),
    });
  });
  return { ok: true, landlords, from: landlords[0]?.from ?? null, note: landlords.length ? found.note : null, propertyId };
}

/** The first names of several people in a line: "Ann", "Ann and Bob", "Ann, Bob and Cy". */
export function firstNames(people: Array<{ name: string }>): string {
  const names = people.map((p) => p.name.trim().split(/\s+/)[0]).filter(Boolean);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
