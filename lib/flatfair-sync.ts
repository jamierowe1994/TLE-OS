import "server-only";
import { createHash } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import {
  flatfairConfigured,
  flatfairEnv,
  getFlatbond,
  listFlatbondDocuments,
  listFlatbonds,
  type FfFlatbond,
} from "@/lib/flatfair";

/**
 * KEEPING OUR COPY OF FLATFAIR CURRENT (29 Sep 2026).
 *
 * The OS owns its data and reads each source as little as it can (the
 * Propoly lesson: one reader, counted calls). So:
 *
 *   - syncAll() walks the flatbond list - one call per hundred - and stores
 *     each one. A flatbond whose content has not changed costs nothing more.
 *     Its documents are read only when it is new, when it changed, or when
 *     they were last read over a day ago.
 *   - syncOne(id) is what Flatfair's webhook triggers: one flatbond, read
 *     fresh from the API (the webhook body is only ever a pointer - it is not
 *     signed, so nothing in it is taken as fact), and its documents.
 */

const DOCS_STALE_MS = 24 * 3600_000;

const hashOf = (fb: FfFlatbond) => createHash("sha1").update(JSON.stringify(fb)).digest("hex");

const pounds = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? Math.round(n) : null;
};

/** Store one flatbond. Says whether it was new or changed, so the caller knows to read its documents. */
async function store(fb: FfFlatbond): Promise<"new" | "changed" | "same"> {
  const env = flatfairEnv();
  const hash = hashOf(fb);
  const before = await q<{ raw_hash: string }>(`SELECT raw_hash FROM os_flatbonds WHERE env = $1 AND id = $2`, [env, fb.id]);
  const td = fb.traditional_deposit;
  const row = [
    env, fb.id, fb.branch?.id ?? null, fb.branch?.name ?? null, fb.status ?? "", fb.product_type, fb.managed_by,
    fb.tenancy_type, fb.address, fb.city, fb.postcode?.toUpperCase() ?? null, fb.rent,
    fb.deposit_amount ?? pounds(td?.deposit_amount), td?.deposit_provider ?? null, td?.deposit_type ?? null,
    td?.has_been_registered ?? null, td?.deposit_registration_number ?? null, fb.start_date, fb.close_date,
    fb.landlord?.email ?? null, (fb.tenants ?? []).map((t) => t.email).filter(Boolean), fb.external_tenancy_id,
    JSON.stringify(fb), hash,
  ];
  await q(
    `INSERT INTO os_flatbonds (env, id, branch_id, branch_name, status, product_type, managed_by, tenancy_type, address, city,
       postcode, rent_pence, deposit_amount, deposit_provider, deposit_type, deposit_registered, registration_number,
       start_date, close_date, landlord_email, tenant_emails, external_tenancy_id, raw, raw_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     ON CONFLICT (env, id) DO UPDATE SET
       branch_id = EXCLUDED.branch_id, branch_name = EXCLUDED.branch_name, status = EXCLUDED.status,
       product_type = EXCLUDED.product_type, managed_by = EXCLUDED.managed_by, tenancy_type = EXCLUDED.tenancy_type,
       address = EXCLUDED.address, city = EXCLUDED.city, postcode = EXCLUDED.postcode, rent_pence = EXCLUDED.rent_pence,
       deposit_amount = EXCLUDED.deposit_amount, deposit_provider = EXCLUDED.deposit_provider,
       deposit_type = EXCLUDED.deposit_type, deposit_registered = EXCLUDED.deposit_registered,
       registration_number = EXCLUDED.registration_number, start_date = EXCLUDED.start_date,
       close_date = EXCLUDED.close_date, landlord_email = EXCLUDED.landlord_email,
       tenant_emails = EXCLUDED.tenant_emails, external_tenancy_id = EXCLUDED.external_tenancy_id,
       raw = EXCLUDED.raw, fetched_at = NOW(),
       changed_at = CASE WHEN os_flatbonds.raw_hash = EXCLUDED.raw_hash THEN os_flatbonds.changed_at ELSE NOW() END,
       raw_hash = EXCLUDED.raw_hash`,
    row
  );
  if (!before[0]) return "new";
  return before[0].raw_hash === hash ? "same" : "changed";
}

/** Read one flatbond's documents and replace our list of them. */
async function storeDocs(flatbondId: number): Promise<number | null> {
  const env = flatfairEnv();
  const r = await listFlatbondDocuments(flatbondId);
  if (!r.ok) return null;
  await q(`DELETE FROM os_flatbond_docs WHERE env = $1 AND flatbond_id = $2`, [env, flatbondId]);
  for (const d of r.rows) {
    await q(
      `INSERT INTO os_flatbond_docs (env, id, flatbond_id, type, file_name) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (env, id) DO UPDATE SET flatbond_id = EXCLUDED.flatbond_id, type = EXCLUDED.type,
         file_name = EXCLUDED.file_name, fetched_at = NOW()`,
      [env, d.id, flatbondId, d.type || "unknown", d.file_name ?? null]
    );
  }
  await q(`UPDATE os_flatbonds SET docs_at = NOW() WHERE env = $1 AND id = $2`, [env, flatbondId]);
  return r.rows.length;
}

export interface SyncOutcome {
  ok: boolean;
  env: string;
  flatbonds: number;
  added: number;
  changed: number;
  docsRead: number;
  error: string | null;
}

export async function syncAll(): Promise<SyncOutcome> {
  const env = flatfairEnv();
  const out: SyncOutcome = { ok: false, env, flatbonds: 0, added: 0, changed: 0, docsRead: 0, error: null };
  if (!flatfairConfigured()) return { ...out, error: "Flatfair is not connected here." };
  if (!hasDb()) return { ...out, error: "No database here." };
  const list = await listFlatbonds();
  if (!list.ok) return { ...out, error: list.error ?? "Flatfair did not give us the list." };
  const stale = new Set(
    (
      await q<{ id: number }>(
        `SELECT id FROM os_flatbonds WHERE env = $1 AND (docs_at IS NULL OR docs_at < NOW() - ($2 || ' milliseconds')::interval)`,
        [env, String(DOCS_STALE_MS)]
      )
    ).map((r) => r.id)
  );
  for (const fb of list.rows) {
    const was = await store(fb);
    out.flatbonds++;
    if (was === "new") out.added++;
    if (was === "changed") out.changed++;
    if (was !== "same" || stale.has(fb.id)) {
      if ((await storeDocs(fb.id)) != null) out.docsRead++;
    }
  }
  return { ...out, ok: true };
}

export async function syncOne(id: number): Promise<{ ok: boolean; error: string | null; status?: string }> {
  if (!flatfairConfigured()) return { ok: false, error: "Flatfair is not connected here." };
  if (!hasDb()) return { ok: false, error: "No database here." };
  const r = await getFlatbond(id);
  if (!r.ok || !r.data) return { ok: false, error: r.error ?? "Flatfair did not give us that flatbond." };
  await store(r.data);
  await storeDocs(id);
  return { ok: true, error: null, status: r.data.status };
}

/** What the wiring sheet and the status line say about our copy. */
export async function syncState(): Promise<{ env: string; flatbonds: number; docs: number; lastFetched: string | null }> {
  const env = flatfairEnv();
  if (!hasDb()) return { env, flatbonds: 0, docs: 0, lastFetched: null };
  const [a] = await q<{ n: string; last: Date | null }>(`SELECT count(*)::text AS n, max(fetched_at) AS last FROM os_flatbonds WHERE env = $1`, [env]).catch(() => []);
  const [b] = await q<{ n: string }>(`SELECT count(*)::text AS n FROM os_flatbond_docs WHERE env = $1`, [env]).catch(() => []);
  return { env, flatbonds: Number(a?.n ?? 0), docs: Number(b?.n ?? 0), lastFetched: a?.last ? new Date(a.last).toISOString() : null };
}
