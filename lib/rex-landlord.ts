import "server-only";
import { rexCall } from "@/lib/rex";
import { hasDb, q } from "@/lib/db";

/**
 * The landlord of a property — the REAL one.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * Because the OS spent a while believing REX had no landlords, and inventing
 * them instead. `lib/journey.ts` held five made-up people and picked one by
 * hashing the property id; the viewing booker used that to address a landlord
 * confirmation EMAIL, and the listing drawer put it into the PLC handover.
 *
 * The belief came from a true fact about the wrong field. `legal_vendor_name`
 * IS empty on the whole rental book — that is measured and recorded in
 * lib/rex-keys.ts. But the landlord was never stored there. It lives on the
 * listing's CONTACT RELATIONSHIP: `related.contact_reln_listing`, the entry
 * whose `reln_type.id` is "owner". lib/deal-handoff.ts has read it correctly
 * all along; nothing else knew.
 *
 * MEASURED 1 Sep 2026, 25 current rentals read at random:
 *   • 22 of 25 (88%) have an owner contact
 *   • 22 of 22 of those have an email address
 *   • 21 of 22 have a phone number
 *
 * So the honest default is a real name, and "not recorded" is the exception
 * — roughly one property in eight, which callers must still handle.
 *
 * ── Read-only, and one listing at a time ──────────────────────────────────
 *
 * `Listings/read` is on the read allowlist in lib/rex.ts. There is no bulk
 * form of this: the owner relationship only comes back on a full read, not in
 * a search projection, so a book-wide landlord column would be one HTTP call
 * per property. Fetch it when a screen actually needs it.
 */

export type Landlord = {
  /** REX contact id — the join to terms, e-sign and the handover. */
  contactId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
};

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s ? s : null;
};

/* A landlord changes hands rarely, and the booker asks every time it opens.
   Twelve hours keeps a busy morning to one call per property while still
   picking up a correction the same day. */
const CACHE_MS = 12 * 60 * 60 * 1000;
const cacheKey = (listingId: string) => `landlord:v1:${listingId}`;

async function cached(listingId: string): Promise<{ landlord: Landlord | null } | null> {
  if (!hasDb()) return null;
  try {
    const rows = await q<{ payload: { landlord: Landlord | null }; computed_at: Date }>(
      "SELECT payload, computed_at FROM os_cache WHERE key = $1",
      [cacheKey(listingId)]
    );
    if (!rows[0]) return null;
    if (Date.now() - new Date(rows[0].computed_at).getTime() > CACHE_MS) return null;
    return rows[0].payload;
  } catch {
    return null;
  }
}

async function keep(listingId: string, landlord: Landlord | null): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_cache (key, payload, computed_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, computed_at = NOW()`,
      [cacheKey(listingId), JSON.stringify({ landlord })]
    );
  } catch {
    /* slow, not broken */
  }
}

export type LandlordAnswer =
  /** REX answered. `landlord` null means it genuinely holds no owner. */
  | { ok: true; landlord: Landlord | null }
  /** REX did NOT answer. Distinct from "no landlord" on purpose — see below. */
  | { ok: false; problem: string };

/**
 * One property's landlord.
 *
 * A failed call and an empty owner are DIFFERENT answers and are kept apart
 * all the way to the screen. Collapsing them would mean a REX outage renders
 * as "this property has no landlord", which reads like a fact about the
 * property rather than a fault on our side — and the agent would stop
 * expecting the landlord to be told.
 */
export async function landlordForListing(listingId: string): Promise<LandlordAnswer> {
  const id = Number(listingId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, problem: "That listing has no REX id, so its landlord can't be looked up." };
  }

  const hit = await cached(listingId);
  if (hit) return { ok: true, landlord: hit.landlord };

  const res = await rexCall("Listings", "read", { id });
  if (!res.ok) {
    /**
     * ⚠️ NEVER return `res.error` to a browser.
     *
     * REX puts the whole failing request in its error body, including the
     * SESSION TOKEN it was made with:
     *
     *   {"message":"A record with the id '999999999' was not found…",
     *    "extra":{"request_data":{"method":"Listings::read","args":{…},
     *    "token":"6e47-ddc7-…"}}}
     *
     * Caught 1 Sep 2026 by curling this route with a nonsense id — the token
     * came straight back down the wire, where anything with devtools could
     * lift it and call REX as us. So the error is LOGGED here and a flat
     * sentence goes out. Every REX-backed route that forwards `res.error`
     * has this hole; this one no longer does.
     */
    console.error("[landlord] Listings/read failed", { listingId, status: res.status });
    return {
      ok: false,
      problem: "REX didn't answer when asked who the landlord is, so nothing is being assumed.",
    };
  }

  const related = ((res.result ?? {}) as Row).related as Row | undefined;
  const relns = (related?.contact_reln_listing ?? []) as Row[];
  const owner = Array.isArray(relns)
    ? relns.find((r) => str((r?.reln_type as Row | null)?.id) === "owner")
    : undefined;
  const c = (owner?.contact ?? null) as Row | null;

  const landlord: Landlord | null = c
    ? {
        contactId: str(c.id),
        /* A contact with no name is a REX record somebody half-created. It is
           not a person we can write to, so it counts as no landlord rather
           than as a landlord called "Name not recorded". */
        name: str(c.name) ?? "",
        email: str(c.email_address),
        phone: str(c.phone_number),
      }
    : null;

  const usable = landlord && landlord.name ? landlord : null;
  await keep(listingId, usable);
  return { ok: true, landlord: usable };
}
