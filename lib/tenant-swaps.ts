import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * TENANT SWAPS (Lianna and James, 12 Oct 2026).
 *
 * 44 South Bridge, Edinburgh: five sharers on one joint lease, one leaving,
 * and he has found his own replacement on SpareRoom. "Very common." No
 * viewing and no offer: the agent picks who is leaving and who is coming in,
 * and the swap becomes an application of its own ("swap:<id>",
 * lib/applications) whose file pushes it to Propoly - a new deal for the home
 * with everybody staying and the newcomer on it, and only the newcomer sent
 * for referencing (lib/handover). "Start Referencing" stays a press in
 * Propoly.
 *
 * TESTED ON PROPOLY'S TEST HOME, 13 Oct 2026 (five deals on "TLE OS TEST -
 * DELETE ME"): a holding fee of 0, null, left out, or with a "not required"
 * flag all came back as a week's rent and "due" - Propoly fills its own
 * default and has no way to say "not required" from outside. So Kirstie sets
 * it in Propoly (the swap-fee action on the let). Tenants DO take
 * reference_required and rent_share_pcm_pence, so the newcomer alone is
 * referenced and their rent portion lands on them.
 *
 * THREE KINDS OF CHANGE (Kirstie, 19 Oct 2026: 3b7dbd10, 3fd16026). The same
 * row carries two more changes to the people on a tenancy, as both end the
 * same way - a new deal in Propoly with everyone on it and a new contract:
 *   - "swap": somebody leaves and somebody moves in (the above).
 *   - "add": nobody leaves, somebody moves in. Today the agent starts a deal,
 *     marks the current tenants "no references" and references the newcomer.
 *   - "rereference": nobody leaves or joins; the current tenants are
 *     referenced again so they get rent and legal protection and a new
 *     contract. `rereference` names who is referenced.
 * A swap or an add can re-reference some of the staying tenants too. The
 * push for "add" and "rereference" waits on the tenant_changes_live switch.
 */

export type TenantChangeKind = "swap" | "add" | "rereference";
export const CHANGE_LABEL: Record<TenantChangeKind, string> = { swap: "Tenant swap", add: "Tenant added", rereference: "Re-reference" };

export interface SwapPerson {
  name: string;
  email: string | null;
  phone: string | null;
  contactId?: string | null;
}

export interface TenantSwap {
  id: string;
  kind: TenantChangeKind;
  /** Staying tenants who are referenced again, by name (empty on a plain swap). */
  rereference: string[];
  listingId: string;
  property: string;
  leaving: SwapPerson[];
  staying: SwapPerson[];
  joining: SwapPerson[];
  moveIn: string;
  rentPcm: number | null;
  /** What the person moving in pays by themselves (13 Oct 2026). The deal keeps rentPcm, the home's. */
  rentPortion: number | null;
  note: string;
  by: string;
  byEmail: string | null;
  at: string;
}

let ready: Promise<void> | null = null;
async function tq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_tenant_swaps (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      property TEXT NOT NULL,
      leaving JSONB NOT NULL DEFAULT '[]',
      staying JSONB NOT NULL DEFAULT '[]',
      joining JSONB NOT NULL DEFAULT '[]',
      move_in DATE NOT NULL,
      rent_pcm NUMERIC,
      note TEXT NOT NULL DEFAULT '',
      by_name TEXT NOT NULL,
      by_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cancelled_at TIMESTAMPTZ
    )`)
    .then(() => q(`ALTER TABLE os_tenant_swaps ADD COLUMN IF NOT EXISTS rent_portion NUMERIC`))
    .then(() => q(`ALTER TABLE os_tenant_swaps ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'swap'`))
    .then(() => q(`ALTER TABLE os_tenant_swaps ADD COLUMN IF NOT EXISTS rereference JSONB NOT NULL DEFAULT '[]'`))
    .then(() => undefined).catch((e) => { ready = null; throw e; });
  await ready;
  return q<T>(text, params);
}

type SwapRow = { id: string; listing_id: string; property: string; leaving: SwapPerson[]; staying: SwapPerson[]; joining: SwapPerson[]; move_in: Date | string; rent_pcm: string | null; rent_portion?: string | null; kind?: string | null; rereference?: string[] | null; note: string; by_name: string; by_email: string | null; created_at: Date };

const ymd = (v: Date | string) => (typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));
const shape = (r: SwapRow): TenantSwap => ({
  id: r.id,
  kind: r.kind === "add" || r.kind === "rereference" ? r.kind : "swap",
  rereference: r.rereference ?? [],
  listingId: r.listing_id,
  property: r.property,
  leaving: r.leaving ?? [],
  staying: r.staying ?? [],
  joining: r.joining ?? [],
  moveIn: ymd(r.move_in),
  rentPcm: r.rent_pcm == null ? null : Number(r.rent_pcm),
  rentPortion: r.rent_portion == null ? null : Number(r.rent_portion),
  note: r.note,
  by: r.by_name,
  byEmail: r.by_email,
  at: new Date(r.created_at).toISOString(),
});

export async function createSwap(s: Omit<TenantSwap, "id" | "at">): Promise<TenantSwap> {
  const id = randomBytes(9).toString("base64url").replace(/[-_]/g, "x");
  const rows = await tq<SwapRow>(
    `INSERT INTO os_tenant_swaps (id, listing_id, property, leaving, staying, joining, move_in, rent_pcm, rent_portion, note, by_name, by_email, kind, rereference)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14::jsonb) RETURNING *`,
    [id, s.listingId, s.property, JSON.stringify(s.leaving), JSON.stringify(s.staying), JSON.stringify(s.joining), s.moveIn, s.rentPcm, s.rentPortion, s.note, s.by, s.byEmail, s.kind, JSON.stringify(s.rereference)]
  );
  return shape(rows[0]);
}

/** Swaps still in hand: not cancelled, made in the last 120 days. */
export async function openSwaps(): Promise<TenantSwap[]> {
  if (!hasDb()) return [];
  const rows = await tq<SwapRow>(
    `SELECT * FROM os_tenant_swaps WHERE cancelled_at IS NULL AND created_at > NOW() - INTERVAL '120 days' ORDER BY created_at DESC LIMIT 100`
  );
  return rows.map(shape);
}

/** The open swap on one home, newest first - so the home's page can say one is under way (16 Oct 2026). */
export async function openSwapFor(listingId: string): Promise<TenantSwap | null> {
  if (!hasDb() || !listingId) return null;
  const rows = await tq<SwapRow>(
    `SELECT * FROM os_tenant_swaps WHERE listing_id = $1 AND cancelled_at IS NULL AND created_at > NOW() - INTERVAL '120 days' ORDER BY created_at DESC LIMIT 1`,
    [listingId]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function cancelSwap(id: string): Promise<boolean> {
  const rows = await tq<{ id: string }>(`UPDATE os_tenant_swaps SET cancelled_at = NOW() WHERE id = $1 AND cancelled_at IS NULL RETURNING id`, [id]);
  return rows.length > 0;
}
