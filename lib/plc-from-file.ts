import "server-only";
import { londonToday } from "@/lib/london-clock";
import { createHash } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { addFileDoc, storedDocsForHome } from "@/lib/file-documents";
import { hasDb, q } from "@/lib/db";
import { parseAddress, sameHome } from "@/lib/address-parse";
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

export type PullSource = "file" | "certificates" | "landlord";

export type PullOutcome = {
  case: PlcCase;
  added: { name: string; checkId: CheckId; source: PullSource }[];
  left: { name: string; why: string }[];
};

type Read = Awaited<ReturnType<typeof readDroppedFile>>;
type Ctx = { by: string; tenants: string[]; landlord: string | null; propertyId: string | null };

/** Run `fn` over `items` three at a time, answers in order. */
async function inThrees<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(READ_AT_ONCE, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

/** Every check the pack already has a file for, counting what a file also covers. */
const filledOn = (c: PlcCase) => new Set(c.documents.flatMap((d) => [d.checkId, ...(d.covers ?? [])]));

const ymdToday = () => londonToday();
const daysBefore = (ymd: string, days: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
const shortAddress = (a: string) => a.split(",").slice(0, 2).join(",").trim();

/**
 * Bring what the OS already holds into an open pack (Kirstie and James,
 * 8 Oct 2026). Three places, in this order, each only where the pack still
 * has a gap after the one before:
 *
 *   1. this home's Documents tab - everything, read and sorted;
 *   2. this home's certificates on file (os_certificates: the Propoly
 *      download, renewals, the EPC register) - an EPC lasts ten years and
 *      nobody should download it to upload it again;
 *   3. the landlord's ID and AML from the packs and Documents tabs of their
 *      OTHER homes - a landlord with four homes shows their passport once.
 *
 * Safe to call every time the pack is opened: a file filed once and taken
 * off again is never brought back, and nothing is removed from anywhere.
 */
export async function pullFileDocs(caseId: string, ctx: Ctx): Promise<PullOutcome> {
  const start = await getCase(caseId);
  if (!start) throw new PlcRefused("No pack with that reference.");
  if (start.state !== "assembling" || !r2Configured) return { case: start, added: [], left: [] };

  const home = await homeRecords(start.address, ctx.propertyId);
  const landlord = (ctx.landlord ?? home.landlord ?? "").trim() || null;
  if (hasDb()) {
    await q(`UPDATE os_plc_cases SET rex_property_id = COALESCE($2, rex_property_id), landlord_name = COALESCE($3, landlord_name) WHERE id = $1`, [
      caseId,
      ctx.propertyId,
      landlord,
    ]).catch(() => undefined);
  }

  const run: Run = {
    caseId,
    ctx: { ...ctx, landlord },
    current: start,
    offered: new Set([...(start.fileKeys ?? []), ...start.documents.map((d) => d.key)]),
    hashes: new Set(start.documents.map((d) => d.hash).filter(Boolean) as string[]),
    added: [],
    left: [],
    remember: [],
  };

  await fromDocumentsTab(run);
  await fromCertificates(run, home.ids);
  if (landlord) await fromLandlordsOtherHomes(run, landlord, home.ids);

  if (run.remember.length) run.current = await noteFileKeys(caseId, run.remember);
  return { case: run.current, added: run.added, left: run.left };
}

type Run = {
  caseId: string;
  ctx: Ctx;
  current: PlcCase;
  /** Keys on the pack, or offered to it before. */
  offered: Set<string>;
  /** Contents on the pack or filed in this run. */
  hashes: Set<string>;
  added: PullOutcome["added"];
  left: PullOutcome["left"];
  /** Keys never to offer this pack again. */
  remember: string[];
};

/** File one; a refusal (a twin, a pack that has gone) is noted, never thrown. */
async function file(run: Run, source: PullSource, d: { key: string; name: string; checkId: CheckId; read: Read; hash: string | null }) {
  try {
    run.current = await attachDocument(run.caseId, {
      checkId: d.checkId,
      name: d.name,
      key: d.key,
      url: `/api/r2/file?key=${encodeURIComponent(d.key)}`,
      addedBy: run.ctx.by,
      read: d.read,
      hash: d.hash ?? undefined,
      covers: (d.read.alsoCovers ?? []).filter((x) => COVERABLE[d.checkId]?.includes(x)),
      fromFile: true,
    });
    run.added.push({ name: d.name, checkId: d.checkId, source });
    run.offered.add(d.key);
    run.remember.push(d.key);
    if (d.hash) run.hashes.add(d.hash);
  } catch (e) {
    run.left.push({ name: d.name, why: e instanceof Error ? e.message : "it could not be filed" });
  }
}

/** The reader's slot if it is sure, the label's if it is not; whose passport it is, the label knows. */
function slotFor(read: Read, label: CheckId | null): { checkId: CheckId | null; read: Read } {
  let sure = read.checkId && read.confidence !== "low" ? read.checkId : null;
  const idSlots: CheckId[] = ["landlord-id-aml", "right-to-rent"];
  if (sure && label && sure !== label && idSlots.includes(sure) && idSlots.includes(label)) {
    return { checkId: label, read: { ...read, checkId: label, note: undefined } };
  }
  /* The reader is sure it is none of the pack's documents (an agency
     agreement, an inventory): it is left where it is. */
  if (sure === "other") sure = null;
  return { checkId: sure ?? label, read };
}

/* ── 1. This home's Documents tab ───────────────────────────────────────── */

async function fromDocumentsTab(run: Run) {
  const start = run.current;
  const startedAt = Date.parse(start.createdAt) || Date.now();
  const tooOld = (at: string) => Date.parse(at) < startedAt - TENANT_PAPERS_DAYS * 86_400_000;

  /* Newest first, so when the same file was uploaded twice under different
     labels, the later (corrected) one is the one read. */
  const all = (await storedDocsForHome({ address: start.address, propertyId: run.ctx.propertyId })).filter(
    (d) => !run.offered.has(d.r2Key)
  );
  if (!all.length) return;

  const seen = new Set<string>();
  const fresh: (typeof all[number] & { hash: string | null })[] = [];
  for (const d of all) {
    const hint = CHECK_FOR_TYPE[d.type];
    if (hint && TENANT_CHECKS.has(hint) && tooOld(d.at)) continue;
    const hash = await hashOf(d.r2Key);
    if (hash && (run.hashes.has(hash) || seen.has(hash))) continue;
    /* Hashed before it is set aside, so an earlier copy of the same terms of
       business under the wrong label is set aside with it. */
    if (hash) seen.add(hash);
    if (NOT_FOR_A_PACK.has(d.type)) continue;
    fresh.push({ ...d, hash });
  }

  const reads = await inThrees(fresh, (d) =>
    readDroppedFile(
      { key: d.r2Key, name: d.fileName },
      {
        address: start.address,
        landlordName: run.ctx.landlord,
        tenantNames: run.ctx.tenants,
        label: d.type === OTHER ? d.name : docTypeLabel(d.type),
      }
    )
  );

  for (let i = 0; i < fresh.length; i++) {
    const d = fresh[i];
    const { checkId, read } = slotFor(reads[i], CHECK_FOR_TYPE[d.type] ?? guessCheck(d.fileName));
    if (!checkId) {
      run.left.push({ name: d.fileName, why: "not one of the pack's documents" });
      continue;
    }
    if (TENANT_CHECKS.has(checkId) && tooOld(d.at)) continue;
    await file(run, "file", { key: d.r2Key, name: d.fileName, checkId, read, hash: d.hash });
  }
  /* Offered once: one the agent takes off the pack is not brought back. */
  run.remember.push(...all.map((d) => d.r2Key));
}

/* ── 2. This home's certificates on file ────────────────────────────────── */

/** os_certificates type → the check it answers. */
const CHECK_FOR_CERT: Record<string, CheckId> = {
  gas_safety: "gas-safety",
  eicr: "eicr",
  epc: "epc",
  mandatory_hmo_license: "licensing",
  additional_hmo_license: "licensing",
  selective_hmo_license: "licensing",
  portable_appliance_testing: "pat",
  legionella_risk_assessment: "legionella",
  emergency_lighting_fire_exit: "emergency-lighting",
  smoke_alarms: "alarms",
  co_alarms: "alarms",
};

/** Read at most this many stored certificates per check before giving up on it. */
const PER_CHECK = 3;

/** This home on the OS's property record: every id its certificates may be filed under, and its landlord. */
async function homeRecords(address: string, propertyId: string | null): Promise<{ ids: string[]; landlord: string | null }> {
  const ids = new Set<string>(propertyId ? [propertyId] : []);
  if (!hasDb()) return { ids: [...ids], landlord: null };
  const street = parseAddress(address).street;
  const rows = await q<{ id: string; rex_property_id: string | null; address: string; landlord_name: string | null }>(
    `SELECT id, rex_property_id, address, landlord_name FROM os_properties
      WHERE active AND (($1 <> '' AND rex_property_id = $1) OR ($2 <> '' AND address ILIKE '%' || $2 || '%'))`,
    [propertyId ?? "", street]
  ).catch(() => []);
  const mine = rows.filter((r) => (propertyId && r.rex_property_id === propertyId) || sameHome(r.address, address));
  for (const r of mine) {
    ids.add(r.id);
    if (r.rex_property_id) ids.add(r.rex_property_id);
  }
  return { ids: [...ids], landlord: mine.find((r) => r.landlord_name?.trim())?.landlord_name?.trim() ?? null };
}

async function fromCertificates(run: Run, ids: string[]) {
  if (!ids.length || !hasDb()) return;
  const validOn = run.current.moveInDate ?? ymdToday();
  const rows = await q<{ type_id: string; expiry: string; issue: string | null; r2_key: string; name: string; source: string }>(
    `SELECT type_id, expiry::text AS expiry, issue::text AS issue, r2_key, name, source
       FROM os_certificates
      WHERE property_id = ANY($1) AND expiry >= $2::date AND NOT awaiting_check
      ORDER BY expiry DESC, added_at DESC`,
    [ids, validOn]
  ).catch(() => []);

  /* Only where the pack still has nothing, and a few per check: a home with
     seven copies of one EICR needs one read, not seven. */
  const filled = filledOn(run.current);
  const perCheck = new Map<CheckId, number>();
  const picked: (typeof rows[number] & { check: CheckId })[] = [];
  for (const r of rows) {
    const check = CHECK_FOR_CERT[r.type_id];
    if (!check || filled.has(check) || run.offered.has(r.r2_key)) continue;
    const n = perCheck.get(check) ?? 0;
    if (n >= PER_CHECK) continue;
    perCheck.set(check, n + 1);
    picked.push({ ...r, check });
  }
  if (!picked.length) return;

  const hashes = await inThrees(picked, (r) => hashOf(r.r2_key));
  /* Read, because the store is not always right about what a file is: the
     Wheatsheaf Court EPC is on file as an EICR too. */
  const reads = await inThrees(picked, (r) =>
    readDroppedFile(
      { key: r.r2_key, name: r.name },
      { address: run.current.address, landlordName: run.ctx.landlord, label: checkById(r.check)?.label ?? r.type_id }
    )
  );

  for (let i = 0; i < picked.length; i++) {
    const r = picked[i];
    const hash = hashes[i];
    if (hash && run.hashes.has(hash)) continue;
    const { checkId, read } = slotFor(reads[i], r.check);
    if (!checkId || filledOn(run.current).has(checkId)) continue;
    /* The date on file was typed off the certificate; the reader's own beats
       it only when it was printed, not worked out. */
    const printed = read.expiryDate && !read.expiryDerived ? read.expiryDate : null;
    const expiry = printed ?? r.expiry;
    if (expiry < validOn) continue;
    await file(run, "certificates", {
      key: r.r2_key,
      name: r.name,
      checkId,
      hash,
      read: {
        ...read,
        expiryDate: expiry,
        expiryDerived: undefined,
        issueDate: read.issueDate ?? r.issue,
        note: `Already on file for this home${r.source ? ` (${r.source})` : ""}.`,
      },
    });
  }
}

/* ── 3. The landlord's papers from their other homes ────────────────────── */

const LANDLORD_CHECKS: CheckId[] = ["landlord-id-aml", "landlord-aml"];

/** An AML check older than this on the move-in date is done again, not reused. */
const AML_MONTHS = 12;

/** Joint owners: room for two of each. */
const PER_LANDLORD_CHECK = 2;

const isCompany = (name: string) => /\b(ltd|limited|llp|plc|inc|properties|holdings|lettings|estates|group|trust)\b/i.test(name);

/** Does the paper name the landlord? A company's director is not checkable here. */
function namesLandlord(read: Read | null | undefined, landlord: string): boolean {
  if (isCompany(landlord) || !read?.names?.length) return true;
  const surnames = landlord
    .split(/\s*(?:&|\band\b|,)\s*/i)
    .map((p) => p.trim().split(/\s+/).pop()?.toLowerCase() ?? "")
    .filter((s) => s.length > 1);
  return read.names.some((n) => surnames.some((s) => n.toLowerCase().includes(s)));
}

async function fromLandlordsOtherHomes(run: Run, landlord: string, thisHome: string[]) {
  if (!hasDb()) return;
  const filled = filledOn(run.current);
  const gaps = LANDLORD_CHECKS.filter((c) => !filled.has(c));
  if (!gaps.length) return;

  const homes = await q<{ id: string; rex_property_id: string | null; address: string }>(
    `SELECT id, rex_property_id, address FROM os_properties
      WHERE active AND lower(trim(landlord_name)) = lower(trim($1))`,
    [landlord]
  ).catch(() => []);
  const others = homes.filter((h) => !thisHome.includes(h.id) && !sameHome(h.address, run.current.address));
  const otherIds = new Set(others.flatMap((h) => [h.id, h.rex_property_id].filter(Boolean) as string[]));
  const atOther = (address: string, rexId?: string | null) =>
    (rexId && otherIds.has(rexId)) || others.some((h) => sameHome(h.address, address));

  /* `confirmed`: filed on another pack, where the agent saw the slot - that
     beats the reader, whose answer on an older pack may predate the split of
     ID and AML (7 Oct 2026). */
  type Candidate = { key: string; name: string; label: CheckId; at: string; from: string; read: Read | null; hash?: string | null; confirmed?: boolean };
  const candidates: Candidate[] = [];

  /* Other packs: the landlord's, by name or by home. Their files were read when they went on. */
  const packs = await q<{ id: string; address: string; landlord_name: string | null; rex_property_id: string | null; documents: PlcCase["documents"] }>(
    `SELECT id, address, landlord_name, rex_property_id, documents FROM os_plc_cases WHERE id <> $1`,
    [run.caseId]
  ).catch(() => []);
  for (const p of packs) {
    const theirs =
      (p.landlord_name && p.landlord_name.trim().toLowerCase() === landlord.toLowerCase()) || atOther(p.address, p.rex_property_id);
    if (!theirs || sameHome(p.address, run.current.address)) continue;
    for (const d of p.documents ?? []) {
      if (!gaps.includes(d.checkId) || d.placeholder) continue;
      candidates.push({ key: d.key, name: d.name, label: d.checkId, at: d.addedAt, from: p.address, read: d.read ?? null, hash: d.hash ?? null, confirmed: true });
    }
  }

  /* The Documents tabs of their other homes. */
  const tabRows = await q<{ address: string; rex_property_id: string | null; type: string; file_name: string; r2_key: string; at: Date }>(
    `SELECT address, rex_property_id, type, file_name, r2_key, at FROM os_file_documents
      WHERE removed_at IS NULL AND type IN ('landlord_id', 'landlord_aml')
      ORDER BY at DESC LIMIT 400`
  ).catch(() => []);
  for (const r of tabRows) {
    if (!atOther(r.address, r.rex_property_id)) continue;
    const label = CHECK_FOR_TYPE[r.type];
    if (!gaps.includes(label)) continue;
    candidates.push({ key: r.r2_key, name: r.file_name, label, at: new Date(r.at).toISOString(), from: r.address, read: null });
  }

  /* Newest first, one of each file. */
  const byKey = new Map<string, Candidate>();
  for (const c of candidates.sort((a, b) => b.at.localeCompare(a.at))) {
    if (!run.offered.has(c.key) && !byKey.has(c.key)) byKey.set(c.key, c);
  }
  const fresh = [...byKey.values()];
  if (!fresh.length) return;

  const hashes = await inThrees(fresh, (c) => (c.hash ? Promise.resolve(c.hash) : hashOf(c.key)));
  const reads = await inThrees(fresh, (c) =>
    c.read
      ? Promise.resolve(c.read)
      : readDroppedFile(
          { key: c.key, name: c.name },
          { address: c.from, landlordName: landlord, label: checkById(c.label)?.label ?? null }
        )
  );

  const validOn = run.current.moveInDate ?? ymdToday();
  const amlFrom = daysBefore(validOn, Math.round(AML_MONTHS * 30.4));
  const count = new Map<CheckId, number>();
  for (let i = 0; i < fresh.length; i++) {
    const c = fresh[i];
    const hash = hashes[i];
    if (hash && run.hashes.has(hash)) continue;
    const { checkId, read } = c.confirmed ? { checkId: c.label, read: reads[i] } : slotFor(reads[i], c.label);
    if (!checkId || !gaps.includes(checkId)) continue;
    if ((count.get(checkId) ?? 0) >= PER_LANDLORD_CHECK) continue;
    /* In date on the move-in: an ID by its expiry, an AML check by its age. */
    if (checkId === "landlord-id-aml" && read.expiryDate && read.expiryDate < validOn) continue;
    if (checkId === "landlord-aml" && (read.issueDate ?? c.at.slice(0, 10)) < amlFrom) continue;
    if (!namesLandlord(read, landlord)) continue;
    count.set(checkId, (count.get(checkId) ?? 0) + 1);
    await file(run, "landlord", {
      key: c.key,
      name: c.name,
      checkId,
      hash,
      read: { ...read, checkId, note: `${landlord}'s, from ${shortAddress(c.from)}.` },
    });
  }
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
