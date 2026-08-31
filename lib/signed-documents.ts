import "server-only";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";
import { hasDb, q } from "@/lib/db";

/**
 * SIGNED CONTRACTS. The OS keeps them; REX gets a copy.
 *
 * ── The ordering is the design ────────────────────────────────────────────
 *
 * James, 31 Aug: "the main storage hub is OS, and then we push it to REX as a
 * backup." So the two halves are deliberately separate functions, run in that
 * order, and the second is allowed to fail.
 *
 * `store()` puts the bytes in R2 and writes the row. Once that has returned,
 * the contract is safe and nothing later can lose it. `pushToRex()` is the
 * backup, and a REX outage, a locked write or a changed API costs us a copy
 * rather than the document. Doing it the other way round — push first, or
 * store only on a successful push — would mean the day REX changes something
 * is the day signed contracts stop being kept anywhere.
 *
 * ── The 40-minute trap ────────────────────────────────────────────────────
 *
 * DocuSeal's document URLs expire after 40 minutes, and their own
 * documentation says in bold not to store them. So the bytes are fetched
 * INSIDE the webhook, while the URL is still alive, and what is kept is the
 * submission id. Anything that needs the file later reads R2, and anything
 * that needs a DocuSeal URL asks DocuSeal for a fresh one.
 *
 * ── Idempotent, because webhooks retry ────────────────────────────────────
 *
 * DocuSeal will redeliver on any non-2xx, and can deliver twice on a timeout
 * that actually succeeded. `submitter_id` is the primary key and the insert is
 * ON CONFLICT DO NOTHING, so a redelivery is a no-op rather than a second copy
 * of a landlord's contract.
 */

export interface SignedDoc {
  submitterId: number;
  submissionId: number | null;
  appraisalId: string;
  templateName: string;
  signerName: string;
  signerEmail: string;
  completedAt: string | null;
  /** The document as DocuSeal served it, already downloaded. */
  bytes: Uint8Array;
  fileName: string;
}

export interface StoreResult {
  stored: boolean;
  /** False when this submitter was already on file — a retry, not a failure. */
  fresh: boolean;
  r2Key: string | null;
  reason?: string;
}

/**
 * Fetch the signed PDF while its URL is still valid.
 *
 * Separate from `store` so the webhook can do this FIRST and fail loudly if
 * the document cannot be had — there is no point writing a row that points at
 * nothing, and a 404 here means the URL has already expired.
 */
export async function fetchSigned(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(
      `The signed document could not be downloaded (${res.status}). DocuSeal's URLs expire after 40 minutes.`
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** The OS's own copy. Once this returns, the contract cannot be lost. */
export async function store(doc: SignedDoc): Promise<StoreResult> {
  if (!r2Configured) {
    return { stored: false, fresh: false, r2Key: null, reason: "R2 is not configured." };
  }
  if (!hasDb()) {
    return { stored: false, fresh: false, r2Key: null, reason: "No database on this environment." };
  }

  /* Keyed by submitter so a retry overwrites the identical object rather than
     accumulating copies. The appraisal id is in the path so the file is
     findable by a human going through the bucket, which is exactly what
     somebody does when something has gone wrong. */
  const key = `documents/signed/${doc.appraisalId || "unfiled"}/${doc.submitterId}-${safeName(
    doc.fileName || "terms-of-business.pdf"
  )}`;

  await withR2((client) =>
    client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: doc.bytes,
        ContentType: "application/pdf",
        Metadata: {
          "original-name": encodeURIComponent(doc.fileName || "terms-of-business.pdf"),
          "appraisal-id": doc.appraisalId,
          "submitter-id": String(doc.submitterId),
        },
      })
    )
  );

  const rows = await q<{ submitter_id: string }>(
    `INSERT INTO os_signed_documents
       (submitter_id, submission_id, appraisal_id, template_name,
        signer_name, signer_email, r2_key, bytes, completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (submitter_id) DO NOTHING
     RETURNING submitter_id`,
    [
      doc.submitterId,
      doc.submissionId,
      doc.appraisalId,
      doc.templateName,
      doc.signerName,
      doc.signerEmail,
      key,
      doc.bytes.byteLength,
      doc.completedAt,
    ]
  );

  return { stored: true, fresh: rows.length > 0, r2Key: key };
}

/**
 * The BACKUP into REX, and it is allowed to fail.
 *
 * ── Why this is gated and quiet ───────────────────────────────────────────
 *
 * Writing to REX is locked behind REX_ALLOW_WRITES, and this is a genuine
 * write to the live system six businesses share. The exact upload shape has
 * NOT been exercised — REX's `upload` service is undocumented, and everything
 * we know about it comes from reading records REX made itself.
 *
 * So a failure here is RECORDED, not raised. The contract is already safe in
 * R2 by the time this runs; the worst case is a row with `rex_error` on it and
 * a backup to retry later, which is a visible, fixable state rather than a
 * lost document or a webhook that keeps being redelivered.
 */
export async function pushToRex(
  submitterId: number,
  opts: { listingId?: number | null } = {}
): Promise<{ pushed: boolean; reason?: string }> {
  if (!hasDb()) return { pushed: false, reason: "No database." };

  const rows = await q<{ r2_key: string; appraisal_id: string; template_name: string }>(
    `SELECT r2_key, appraisal_id, template_name
       FROM os_signed_documents WHERE submitter_id = $1 AND rex_pushed_at IS NULL`,
    [submitterId]
  );
  if (!rows.length) return { pushed: false, reason: "Nothing waiting to be copied." };

  const { rexWritesLocked } = await import("@/lib/rex");
  /* BOTH methods, by their real names. This asked about "Documents/upload",
     which is not a call this function makes — REX has no document-create
     method at all, which is the whole reason the attach goes through a nested
     `related` update. A gate naming the wrong method is a gate that answers a
     question nobody asked: it would have refused while the real writes were
     unlocked, or worse, allowed while they were not. */
  const needed: Array<[string, string]> = [
    ["Upload", "uploadFileFromUrl"],
    ["Listings", "update"],
  ];
  const locked = needed.filter(([s, m]) => rexWritesLocked(s, m));
  if (locked.length) {
    const why = `REX writes are locked — REX_ALLOW_WRITES needs ${locked
      .map(([s, m]) => `${s}/${m}`)
      .join(" and ")}.`;
    await note(submitterId, why);
    return { pushed: false, reason: why };
  }

  if (!opts.listingId) {
    const why =
      "No REX listing to attach it to yet. Link the REX property on the appraisal, and the " +
      "listing is created when the terms are signed.";
    await note(submitterId, why);
    return { pushed: false, reason: why };
  }

  /**
   * TWO CALLS, and the shape is copied from Fine & Country's live pipeline
   * rather than guessed: `Upload/uploadFileFromUrl` returns a `rextmp://` uri,
   * and `Listings/update` with a nested `related.listing_documents` is what
   * permanently attaches it. REX has no document-create method — the nested
   * update IS the write path.
   *
   * ── We hand REX OUR url, not DocuSeal's ───────────────────────────────
   *
   * F&C pass DocuSeal's document URL straight through, which works only
   * inside the 40 minutes before it expires — so a failed attach can never be
   * retried, and theirs is a one-shot. Ours points at the copy already in R2,
   * presigned for an hour. That is the entire payoff of storing first: the
   * backup can be retried tomorrow, or after REX writes are unlocked, or after
   * the appraisal finally becomes a listing.
   */
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const row = rows[0];

  try {
    const url = await withR2((client) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key }), {
        expiresIn: 3600,
      })
    );

    const { rexCall } = await import("@/lib/rex");

    const up = await rexCall("Upload", "uploadFileFromUrl", { url });
    const uri = (up.result as { uri?: string } | undefined)?.uri;
    if (!up.ok || !uri) {
      const why = `REX would not take the file: ${JSON.stringify(up.result ?? "").slice(0, 200)}`;
      await note(submitterId, why);
      return { pushed: false, reason: why };
    }

    const attach = await rexCall("Listings", "update", {
      data: {
        id: opts.listingId,
        related: {
          listing_documents: [
            {
              description: row.template_name || "Signed terms of business",
              type_id: "contract",
              uri,
            },
          ],
        },
      },
    });
    if (!attach.ok) {
      const why = `REX refused the attach: ${JSON.stringify(attach.result ?? "").slice(0, 200)}`;
      await note(submitterId, why);
      return { pushed: false, reason: why };
    }

    await q(
      `UPDATE os_signed_documents
          SET rex_pushed_at = NOW(), rex_document_id = $2, rex_error = NULL
        WHERE submitter_id = $1`,
      [submitterId, uri]
    );
    return { pushed: true };
  } catch (e) {
    const why = e instanceof Error ? e.message : "REX copy failed.";
    await note(submitterId, why);
    return { pushed: false, reason: why };
  }
}

async function note(submitterId: number, reason: string): Promise<void> {
  await q(`UPDATE os_signed_documents SET rex_error = $2 WHERE submitter_id = $1`, [
    submitterId,
    reason.slice(0, 500),
  ]).catch(() => []);
}

/** Everything signed for one appraisal, newest first. */
export async function signedFor(appraisalId: string) {
  if (!hasDb() || !appraisalId) return [];
  return q<{
    submitter_id: string;
    template_name: string;
    signer_name: string;
    r2_key: string;
    completed_at: string | null;
    rex_pushed_at: string | null;
    rex_error: string | null;
  }>(
    `SELECT submitter_id, template_name, signer_name, r2_key,
            completed_at, rex_pushed_at, rex_error
       FROM os_signed_documents
      WHERE appraisal_id = $1
      ORDER BY stored_at DESC LIMIT 20`,
    [appraisalId]
  ).catch(() => []);
}
