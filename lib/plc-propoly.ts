import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { propolyErrorText, propolyUpload, PropolyWriteBlocked } from "@/lib/business/propoly";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import { getCase, recordPropolyPush } from "@/lib/plc-store";
import { checkById, type CheckId, type PlcCase, type PlcDocument, type PropolyPush, type PushResult } from "@/lib/plc";
import { isTestCase } from "@/lib/test-guard";
import { combineForSlot, type SlotPart } from "@/lib/propoly-combine";
import { PROPOLY_FILE_TYPES, propolyExtension, propolyFileName, propolyTypeFor } from "@/lib/propoly-names";

export { PROPOLY_NAME_MAX, propolyExtension, propolyFileName, propolyTypeFor } from "@/lib/propoly-names";

/**
 * The approved pack, into Propoly's document slots.
 *
 * Kirstie (4 Sep): "we're going to need to take all the PLC docs, and when we
 * send it to you, we'll also need to put them into Propoly docs, because
 * otherwise you're not going to be able to move the deal forward." Today she
 * uploads them again by hand. This does it from the pack she just approved.
 *
 * ── The slots ─────────────────────────────────────────────────────────────
 *
 * Propoly has seventeen named document types per deal (read live, 4 Sep) and
 * takes one file per type. The OS's nine checks do not map one to one:
 * "Landlord ID & AML" holds ID, proof of address and the AML report as three
 * files, and which is which is only knowable from the filename. So each file
 * is placed by check and then by name, and anything that fits nowhere goes
 * in as a General Document rather than not at all - a file in the wrong slot
 * is a click for Kirstie, a missing one is a failed check.
 *
 * ── Expiry ────────────────────────────────────────────────────────────────
 *
 * Gas, EPC and EICR need an expiry date or Propoly rejects them. The date
 * the reader found on the document is used (findings.foundDate); with none
 * read, the file is skipped and the reason recorded, because inventing a
 * date on a safety certificate is not a shortcut anybody should take.
 *
 * ── It never throws past the switch ───────────────────────────────────────
 *
 * Every document gets an outcome and the whole run is written to the case.
 * The one thing that stops it outright is the switch being off, which is
 * reported as a single skipped run rather than nine identical refusals.
 */

const COMPLIANCE_TYPES = new Set([
  "DealGasSafetyAttachment",
  "DealEpcAttachment",
  "DealElectricalInstallationAttachment",
  "DealPortableApplianceTestAttachment",
  "DealLegionellaRiskAssessmentAttachment",
]);

/**
 * The expiry for a certificate: the scan's foundDate, else the date the
 * reader printed off the file itself when it landed (doc.read.expiryDate).
 * 19 Oct 2026, 4 Williams Court: the scan left foundDate empty on both the
 * EPC and the EIC although each file's read held a printed expiry (2033), so
 * both were skipped. A date the reader worked out rather than read
 * (expiryDerived) is still never sent.
 */
export function expiryFor(c: PlcCase, doc: PlcDocument): string | null {
  const f = c.findings.find((x) => x.checkId === doc.checkId && x.foundDate);
  if (f?.foundDate) return f.foundDate;
  const read = doc.read;
  if (read?.expiryDate && !read.expiryDerived && /^\d{4}-\d{2}-\d{2}$/.test(read.expiryDate)) return read.expiryDate;
  return null;
}

/** Propoly's 409, "A Gas Safety Certificate already exists for this property". */
export function isAlreadyThere(status: number, body: unknown): boolean {
  return status === 409 || /already exists/i.test(propolyErrorText(body));
}

export type SendOutcome = "uploaded" | "already" | "skipped" | "failed";

/**
 * One file into one slot on a deal. Shared by the PLC pack's push, the
 * owner's push of a let's certificates (lib/deal-documents), the repush and
 * the guarantors. Throws PropolyWriteBlocked when the switch is off; every
 * answer from Propoly comes back as an outcome.
 *
 * "already" is done, not a fault: Propoly holds one file per slot, and a
 * certificate on the property (gas, EPC, EICR) or a landlord AML check or
 * proof of ownership on the deal answers 409 when it is there already
 * (21-22 Oct 2026, five tickets). It is said on the pack and raises no bug.
 */
export async function sendToDeal(
  dealId: string,
  f: { bytes: Uint8Array; mime: string; type: string; fileName: string; label?: string | null; expiry: string | null }
): Promise<{ outcome: SendOutcome; note: string }> {
  const ext = propolyExtension(f.fileName, f.mime);
  if (!ext) {
    const kind = /\.([A-Za-z0-9]{1,5})$/.exec(f.fileName.trim())?.[1]?.toLowerCase();
    return {
      outcome: "skipped",
      note: `Propoly only takes PDF, JPG or PNG${kind ? `, not .${kind}` : ""}. Save it as a PDF and upload it to the deal in Propoly.`,
    };
  }
  if (!f.bytes.byteLength) return { outcome: "skipped", note: "The stored file is empty, so there was nothing to send." };
  const form = new FormData();
  /* deal_uuid, as Propoly's spec has it. deal_id was sent until 9 Oct
     2026 and Propoly answers it "Missing required parameter: deal_uuid" -
     no approved pack had reached here yet, so nothing was lost. */
  form.set("deal_uuid", dealId);
  form.set("type", f.type);
  const named = propolyFileName(f.fileName, `document${ext}`);
  const fileName = /\.[A-Za-z0-9]{1,5}$/.test(named) ? named : propolyFileName(`${named}${ext}`, `document${ext}`);
  form.set("name", f.label ? propolyFileName(f.label, "Document") : fileName);
  if (f.expiry) form.set("expiration", f.expiry);
  /* Copied into a plain ArrayBuffer: the S3 client hands back a view over
     a buffer the Blob constructor will not accept as-is. */
  const copy = new Uint8Array(f.bytes.byteLength);
  copy.set(f.bytes);
  form.set("attached", new Blob([copy.buffer], { type: PROPOLY_FILE_TYPES[ext] }), fileName);
  const res = await propolyUpload("/api/v1/documents", form, { expected: isAlreadyThere });
  /* Everything Propoly said, field errors included, not just .message. */
  const msg = propolyErrorText(res.body);
  if (res.status === 201 || res.status === 200) return { outcome: "uploaded", note: "Uploaded." };
  if (isAlreadyThere(res.status, res.body)) {
    return { outcome: "already", note: msg ? `Already in Propoly ("${msg}"), so it keeps the one it has.` : "Propoly already holds a document in this slot." };
  }
  return { outcome: "failed", note: msg || `Propoly answered ${res.status}.` };
}

export async function bytesOf(doc: PlcDocument): Promise<{ bytes: Uint8Array; type: string }> {
  if (doc.placeholder) throw new Error("recorded by name only, never stored");
  if (!r2Configured) throw new Error("file storage isn't configured here");
  return withR2(async (client) => {
    const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: doc.key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("the stored file came back empty");
    const type = res.ContentType || (doc.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream");
    return { bytes, type };
  });
}

/** The Propoly deal for this pack's address. Same loose key the board uses. */
export async function propolyDealForCase(c: PlcCase): Promise<string | null> {
  const key = propertyKey(c.address);
  if (!key) return null;
  const deals = await getAllPropolyDeals().catch(() => null);
  if (!deals) return null;
  const live = deals.filter((d) => d.statusKey !== "cancelled" && d.statusKey !== "complete");
  const hit = live.find((d) => propertyKey(d.app.propertyName) === key) ?? deals.find((d) => propertyKey(d.app.propertyName) === key);
  return hit?.app.id ?? null;
}

/**
 * `onlyFailed` retries just the files the last push could not place and
 * keeps every other line of that push as it was (22 Oct 2026: James asked
 * for the five name-length refusals re-sent and nothing else; a full push
 * again would knock on every slot that is already filled). It only applies
 * to a last push against the same deal; otherwise the whole pack goes.
 */
export async function pushCaseToPropoly(caseId: string, by: string, opts: { onlyFailed?: boolean } = {}): Promise<PropolyPush> {
  const c = await getCase(caseId);
  if (!c) throw new Error("That pack no longer exists.");
  if (c.state !== "approved") throw new Error("Only an approved pack goes into Propoly.");
  if (isTestCase(c)) throw new Error("This is a test pack, so it stays in the OS and never goes to Propoly.");

  const at = new Date().toISOString();
  const dealId = await propolyDealForCase(c);
  if (!dealId) {
    const push: PropolyPush = {
      at,
      by,
      dealId: null,
      results: c.documents.map((d) => ({
        checkId: d.checkId,
        name: d.name,
        type: propolyTypeFor(d.checkId, d.name),
        outcome: "skipped",
        note: "No Propoly deal found for this address.",
      })),
    };
    await recordPropolyPush(caseId, push);
    return push;
  }

  const results: PushResult[] = [];
  const taken = new Set<string>();
  const last = opts.onlyFailed && c.propolyPush?.dealId === dealId ? c.propolyPush.results : null;
  if (last) for (const r of last) if (r.type && (r.outcome === "uploaded" || r.outcome === "already")) taken.add(r.type);
  /* Every file still to send for each slot: more than one goes as one PDF
     (lib/propoly-combine, 30 Oct 2026). Certificates keep one file each: one
     expiry date can't stand for two. */
  const toSend = c.documents.filter((doc) => {
    const before = last?.find((r) => r.checkId === doc.checkId && r.name === doc.name);
    return !last || before?.outcome === "failed";
  });
  const bySlot = new Map<string, PlcDocument[]>();
  for (const doc of toSend) {
    const t = propolyTypeFor(doc.checkId, doc.name);
    if (t && !COMPLIANCE_TYPES.has(t) && !doc.placeholder) bySlot.set(t, [...(bySlot.get(t) ?? []), doc]);
  }
  const done = new Set<PlcDocument>();
  for (const doc of c.documents) {
    if (done.has(doc)) continue;
    const before = last?.find((r) => r.checkId === doc.checkId && r.name === doc.name);
    if (last && before?.outcome !== "failed") {
      if (before) results.push(before);
      continue;
    }
    const type = propolyTypeFor(doc.checkId, doc.name);
    const group = type ? bySlot.get(type) ?? [] : [];
    if (type && group.length > 1 && !taken.has(type)) {
      group.forEach((g) => done.add(g));
      results.push(...(await sendCombined(dealId, type, group)));
      taken.add(type);
      continue;
    }
    const label = checkById(doc.checkId)?.label ?? doc.checkId;
    if (!type) {
      const note = doc.checkId === "terms-of-business" ? `${label} stays in the OS.` : `${label} is generated in Propoly after the check.`;
      results.push({ checkId: doc.checkId, name: doc.name, type: null, outcome: "skipped", note });
      continue;
    }
    if (taken.has(type)) {
      results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "skipped", note: "Propoly takes one file per slot and this slot already had one from this pack." });
      continue;
    }
    const expiry = COMPLIANCE_TYPES.has(type) ? expiryFor(c, doc) : null;
    if (COMPLIANCE_TYPES.has(type) && !expiry) {
      results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "skipped", note: "Propoly needs an expiry date for this and the reader did not find one on the document." });
      continue;
    }
    try {
      const { bytes, type: mime } = await bytesOf(doc);
      /* The agent's own name for an Anything else file (16 Oct 2026), else the file name. */
      const sent = await sendToDeal(dealId, { bytes, mime, type, fileName: doc.name, label: doc.label ?? null, expiry });
      if (sent.outcome === "uploaded" || sent.outcome === "already") taken.add(type);
      results.push({ checkId: doc.checkId, name: doc.name, type, ...sent });
    } catch (e) {
      if (e instanceof PropolyWriteBlocked) {
        results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "skipped", note: "Pushing documents into Propoly is switched off (Admin, Switches)." });
        continue;
      }
      results.push({ checkId: doc.checkId, name: doc.name, type, outcome: "failed", note: e instanceof Error ? e.message : "upload failed" });
    }
  }

  const push: PropolyPush = { at, by, dealId, results };
  await recordPropolyPush(caseId, push);
  return push;
}

/** Two or more files bound for one slot, sent as one PDF. One result line per file. */
async function sendCombined(dealId: string, type: string, group: PlcDocument[]): Promise<PushResult[]> {
  const label = checkById(group[0].checkId)?.label ?? "Documents";
  const line = (doc: PlcDocument, outcome: PushResult["outcome"], note: string): PushResult => ({ checkId: doc.checkId, name: doc.name, type, outcome, note });
  const parts: (SlotPart & { doc: PlcDocument })[] = [];
  const out: PushResult[] = [];
  for (const doc of group) {
    try {
      const { bytes, type: mime } = await bytesOf(doc);
      parts.push({ doc, name: doc.label || doc.name, bytes, mime, who: doc.read?.names ?? [] });
    } catch (e) {
      out.push(line(doc, "failed", e instanceof Error ? e.message : "the stored file couldn't be read"));
    }
  }
  if (!parts.length) return out;
  try {
    const combined = await combineForSlot(label, parts);
    const title = combined.title;
    for (const l of combined.left) out.push(line((l.part as (typeof parts)[number]).doc, "skipped", `Not in the combined file: ${l.why}.`));
    if (!combined.included.length) return out;
    const sent = await sendToDeal(dealId, { bytes: combined.bytes, mime: "application/pdf", type, fileName: `${title}.pdf`, label: title, expiry: null });
    const others = combined.included.length - 1;
    for (const p of combined.included) {
      const note = sent.outcome === "uploaded" ? `Sent as one PDF with ${others} other file${others === 1 ? "" : "s"} for this slot ("${title}").` : sent.note;
      out.push(line((p as (typeof parts)[number]).doc, sent.outcome, note));
    }
  } catch (e) {
    const note = e instanceof PropolyWriteBlocked ? "Pushing documents into Propoly is switched off (Admin, Switches)." : e instanceof Error ? e.message : "upload failed";
    for (const p of parts) out.push(line(p.doc, e instanceof PropolyWriteBlocked ? "skipped" : "failed", note));
  }
  return out;
}
