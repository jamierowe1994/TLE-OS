import "server-only";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { moveOrder, logEvent, getContractor, tenantsOf, type WorksOrder } from "@/lib/works-orders";
import { withR2, R2_BUCKET, safeName, r2Configured } from "@/lib/r2";
import { pendingKeyFor } from "@/lib/property-match";
import { CERT_TYPES, certificateExpiry, dateProblem, fileCertificate } from "@/lib/certificate-intake";
import { certFilesAs, kindFilesOnIssueDate } from "@/lib/cert-kinds";
import { fileType } from "@/lib/upload-rules";
import type { SharePerson } from "@/lib/certificate-share";
import { jobTenants } from "@/lib/works-emails";

/**
 * A certificate from a job's visit, filed properly: on the job for its own
 * paperwork, done if it was not already, and on the home's compliance record
 * as the current certificate (the vault, os_certificates, REX when armed),
 * waiting for compliance to check it before it goes to anyone.
 *
 * Two doors use it. The contractor's page (14 Sep 2026), and since 8 Oct 2026
 * the job sheet - James: "if they just text them with the finished product
 * and all of the docs, then we need a place to not only confirm that it's
 * been completed but also upload the documents to replace the current one."
 * One function, so the two can never file a certificate differently.
 */
export class CertificateRefused extends Error {}

export async function fileJobCertificate(o: WorksOrder, input: {
  bytes: Uint8Array; fileName: string; contentType: string;
  type: string; expiry: string; issue?: string | null;
  /** Who it is from, for the timeline and the record. */
  by: string;
  /** Where it came in, for the record: "the contractor's page, job #1044". */
  source: string;
  /** The done note when this is what finishes the job. */
  doneNote: string;
}): Promise<{ next: WorksOrder; certificate: { filed: boolean; share: string | null; rehearsal?: true } }> {
  /* What was picked, and the REX type it is filed as (lib/cert-kinds). */
  const type = input.type.trim();
  const filesAs = certFilesAs(type);
  const issue = (input.issue ?? "").trim();
  if (!CERT_TYPES.has(filesAs)) throw new CertificateRefused("Choose what the certificate is.");
  /* A PAT report or a fire safety certificate prints the day it was done and
     no expiry: that day is enough, and it runs the type's usual life from
     there - the same rule as the home's own page and the Compliance door
     (lib/certificate-intake certificateExpiry). This asked for an expiry
     whatever the type until 10 Nov 2026, so neither could be put on a job. */
  const issueBad = issue ? dateProblem(issue, "issue") : null;
  if (issueBad) throw new CertificateRefused(issueBad);
  const expiry = certificateExpiry(filesAs, input.expiry.trim(), issue);
  if (!expiry) {
    throw new CertificateRefused(
      kindFilesOnIssueDate(type)
        ? `Put in the date it was ${filesAs === "portable_appliance_testing" ? "tested" : "checked"}. It has no expiry date, so that is all it needs.`
        : "Put the date it runs out on it."
    );
  }
  const expiryBad = dateProblem(expiry, "expiry");
  if (expiryBad) throw new CertificateRefused(expiryBad);
  if (!r2Configured) throw new CertificateRefused("Storage isn't connected on this environment.");
  /* Kept under the type it really is: a photo the phone gave no type goes by its extension. */
  const contentType = fileType(input.fileName, input.contentType) || "application/octet-stream";

  /* The file is in R2 TWICE, once on the job and once in the property's
     compliance vault, and that is deliberate: the job keeps its own paperwork
     for the timeline, and compliance keeps a copy filed by property and type
     that survives the job being archived. */
  const key = `documents/works-${o.ref}/${Date.now()}-${safeName(input.fileName) || "file"}`;
  await withR2((client) => client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: input.bytes, ContentType: contentType })));
  let next = await moveOrder(o.id, { action: "file", file: { key, name: input.fileName, type: contentType } }, input.by);
  if (!next.completedAt) next = await moveOrder(o.id, { action: "done", note: input.doneNote }, input.by);

  /* A rehearsal files nothing: its house is invented, so a real certificate
     row would land on an address that does not exist. */
  if (o.rehearsal) {
    await logEvent(o.id, "TLE OS", "compliance", `Rehearsal: ${input.fileName} would be filed as a certificate on the property here; nothing was filed.`);
    return { next, certificate: { filed: false, share: null, rehearsal: true } };
  }
  /* Who the book cannot name: the job's own landlord and every tenant on it
     are the fallback for a home REX's managed book does not carry, and the
     contractor is only ever knowable from here. A skipped landlord stays
     skipped. */
  const c = o.contractorId ? await getContractor(o.contractorId).catch(() => null) : null;
  const people: SharePerson[] = [
    ...(o.landlordEmail && !o.landlordSkipped ? [{ role: "landlord" as const, name: o.landlord, email: o.landlordEmail }] : []),
    /* The tenants who still live there, as the works order names them (lib/works-emails jobTenants, 10 Nov 2026). */
    ...(await jobTenants(o).catch(() => tenantsOf(o))).filter((t) => t.email.includes("@")).map((t) => ({ role: "tenant" as const, name: t.name, email: t.email })),
    ...(c?.email ? [{ role: "contractor" as const, name: c.contact || c.name, email: c.email }] : []),
  ];
  const address = [o.propertyName, o.locality].filter(Boolean).join(", ");
  const filed = await fileCertificate({
    bytes: input.bytes,
    fileName: input.fileName,
    contentType,
    propertyId: o.propertyId || pendingKeyFor(address),
    propertyName: address,
    type,
    expiry,
    issue: issue || null,
    source: input.source,
    by: input.by,
    people,
  });
  await logEvent(
    o.id,
    "TLE OS",
    "compliance",
    filed.duplicate
      ? `${input.fileName} is already on this home's compliance record; nothing filed twice.`
      : `${input.fileName} filed as the home's current certificate. ${filed.row.rex_note || "REX not written."} ${filed.share?.line ?? ""}`.trim()
  );
  return { next, certificate: { filed: !filed.duplicate, share: filed.share?.line ?? null } };
}
