import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { uid } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, withR2 } from "@/lib/r2";
import { isExpiredToken, rexCall, RexWriteBlocked } from "@/lib/rex";
import { rexContactFor } from "@/lib/rex-notes";
import { rexTokenFor } from "@/lib/rex-user";
import { isTestFile, TEST_REFUSAL } from "@/lib/test-guard";

/**
 * DOCUMENTS ON A LEAD (Howard, 24 Sep 2026: "still no document uploads on
 * leads for TT or LL").
 *
 * The Documents tab had a list, a rename and a tag, and nothing behind them:
 * no way to add a file, and whatever was renamed was gone on the next open.
 * Now a document is uploaded from the tab, kept by the OS (R2 + a row here),
 * and copied to REX on the person's contact, so the team still reading REX
 * sees it there too.
 *
 * ── REX, the same way notes go (lib/rex-notes) ─────────────────────────────
 *
 * With the agent's own REX sign-in, so REX shows who added it; never the
 * office account. Never for a test file, never for somebody not in REX yet.
 * The OS keeps the file first either way, so a refusal costs a copy, never
 * the document, and "Send to REX" tries again later.
 *
 * The shape is REX's own, read off a live contact on 24 Sep 2026:
 *   related.contact_documents: [{ id, description, uri: "rexlive://..." }]
 * written as Upload/uploadFileFromUrl (our R2 copy, presigned, gives a
 * rextmp:// uri) then Contacts/update with the new entry. The entries already
 * on the contact go back in the same update, by id and untouched, so the write
 * can only ever add: whether REX treats a related list as "add these" or "the
 * list is now these", nothing the office put there can drop off.
 */

export interface LeadDoc {
  id: string;
  name: string;
  tag: string;
  mime: string;
  sizeBytes: number;
  byName: string;
  at: string;
  /** When REX took its copy, or null. */
  rexAt: string | null;
  /** Why REX has not got it, in words, or null. */
  rexError: string | null;
  /** A test file: it never goes to REX, so there is nothing to try again. */
  rexNever: boolean;
  /** Where the OS serves the file. */
  url: string;
}

type Row = {
  id: string; name: string; tag: string; r2_key: string; mime: string; size_bytes: number;
  by_name: string; at: Date; rex_at: Date | null; rex_error: string | null;
};

const shape = (r: Row): LeadDoc => ({
  id: r.id,
  name: r.name,
  tag: r.tag,
  mime: r.mime,
  sizeBytes: Number(r.size_bytes) || 0,
  byName: r.by_name,
  at: new Date(r.at).toISOString(),
  rexAt: r.rex_at ? new Date(r.rex_at).toISOString() : null,
  rexError: r.rex_error,
  rexNever: r.rex_error === TEST_REFUSAL,
  url: `/api/r2/file?key=${encodeURIComponent(r.r2_key)}`,
});

export async function docsFor(leadId: string): Promise<LeadDoc[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT id, name, tag, r2_key, mime, size_bytes, by_name, at, rex_at, rex_error
       FROM os_lead_documents WHERE lead_id = $1 ORDER BY at DESC`,
    [leadId]
  );
  return rows.map(shape);
}

export async function addDoc(p: {
  leadId: string; name: string; tag: string; r2Key: string; mime: string; sizeBytes: number;
  byId: string; byName: string;
}): Promise<LeadDoc> {
  const id = uid();
  const rows = await q<Row>(
    `INSERT INTO os_lead_documents (id, lead_id, name, tag, r2_key, mime, size_bytes, by_id, by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, name, tag, r2_key, mime, size_bytes, by_name, at, rex_at, rex_error`,
    [id, p.leadId, p.name.slice(0, 200), p.tag, p.r2Key, p.mime, p.sizeBytes, p.byId, p.byName]
  );
  return shape(rows[0]);
}

/** Rename or re-tag. The copy already in REX keeps the name it went with. */
export async function updateDoc(leadId: string, docId: string, patch: { name?: string; tag?: string }): Promise<LeadDoc | null> {
  const rows = await q<Row>(
    `UPDATE os_lead_documents
        SET name = COALESCE($3, name), tag = COALESCE($4, tag)
      WHERE id = $1 AND lead_id = $2
      RETURNING id, name, tag, r2_key, mime, size_bytes, by_name, at, rex_at, rex_error`,
    [docId, leadId, patch.name?.trim().slice(0, 200) || null, patch.tag || null]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export type DocRexResult = { ok: true } | { ok: false; why: string };

/** Copy one of a lead's documents onto the person's REX contact. Records the outcome on the row. */
export async function docToRex(p: {
  leadId: string;
  docId: string;
  /** The REX contact id the drawer holds for a REX enquiry. */
  contactId: string | null;
  /** The OS user whose REX sign-in writes it. */
  byUserId: string;
}): Promise<DocRexResult> {
  const rows = await q<{ name: string; tag: string; r2_key: string; rex_at: Date | null }>(
    `SELECT name, tag, r2_key, rex_at FROM os_lead_documents WHERE id = $1 AND lead_id = $2`,
    [p.docId, p.leadId]
  );
  const row = rows[0];
  if (!row) return { ok: false, why: "That document is not on this lead." };
  if (row.rex_at) return { ok: true };

  const result = await push(p, row);
  await q(
    result.ok
      ? `UPDATE os_lead_documents SET rex_at = NOW(), rex_error = NULL WHERE id = $1`
      : `UPDATE os_lead_documents SET rex_error = $2 WHERE id = $1`,
    result.ok ? [p.docId] : [p.docId, result.why.slice(0, 300)]
  ).catch(() => []);
  return result;
}

async function push(
  p: { leadId: string; contactId: string | null; byUserId: string },
  row: { name: string; tag: string; r2_key: string }
): Promise<DocRexResult> {
  if (await isTestFile({ leadId: p.leadId, contactId: p.contactId })) return { ok: false, why: TEST_REFUSAL };

  const contact = await rexContactFor(p.leadId, p.contactId);
  if (!contact) return { ok: false, why: "This person is not in REX yet, so the document stays in the OS." };

  const token = await rexTokenFor(p.byUserId).catch(() => null);
  if (!token) return { ok: false, why: "Connect your REX sign-in in your profile and documents go to REX with your name on them." };

  try {
    /* What is on the contact now, so the update can hand it straight back. */
    const read = await rexCall("Contacts", "read", { id: contact, extra_fields: ["related"] }, token);
    if (!read.ok) {
      if (isExpiredToken(read)) return { ok: false, why: "Your REX sign-in has lapsed. Reconnect it in your profile, then send it again." };
      return { ok: false, why: `REX would not show us the contact: ${read.error ?? `it answered ${read.status}`}.` };
    }
    const existing = (((read.result as { related?: { contact_documents?: Array<{ id?: string | number }> } } | null)
      ?.related?.contact_documents) ?? [])
      .filter((d) => d?.id != null)
      .map((d) => ({ id: String(d.id) }));

    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await withR2((client) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key }), { expiresIn: 3600 })
    );
    const up = await rexCall("Upload", "uploadFileFromUrl", { url }, token);
    const uri = (up.result as { uri?: string } | undefined)?.uri;
    if (!up.ok || !uri) return { ok: false, why: `REX would not take the file: ${up.error ?? "no link came back"}.` };

    const description = row.tag && row.tag !== "Other" ? `${row.tag} - ${row.name}` : row.name;
    const attach = await rexCall(
      "Contacts",
      "update",
      { data: { id: contact, related: { contact_documents: [...existing, { description: description.slice(0, 250), uri }] } } },
      token
    );
    if (!attach.ok) {
      if (isExpiredToken(attach)) return { ok: false, why: "Your REX sign-in has lapsed. Reconnect it in your profile, then send it again." };
      return { ok: false, why: `REX did not file it on the contact: ${attach.error ?? `it answered ${attach.status}`}.` };
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof RexWriteBlocked) return { ok: false, why: "Sending documents to REX is not switched on yet, so this one stays in the OS." };
    return { ok: false, why: "REX did not answer, so the document stays in the OS for now." };
  }
}
