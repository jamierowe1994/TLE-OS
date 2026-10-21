import "server-only";
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";
import type { CertRow } from "@/lib/certificate-intake";

/**
 * Taking a certificate off a home (Dan, 20 Oct 2026).
 *
 * "If a document goes out of date or needs replacing prior to PLC checks, we
 * can't replace the document that is already uploaded." He had filed an EPC
 * as the EICR on 24 Sep. It went into REX as the EICR, running to 2029, and
 * was verified. Nothing could take it off, and a real EICR attached on top was
 * never written to REX: REX keeps one entry per type, and the OS leaves an
 * entry alone when REX already holds a later expiry than the new one.
 *
 * So a person can now take a certificate off, saying why:
 *
 *   wrong     - it is not this certificate at all
 *   replaced  - it was out of date, or a newer one has gone on (Replace)
 *
 * The file is moved under removed/ rather than deleted, and the row is kept
 * in os_certificates_removed, so what was taken off and by whom can always be
 * shown. REX is not written to: archiving an entry is not on the allowlist.
 * Instead, while REX's entry still carries the removed certificate's expiry,
 * every screen that reads REX leaves that entry out (withoutRemoved below) -
 * so the home shows the duty as missing at once, and the moment a real
 * certificate is written over the entry, its new date shows again.
 */

export type RemoveReason = "wrong" | "replaced";

export const REMOVE_REASONS: Record<RemoveReason, string> = {
  wrong: "Wrong document",
  replaced: "Out of date or replaced",
};

/** The R2 folder every certificate for this home is filed in. */
const shelf = (propertyId: string) => `documents/${safeName(`compliance-${propertyId}-`)}`;

export async function removeCertificate(input: {
  propertyId: string;
  /** The file's R2 key, as the property file lists it. */
  key: string;
  reason: RemoveReason;
  by: string;
  /** The certificate that replaces it, when it went because of a Replace. */
  replacedBy?: string | null;
}): Promise<{ ok: true; name: string; rexStillHolds: boolean } | { ok: false; error: string }> {
  if (!hasDb()) return { ok: false, error: "No database on this environment." };
  /* Only a file on this home's own shelf: the key comes from the browser. */
  if (!input.key.startsWith(shelf(input.propertyId)) || input.key.includes("..")) {
    return { ok: false, error: "That file is not one of this home's certificates." };
  }
  const rows = await q<CertRow>(`SELECT * FROM os_certificates WHERE property_id = $1 AND r2_key = $2`, [input.propertyId, input.key]);
  const row = rows[0] ?? null;
  const name = row?.name ?? input.key.slice(input.key.lastIndexOf("/") + 1).replace(/^\d+-/, "");
  const typeId = row?.type_id ?? input.key.slice(shelf(input.propertyId).length).split("/")[0];

  /* The file first: if it cannot be moved, nothing has changed. */
  const movedTo = `removed/${input.key}`;
  if (r2Configured) {
    try {
      await withR2(async (c) => {
        await c.send(new CopyObjectCommand({ Bucket: R2_BUCKET, CopySource: `${R2_BUCKET}/${encodeURIComponent(input.key)}`, Key: movedTo }));
        await c.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: input.key }));
      });
    } catch (e) {
      console.error("[certificate-remove] moving the file failed", input.key, e);
      return { ok: false, error: "The file could not be taken off just now, so nothing has changed. Try again in a minute." };
    }
  }

  const expiry = row?.expiry ? String(row.expiry instanceof Date ? row.expiry.toISOString() : row.expiry).slice(0, 10) : null;
  await q(
    `INSERT INTO os_certificates_removed (id, property_id, type_id, name, r2_key, moved_to, expiry, rex_entry_id, replaced_by, row, reason, removed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
     ON CONFLICT (id) DO NOTHING`,
    [row?.id ?? `file-${Date.now()}`, input.propertyId, typeId, name, input.key, r2Configured ? movedTo : null, expiry, row?.rex_entry_id || null, input.replacedBy ?? null, JSON.stringify(row ?? {}), input.reason, input.by]
  );
  if (row) await q(`DELETE FROM os_certificates WHERE id = $1`, [row.id]);
  removedCache = null;
  return { ok: true, name, rexStillHolds: Boolean(row?.rex_entry_id) };
}

/* ── Leaving removed certificates out of what REX says ───────────────────── */

type Removed = { entryId: string; expiry: string };
let removedCache: { at: number; byEntry: Map<string, Set<string>> } | null = null;

async function removedEntries(): Promise<Map<string, Set<string>>> {
  if (removedCache && Date.now() - removedCache.at < 60_000) return removedCache.byEntry;
  const byEntry = new Map<string, Set<string>>();
  if (hasDb()) {
    const rows = await q<Removed>(
      `SELECT rex_entry_id AS "entryId", expiry::text AS expiry FROM os_certificates_removed WHERE rex_entry_id IS NOT NULL AND rex_entry_id <> '' AND expiry IS NOT NULL`
    ).catch(() => [] as Removed[]);
    for (const r of rows) byEntry.set(r.entryId, (byEntry.get(r.entryId) ?? new Set()).add(r.expiry));
  }
  removedCache = { at: Date.now(), byEntry };
  return byEntry;
}

const typeOf = (v: unknown) => (v && typeof v === "object" ? String((v as { id?: unknown }).id ?? "") : String(v ?? ""));

/**
 * REX compliance entries, less any still carrying a certificate somebody took
 * off. An entry is left out only while its expiry is the removed one's: once
 * a replacement is written over it, it counts again with the new date.
 */
export async function withoutRemoved<T extends Record<string, unknown>>(entries: T[]): Promise<T[]> {
  const removed = await removedEntries();
  if (!removed.size) return entries;
  return entries.filter((e) => {
    const gone = removed.get(String(e.id ?? ""));
    if (!gone) return true;
    const type = typeOf(e.type_id);
    const details = (e.details ?? {}) as Record<string, { expiry_date?: string | null }>;
    const expiry = String(details[type]?.expiry_date ?? "").slice(0, 10);
    return !expiry || !gone.has(expiry);
  });
}

/** What was taken off a home, newest first, for the property file. */
export async function removedFor(propertyId: string): Promise<Array<{ type: string; name: string; reason: RemoveReason; by: string; at: string }>> {
  if (!hasDb()) return [];
  const rows = await q<{ type_id: string; name: string; reason: RemoveReason; removed_by: string; removed_at: Date }>(
    `SELECT type_id, name, reason, removed_by, removed_at FROM os_certificates_removed WHERE property_id = $1 ORDER BY removed_at DESC LIMIT 20`,
    [propertyId]
  ).catch(() => []);
  return rows.map((r) => ({ type: r.type_id, name: r.name, reason: r.reason, by: r.removed_by, at: new Date(r.removed_at).toISOString() }));
}
