import "server-only";
import { createHash } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { addFileDoc, storedDocsForHome } from "@/lib/file-documents";
import { docTypeLabel, OTHER } from "@/lib/doc-types";
import { attachDocument, getCase, noteFileKeys, PlcRefused } from "@/lib/plc-store";
import { checkById, CHECK_GROUPS, COVERABLE, guessCheck, type CheckId, type PlcCase } from "@/lib/plc";
import { readDroppedFile } from "@/lib/plc-read-file";
import { isTestCase } from "@/lib/test-guard";

/**
 * ONE UPLOAD, BOTH PLACES (Kirstie, 8 Oct 2026).
 *
 * "I uploaded all docs in the document tab on the board then I went to do the
 * PLC and none of the docs had saved and I had to re-upload them all again."
 * The Documents tab (lib/file-documents) keeps a file against the HOME; a PLC
 * pack kept its own list. Now they meet in both directions:
 *
 *   - pullFileDocs: when a pack is opened, every file already on the home's
 *     Documents tab is read and filed under the check it answers.
 *   - mirrorToFile: a file uploaded on the pack lands on the Documents tab too,
 *     so the listing, the application and Kirstie's deal all see it.
 *
 * Each pulled file goes through the same reader as a dropped one. The label
 * picked on the Documents tab is a hint, not the answer: on the first real
 * pack (Apartment 30, Wheatsheaf Court) the AML check had been labelled the
 * holding deposit guide and the terms of business labelled the landlord's ID
 * before being uploaded again under the right names.
 */

/** Documents-tab label → the PLC check it answers. Unlisted labels are read and placed. */
const CHECK_FOR_TYPE: Record<string, CheckId> = {
  holding_deposit_guide: "holding-deposit",
  reference: "tenant-checks",
  tenant_right_to_rent: "right-to-rent",
  landlord_id: "landlord-id-aml",
  landlord_proof_of_ownership: "proof-of-ownership",
  landlord_aml: "landlord-aml",
  licensing: "licensing",
  epc: "epc",
  gas_safety: "gas-safety",
  eicr: "eicr",
};

/** The other way: the Documents-tab label for a file filed on a pack. */
const TYPE_FOR_CHECK: Partial<Record<CheckId, string>> = Object.fromEntries(
  Object.entries(CHECK_FOR_TYPE).map(([type, check]) => [check, type])
);
TYPE_FOR_CHECK["landlord-id-aml"] = "landlord_id";

/** Never part of a pre-let check: left on the Documents tab. */
const NOT_FOR_A_PACK = new Set(["terms_of_business", "tenant_proof_of_address"]);

/**
 * Tenant papers older than this before the pack was started belong to an
 * earlier let at the same address, so they stay where they are. A landlord's
 * ID or a certificate does not go stale with the tenant, and the reader shows
 * its dates.
 */
const TENANT_PAPERS_DAYS = 60;

const TENANT_CHECKS = new Set(CHECK_GROUPS.find((g) => g.id === "tenant")?.checks ?? []);

const READ_AT_ONCE = 3;

async function hashOf(key: string): Promise<string | null> {
  try {
    return await withR2(async (client) => {
      const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? createHash("sha256").update(bytes).digest("hex") : null;
    });
  } catch {
    return null;
  }
}

export type PullOutcome = {
  case: PlcCase;
  added: { name: string; checkId: CheckId }[];
  left: { name: string; why: string }[];
};

/**
 * Bring the home's Documents-tab files into an open pack. Safe to call every
 * time the pack is opened: a file offered once is never offered again, and
 * nothing is taken off the Documents tab.
 */
export async function pullFileDocs(
  caseId: string,
  ctx: { by: string; tenants: string[]; landlord: string | null }
): Promise<PullOutcome> {
  const start = await getCase(caseId);
  if (!start) throw new PlcRefused("No pack with that reference.");
  const none = { case: start, added: [], left: [] };
  if (start.state !== "assembling" || !r2Configured) return none;

  const offered = new Set([...(start.fileKeys ?? []), ...start.documents.map((d) => d.key)]);
  const onPack = new Set(start.documents.map((d) => d.hash).filter(Boolean) as string[]);
  const startedAt = Date.parse(start.createdAt) || Date.now();
  const tooOld = (at: string) => Date.parse(at) < startedAt - TENANT_PAPERS_DAYS * 86_400_000;

  /* Newest first, so when the same file was uploaded twice under different
     labels, the later (corrected) one is the one read. */
  const all = (await storedDocsForHome({ address: start.address })).filter((d) => !offered.has(d.r2Key));
  if (!all.length) return none;

  const left: PullOutcome["left"] = [];
  const seen = new Set<string>();
  const fresh: (typeof all[number] & { hash: string | null })[] = [];
  for (const d of all) {
    const hint = CHECK_FOR_TYPE[d.type];
    if (hint && TENANT_CHECKS.has(hint) && tooOld(d.at)) continue;
    const hash = await hashOf(d.r2Key);
    if (hash && (onPack.has(hash) || seen.has(hash))) continue;
    /* Hashed before it is set aside, so an earlier copy of the same terms of
       business under the wrong label is set aside with it. */
    if (hash) seen.add(hash);
    if (NOT_FOR_A_PACK.has(d.type)) continue;
    fresh.push({ ...d, hash });
  }

  /* Read three at a time, file one at a time: each filing answers with the
     whole case, so two at once would lose one. */
  const reads = new Array(fresh.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(READ_AT_ONCE, fresh.length) }, async () => {
      while (next < fresh.length) {
        const i = next++;
        const d = fresh[i];
        reads[i] = await readDroppedFile(
          { key: d.r2Key, name: d.fileName },
          {
            address: start.address,
            landlordName: ctx.landlord,
            tenantNames: ctx.tenants,
            label: d.type === OTHER ? d.name : docTypeLabel(d.type),
          }
        );
      }
    })
  );

  const added: PullOutcome["added"] = [];
  let current = start;
  for (let i = 0; i < fresh.length; i++) {
    const d = fresh[i];
    const label = CHECK_FOR_TYPE[d.type];
    let read = reads[i] as Awaited<ReturnType<typeof readDroppedFile>>;
    let sure = read.checkId && read.confidence !== "low" ? read.checkId : null;
    /* A passport is a passport: whose it is, the reader can only guess, and
       the agent who labelled it knows. */
    const idSlots: CheckId[] = ["landlord-id-aml", "right-to-rent"];
    if (sure && label && sure !== label && idSlots.includes(sure) && idSlots.includes(label)) {
      sure = label;
      read = { ...read, checkId: label, note: undefined };
    }
    /* The reader is sure it is none of the pack's documents (an agency
       agreement, an inventory): it stays on the Documents tab. */
    const checkId: CheckId | null =
      sure === "other" ? null : sure ?? label ?? guessCheck(d.fileName) ?? null;
    if (!checkId) {
      left.push({ name: d.fileName, why: "not one of the pack's documents" });
      continue;
    }
    if (TENANT_CHECKS.has(checkId) && tooOld(d.at)) continue;
    try {
      current = await attachDocument(caseId, {
        checkId,
        name: d.fileName,
        key: d.r2Key,
        url: `/api/r2/file?key=${encodeURIComponent(d.r2Key)}`,
        addedBy: ctx.by,
        read,
        hash: d.hash ?? undefined,
        covers: (read.alsoCovers ?? []).filter((x) => COVERABLE[checkId]?.includes(x)),
        fromFile: true,
      });
      added.push({ name: d.fileName, checkId });
    } catch (e) {
      left.push({ name: d.fileName, why: e instanceof Error ? e.message : "it could not be filed" });
    }
  }

  current = await noteFileKeys(caseId, all.map((d) => d.r2Key));
  return { case: current, added, left };
}

/**
 * A file just uploaded on a pack, onto the home's Documents tab as well.
 * Never throws: the pack is the thing the agent is doing, and a Documents-tab
 * copy that failed must not undo the upload they just watched succeed.
 */
export async function mirrorToFile(
  c: PlcCase,
  doc: { checkId: CheckId; name: string; key: string; mime?: string; sizeBytes?: number },
  by: { id: string; name: string }
): Promise<void> {
  try {
    const type = TYPE_FOR_CHECK[doc.checkId] ?? OTHER;
    const ext = doc.name.split(".").pop()?.toLowerCase() ?? "";
    await addFileDoc({
      home: { address: c.address },
      from: { kind: "application", id: c.applicationRef },
      type,
      name: type === OTHER ? checkById(doc.checkId)?.label ?? "Document" : docTypeLabel(type),
      fileName: doc.name,
      r2Key: doc.key,
      mime: doc.mime || (ext === "pdf" ? "application/pdf" : ext ? `image/${ext === "jpg" ? "jpeg" : ext}` : "application/octet-stream"),
      sizeBytes: doc.sizeBytes ?? 0,
      by,
      isTest: isTestCase(c),
    });
    /* Already on this pack, so the next pull must not offer it back. */
    await noteFileKeys(c.id, [doc.key]);
  } catch (e) {
    console.error("[plc-from-file] mirror failed", e instanceof Error ? e.message : e);
  }
}
