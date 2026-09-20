import "server-only";
import { hasDb, q } from "@/lib/db";
import type { Access } from "@/components/listing/AccessRequest";
import { isTestId, testListing, testViewingsForListing } from "@/lib/test-overlay";

/**
 * CAN WE GET IN? - every viewing coming up, and whether access is sorted.
 *
 * James, 20 Sep 2026: "this whole access thing is going to be really
 * important for us to track which ones do and don't have access, as well as
 * what the most important ones are". A listing holds the arrangement
 * (os_case_state "access", set on the listing's own screen); the diary holds
 * the viewings. Neither on its own answers "what do I have to chase today".
 *
 * Most important = soonest. A viewing on Thursday with no access is worse
 * than one next month, and a viewing nobody can get into is worse than one
 * whose tenant has simply not replied yet - so the rows come back in time
 * order and carry their own state for the screen to rank.
 */

export type AccessState =
  /** Nothing recorded at all: we do not know how anybody gets in. */
  | "none"
  /** Vacant, and the keys are not in the office yet. */
  | "keys"
  /** Somebody to ask, and nobody has. */
  | "to-ask"
  /** Asked, no answer yet. */
  | "asked"
  /** They said yes, or the keys are in. */
  | "sorted";

export interface AccessRow {
  viewingId: string;
  startsAt: string;
  listingId: string;
  address: string;
  who: string;
  agent: string | null;
  state: AccessState;
  /** Who we get in through, when we know. */
  through: string | null;
  askedAt: string | null;
  test?: boolean;
}

type ViewRow = { id: string; listing_id: string; starts_at: Date; agent: string | null; contacts: Array<{ name?: string }> | null; title: string; payload: { listingLabel?: string | null } | null };

const stateOf = (a: Access | null, viewingId: string): { state: AccessState; through: string | null; askedAt: string | null } => {
  if (!a || !a.kind) return { state: "none", through: null, askedAt: null };
  if (a.kind === "vacant") return { state: a.keysCollected ? "sorted" : "keys", through: "Vacant, our keys", askedAt: null };
  const r = (a.requests ?? {})[viewingId];
  const through = `${a.kind === "tenant" ? "The tenant" : "The landlord"}${a.name ? `, ${a.name}` : ""}`;
  if (r?.grantedAt) return { state: "sorted", through, askedAt: r.requestedAt };
  if (r) return { state: "asked", through, askedAt: r.requestedAt };
  return { state: "to-ask", through, askedAt: null };
};

/** Every viewing in the next `days`, soonest first, with its access state. */
export async function accessBoard(days = 14): Promise<AccessRow[]> {
  if (!hasDb()) return [];
  const rows = await q<ViewRow>(
    `SELECT id, listing_id, starts_at, agent, contacts, title, payload
       FROM os_viewings
      WHERE kind = 'viewing' AND NOT cancelled AND listing_id IS NOT NULL
        AND starts_at BETWEEN NOW() AND NOW() + ($1 || ' days')::interval
      ORDER BY starts_at`,
    [String(days)]
  ).catch(() => []);

  /* The OS's own bookings on test listings, so a test file reads like a real
     one here too (lib/test-overlay). */
  const test: AccessRow[] = [];
  const testListings = await q<{ id: string }>(
    `SELECT DISTINCT payload->>'listingId' AS id FROM os_test_records WHERE kind = 'listing'`
  ).catch(() => []);
  for (const t of testListings) {
    const listingId = Number(t.id);
    if (!isTestId(listingId)) continue;
    const l = await testListing(listingId).catch(() => null);
    if (!l) continue;
    for (const v of await testViewingsForListing(listingId).catch(() => [])) {
      const at = new Date(v.startsAt).getTime();
      if (at < Date.now() || at > Date.now() + days * 86400000) continue;
      test.push({
        viewingId: `os-${v.appointmentId}`,
        startsAt: v.startsAt,
        listingId: String(listingId),
        address: `${l.name}, ${l.locality}`.trim(),
        who: "A test applicant",
        agent: v.withName,
        state: "none",
        through: null,
        askedAt: null,
        test: true,
      });
    }
  }

  const ids = [...new Set([...rows.map((r) => r.listing_id), ...test.map((t) => t.listingId)])];
  const access = new Map<string, Access>();
  if (ids.length) {
    const held = await q<{ record_id: string; payload: Access }>(
      `SELECT record_id, payload FROM os_case_state WHERE kind = 'access' AND record_id = ANY($1)`,
      [ids]
    ).catch(() => []);
    for (const h of held) access.set(h.record_id, h.payload);
  }

  const out: AccessRow[] = [
    ...rows.map((r) => {
      const a = access.get(r.listing_id) ?? null;
      const who = (r.contacts ?? []).map((c) => c?.name).filter(Boolean).join(", ");
      return {
        viewingId: r.id,
        startsAt: new Date(r.starts_at).toISOString(),
        listingId: r.listing_id,
        address: (r.payload?.listingLabel || r.title || "A property").replace(/^viewing[:\s-]+/i, "").trim(),
        who: who || "Somebody",
        agent: r.agent,
        ...stateOf(a, r.id),
      };
    }),
    ...test.map((t) => ({ ...t, ...stateOf(access.get(t.listingId) ?? null, t.viewingId) })),
  ];

  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
