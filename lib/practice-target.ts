import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * IS THIS WRITE AIMED AT THE CALLER'S OWN TEST FILE?
 *
 * The question behind the "practice" area level (lib/area-map, lib/phases).
 * In practice a real record is look only and a person's own test file works
 * in full, so every refused write gets one more look: does it name something
 * that belongs to one of THEIR test files?
 *
 * ── Why "names one of theirs" is a safe rule ──────────────────────────────
 *
 * The ids come off the request - the path, the query, the body - and are
 * matched against what the person's own uncleared test files recorded making
 * (os_test_kits.refs) and their overlay records (os_test_records, whose
 * listing and application ids are NEGATIVE so they can never collide with a
 * real one). Nothing is matched by name or address. A write that names no
 * test id of the caller's is refused, which includes every "new lead", "new
 * listing" and "book a viewing" on a real home: in practice you start from a
 * test file.
 *
 * Somebody else's test file does not count. Owners never reach this: the
 * area switches only gate agents.
 *
 * ── What it cannot promise, and what does ─────────────────────────────────
 *
 * It decides whether the ROUTE runs. What the route may then do outward is
 * still held by the switches (customer email off means only our own addresses
 * are ever written to - and a test file's customer IS the tester), by
 * lib/test-guard (a test file never goes to REX) and by REX_ALLOW_WRITES.
 * Three locks, and this is only the first.
 */

/** Everything a person's live test files own, as strings. */
async function ownTestIds(email: string): Promise<Set<string>> {
  const out = new Set<string>();
  const me = email.trim().toLowerCase();
  if (!hasDb() || !me) return out;

  const kits = await q<{ id: string; refs: Record<string, unknown> | null }>(
    `select id, refs from os_test_kits where lower(created_by) = $1 and cleared_at is null`,
    [me]
  ).catch(() => []);
  for (const k of kits) {
    out.add(k.id);
    const r = k.refs ?? {};
    for (const key of ["contacts", "appraisals", "leadIds", "passports", "plcCases", "orders", "appointments"]) {
      const list = (r as Record<string, unknown>)[key];
      if (Array.isArray(list)) for (const v of list) if (v != null && String(v)) out.add(String(v));
    }
    if (typeof r.osPropertyId === "string" && r.osPropertyId) out.add(r.osPropertyId);
  }
  /* The two shapes other ids are built from: a lead made from an OS contact is
     os-<contactId>, and an appraisal booked from a lead is lead-<leadId>. */
  for (const id of [...out]) {
    out.add(`os-${id}`);
    out.add(`lead-${id}`);
    out.add(`lead-os-${id}`);
  }

  const records = await q<{ id: string; payload: Record<string, unknown> | null }>(
    `select id, payload from os_test_records where lower(owner_email) = $1`,
    [me]
  ).catch(() => []);
  for (const rec of records) {
    out.add(rec.id);
    const p = rec.payload ?? {};
    for (const key of ["id", "listingId", "applicationId", "appId", "dealId", "viewingId", "appraisalId"]) {
      const v = (p as Record<string, unknown>)[key];
      if (v != null && String(v)) out.add(String(v));
    }
  }
  return out;
}

export async function isOwnTestTarget(email: string, candidates: string[]): Promise<boolean> {
  const wanted = candidates.map((c) => String(c).trim()).filter(Boolean).slice(0, 80);
  if (!wanted.length) return false;
  const mine = await ownTestIds(email);
  if (!mine.size) return false;
  return wanted.some((c) => mine.has(c));
}
