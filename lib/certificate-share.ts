import "server-only";
import { randomBytes } from "node:crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { ResendBlocked, sendEmail } from "@/lib/resend";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { certificateSharedEmail } from "@/lib/email/works-internal";
import { certsKeyFor, held, managedBookFor } from "@/lib/managed-book-cache";
import { invoiceSettings } from "@/lib/invoices";
import { switchOn } from "@/lib/switches";
import { VAULT_LABEL } from "@/lib/vault";
import type { ManagedProperty } from "@/lib/portfolio-types";
import type { ComplianceBook } from "@/lib/rex-compliance";
import type { CertKey } from "@/lib/compliance";

/**
 * A RENEWED CERTIFICATE GOES TO EVERYONE WHO IS ENTITLED TO IT.
 *
 * James, 14 Sep 2026: "When a landlord updates the work, whether that's we
 * upload the new certificate on the OS, the contractor uploads the certificate
 * using the contractor portal, or the landlord emails over, we need to update
 * the other parties... and that needs to go out to all parties via email for
 * audit log trail purposes."
 *
 * Michael, 7 Sep 2026: by law within 30 days, and today it is done by hand in
 * Propoly.
 *
 * ── ONE FAN-OUT, THREE DOORS ──────────────────────────────────────────────
 *
 * A certificate reaches the OS three ways, and all three end up in the same
 * place - a row in os_certificates with the file in R2 and the entry written
 * into REX's compliance tab:
 *
 *   the OS          an agent or Michael attaches it on the property file, on a
 *                   listing, or on an application. Includes the landlord
 *                   emailing it over, which is a person saving the attachment
 *                   and filing it here with "emailed by the landlord" as the
 *                   source - there is no inbound mailbox yet and pretending
 *                   otherwise would be a fourth code path that never runs.
 *   the contractor  their own page, no sign-in, from the link in the works
 *                   order. New on 14 Sep 2026.
 *   a PLC pack      approval writes the pack's certificates through the same
 *                   intake.
 *
 * So the fan-out hangs off the STORED ROW and not off any of the doors. Add a
 * fourth door and it gets this for free; change the rule and it changes for
 * all of them at once. That is the same reasoning as pingCompliance in
 * lib/works-compliance.ts, and deliberately so.
 *
 * ── NEVER AN INVOICE. NEVER A COST. ───────────────────────────────────────
 *
 * James was explicit: "we don't send any invoices, so how much things cost."
 * This is structural rather than a filter. Everything sent here comes out of
 * os_certificates, which holds compliance documents and has no money column;
 * a contractor's invoice goes to accounts down a completely separate path
 * (tellAccounts in lib/works-emails) and never becomes a certificate row. The
 * only way an amount could reach a landlord from here is if somebody added one
 * to the copy, which is why it says so in lib/email/tle-documents too.
 *
 * ── WHEN IT FIRES, AND WHEN IT DELIBERATELY DOES NOT ──────────────────────
 *
 * Three gates, cheapest first, so the expensive ones are never reached by a
 * bulk load:
 *
 *   1. THE SWITCH (certificate_share). Off is shadow: work out who should
 *      have it, write a row per person saying so, send nothing. Off until the
 *      Propoly backlog has finished, because armed during it every landlord
 *      would hear about a certificate from two years ago.
 *   2. IN DATE. An expired certificate is not news anybody wants attached to
 *      an email, and sending one implies it is current.
 *   3. A RENEWAL, WITH SOMEBODY LIVING THERE. Michael's rule: "on renewal
 *      only - the first send is PayProp's". A renewal means we already hold
 *      an earlier certificate of that type for that home; a sitting tenant
 *      means there is somebody with a legal right to it. A first certificate
 *      on an empty property belongs to the let's own paperwork, not here.
 *
 * The REX certificate book is consulted for gate 3 ONLY from cache - never a
 * fresh walk. That walk is minutes over the whole book, and a certificate
 * upload must not wait on it.
 *
 * ── IDEMPOTENT, AND HONEST ABOUT FAILURE ─────────────────────────────────
 *
 * Every attempt writes a row to os_certificate_sends, and a unique index on
 * the SENT ones means nobody is emailed the same certificate twice however
 * often the intake runs. Failures are not covered by that index, so they can
 * be retried, and they are kept - "REX holds no email address for this
 * landlord" is the finding that gets the address fixed.
 */

export type ShareRole = "landlord" | "tenant" | "contractor" | "compliance";

export interface SharePerson {
  role: ShareRole;
  name: string;
  email: string;
}

export interface ShareOutcome extends SharePerson {
  address: string;
  sent: boolean;
  note: string;
}

/** What the fan-out needs to know about a certificate. The os_certificates row. */
export interface ShareCertificate {
  id: string;
  propertyId: string;
  propertyName: string;
  /** REX's type id - gas_safety, eicr, epc … */
  typeId: string;
  /** YYYY-MM-DD. */
  expiry: string;
  r2Key: string;
  name: string;
  source: string;
}

export interface ShareResult {
  /** True when email actually went. False for shadow, and for every skip. */
  armed: boolean;
  /** Why nobody was written to, when nobody was. Null when the fan-out ran. */
  skipped: string | null;
  outcomes: ShareOutcome[];
  /** One line for a screen or a timeline. */
  line: string;
}

/** REX's type id → the OS's certificate key, the same map the intake uses. */
const CERT_KEY: Record<string, string> = {
  gas_safety: "gas",
  eicr: "eicr",
  epc: "epc",
  mandatory_hmo_license: "licence",
  additional_hmo_license: "licence",
  selective_hmo_license: "licence",
  legionella_risk_assessment: "legionella",
  portable_appliance_testing: "pat",
  smoke_alarms: "alarms",
  co_alarms: "alarms",
  emergency_lighting_fire_exit: "fire",
};

/* Resend's own ceiling is 40MB across the whole request; a certificate is a
   couple of hundred KB and anything near this is a scan of a scan. Over it,
   the landlord gets told it is on their portal rather than nothing at all -
   so the cap degrades the email, never the send. */
const MAX_ATTACH_BYTES = 12 * 1024 * 1024;

const ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");
const first = (name: string) => (name || "there").trim().split(/\s+/)[0];
const labelFor = (typeId: string) => VAULT_LABEL[CERT_KEY[typeId] ?? ""] ?? typeId.replace(/_/g, " ");
const pretty = (ymd: string) => {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : ymd;
};
const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/* ── the record ──────────────────────────────────────────────────────────── */

async function alreadyHad(certificateId: string): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ role: string; address: string }>(
    `SELECT role, lower(address) AS address FROM os_certificate_sends WHERE certificate_id = $1 AND sent`,
    [certificateId]
  ).catch(() => []);
  return new Set(rows.map((r) => `${r.role}|${r.address}`));
}

async function record(cert: ShareCertificate, o: ShareOutcome): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_certificate_sends (id, certificate_id, property_id, type_id, role, name, address, sent, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [randomBytes(12).toString("hex"), cert.id, cert.propertyId, cert.typeId, o.role, o.name, o.address, o.sent, o.note]
  ).catch(() => {
    /* Recording is not the job; delivering was. A clash on the unique index
       means somebody already has it, which is the answer we wanted anyway. */
  });
}

/** What has gone out on a certificate, newest first. For the property file. */
export async function certificateSends(certificateIds: string[]): Promise<Map<string, ShareOutcome[]>> {
  const out = new Map<string, ShareOutcome[]>();
  if (!hasDb() || !certificateIds.length) return out;
  const rows = await q<{ certificate_id: string; role: string; name: string; address: string; sent: boolean; note: string }>(
    `SELECT certificate_id, role, name, address, sent, note FROM os_certificate_sends
      WHERE certificate_id = ANY($1) ORDER BY at DESC`,
    [certificateIds]
  ).catch(() => []);
  for (const r of rows) {
    const list = out.get(r.certificate_id) ?? [];
    list.push({ role: r.role as ShareRole, name: r.name, email: r.address, address: r.address, sent: r.sent, note: r.note });
    out.set(r.certificate_id, list);
  }
  return out;
}

/* ── who should have it ──────────────────────────────────────────────────── */

/**
 * The landlord and the sitting tenants, off the cached managed book.
 *
 * The whole book rather than an agent's slice: this runs with no signed-in
 * person behind it (a contractor's upload, a cron), and a certificate's
 * recipients do not depend on whose screen it was filed from.
 *
 * A home the book does not carry - an OS-only `pm-` property, an address with
 * no REX property yet - returns null, and the caller's own fallback people are
 * used instead. Guessing from the address would be worse than not knowing.
 */
async function homeFor(propertyId: string): Promise<ManagedProperty | null> {
  if (!propertyId || /^(pending-|pm-)/i.test(propertyId)) return null;
  try {
    const { book } = await managedBookFor(null);
    return book.properties.find((p) => p.propertyId === propertyId) ?? null;
  } catch {
    return null;
  }
}

/* ── the gates ───────────────────────────────────────────────────────────── */

/**
 * Is this a renewal? Do we already hold an earlier certificate of this type
 * for this home?
 *
 * The OS's own table first, which is indexed and answers most cases on its own
 * once the Propoly backlog has loaded. Then REX's certificate book, but ONLY
 * if it is already in cache - a fresh walk is minutes and an upload cannot
 * wait on one. Nothing held in either place means we cannot call it a renewal,
 * and the fan-out holds off rather than guessing.
 */
async function isRenewal(cert: ShareCertificate): Promise<boolean> {
  if (!hasDb()) return false;
  const earlier = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM os_certificates
      WHERE property_id = $1 AND type_id = $2 AND id <> $3 AND expiry < $4`,
    [cert.propertyId, cert.typeId, cert.id, cert.expiry]
  ).catch(() => []);
  if (Number(earlier[0]?.n ?? 0) > 0) return true;

  /* REX's copy, from cache only. The compliance book keys certificates by
     OUR key rather than REX's type id, so the map is applied first. */
  const key = CERT_KEY[cert.typeId] as CertKey | undefined;
  if (!key) return false;
  try {
    const cached = await held<ComplianceBook>(certsKeyFor(null));
    const home = cached?.data.properties.find((p) => p.id === cert.propertyId);
    return Boolean(home?.certs?.[key]);
  } catch {
    return false;
  }
}

/* ── the send ────────────────────────────────────────────────────────────── */

async function attachment(cert: ShareCertificate): Promise<{ filename: string; content: string } | null> {
  if (!r2Configured) return null;
  try {
    const obj = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: cert.r2Key })));
    if ((obj.ContentLength ?? 0) > MAX_ATTACH_BYTES) return null;
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return null;
    return { filename: cert.name || "certificate.pdf", content: Buffer.from(bytes).toString("base64") };
  } catch {
    return null;
  }
}

const DOC: Record<Exclude<ShareRole, "compliance">, string> = {
  landlord: "certificate-shared-landlord",
  tenant: "certificate-shared-tenant",
  contractor: "certificate-shared-contractor",
};

/**
 * Send one party their copy.
 *
 * Customer audience for all three, so the public Letting Experts sender is
 * used and the customer-email switch gates it on top of this one. A
 * contractor is a customer for this purpose: they are not staff, and the OS
 * domain must not write to them.
 */
async function sendTo(cert: ShareCertificate, person: SharePerson, alsoLine: string, file: { filename: string; content: string } | null): Promise<ShareOutcome> {
  const address = person.email.trim();
  const base: ShareOutcome = { ...person, address, sent: false, note: "" };
  if (!isEmail(address)) return { ...base, note: `no email address on the record for the ${person.role}` };
  const id = DOC[person.role as Exclude<ShareRole, "compliance">];
  let subject = "", html = "";
  try {
    ({ subject, html } = await renderTleEmailLive(id, {
      firstName: first(person.name),
      certLabel: labelFor(cert.typeId),
      address: cert.propertyName || "your property",
      expires: pretty(cert.expiry),
      alsoLine,
    }));
  } catch (e) {
    return { ...base, note: e instanceof Error ? e.message : "the email could not be written" };
  }
  try {
    await sendEmail({
      to: address,
      subject,
      html,
      audience: "customer",
      ...(file ? { attachments: [file] } : {}),
    });
    return { ...base, sent: true, note: file ? "sent with the certificate attached" : "sent, but the file was too big to attach" };
  } catch (e) {
    return { ...base, note: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send" };
  }
}

/* ── the fan-out ─────────────────────────────────────────────────────────── */

/**
 * Everyone who should have this certificate gets it, and the compliance inbox
 * gets the copy that proves it.
 *
 * `extra` is for people the managed book cannot name: the contractor who
 * produced it, and the landlord and tenant a works order holds directly for a
 * home REX's book does not carry. Book first, extra as the fallback, so a
 * stale works order never overrides the live record.
 *
 * Never throws. A certificate that is safely filed must not be undone because
 * an email bounced, so every failure becomes a row and a sentence.
 */
export async function shareCertificate(cert: ShareCertificate, extra: SharePerson[] = []): Promise<ShareResult> {
  const label = labelFor(cert.typeId);
  const stop = (skipped: string): ShareResult => ({ armed: false, skipped, outcomes: [], line: `${label} not sent on: ${skipped}.` });

  if (!hasDb()) return stop("there is no database on this environment");

  /* Gate 1, before anything expensive: the backlog runs through here. */
  const armed = await switchOn("certificate_share").catch(() => false);

  /* Gate 2. */
  const today = new Date().toISOString().slice(0, 10);
  if (String(cert.expiry).slice(0, 10) < today) return stop("the certificate had already expired when it was filed");

  const home = await homeFor(cert.propertyId);

  /* Who. The book's landlord and sitting tenants, then anyone the caller
     could name that the book could not. */
  const people: SharePerson[] = [];
  const seen = new Set<string>();
  const add = (p: SharePerson) => {
    const key = `${p.role}|${p.email.trim().toLowerCase()}`;
    if (!p.email.trim() || seen.has(key)) return;
    seen.add(key);
    people.push(p);
  };
  if (home?.landlord?.email) add({ role: "landlord", name: home.landlord.name, email: home.landlord.email });
  for (const t of home?.tenants ?? []) if (t.email) add({ role: "tenant", name: t.name, email: t.email });
  for (const p of extra) add(p);

  /* Gate 3. Somebody has to be living there, and it has to be a renewal. */
  const hasTenant = people.some((p) => p.role === "tenant");
  if (!hasTenant) return stop("nobody is living there yet, so the first certificate goes out with the let's own paperwork");
  if (!(await isRenewal(cert))) return stop("this is the first certificate of its kind on this home, and the first send is the let's own");

  const alsoFor = (role: ShareRole) =>
    role === "landlord"
      ? people.some((p) => p.role === "tenant") ? "The tenant has been sent a copy as well." : ""
      : role === "tenant"
        ? "Your landlord has a copy too."
        : "";

  const outcomes: ShareOutcome[] = [];

  if (!armed) {
    /* SHADOW. Every party is recorded as not sent, with the reason, so the
       run can be read on the certificate before anybody is written to. */
    for (const p of people) {
      const o: ShareOutcome = { ...p, address: p.email.trim(), sent: false, note: "Sending renewed certificates is not armed on Admin, Switches, so nothing went out." };
      outcomes.push(o);
      await record(cert, o);
    }
    /* NO EMAIL TO COMPLIANCE IN SHADOW. The backlog posts hundreds of
       certificates through the intake, and one internal email each would bury
       the inbox this is meant to be evidence in. The rows are the shadow
       record, and the audit-trail email exists in Admin, Emails to be read
       before it is armed. */
    return {
      armed: false,
      skipped: null,
      outcomes,
      line: `${label} would go to ${outcomes.length} ${outcomes.length === 1 ? "person" : "people"}; sending is not armed, so nothing went out.`,
    };
  }

  const had = await alreadyHad(cert.id);
  const file = await attachment(cert);
  for (const p of people) {
    if (had.has(`${p.role}|${p.email.trim().toLowerCase()}`)) {
      outcomes.push({ ...p, address: p.email.trim(), sent: true, note: "already had this certificate; not sent again" });
      continue;
    }
    const o = await sendTo(cert, p, alsoFor(p.role), file);
    outcomes.push(o);
    await record(cert, o);
  }
  await tellCompliance(cert, label, outcomes, true);

  const went = outcomes.filter((o) => o.sent).length;
  const missed = outcomes.length - went;
  return {
    armed: true,
    skipped: null,
    outcomes,
    line: missed
      ? `${label} sent to ${went} of ${outcomes.length}; ${missed} did not land.`
      : `${label} sent to ${outcomes.map((o) => o.role).join(", ")}.`,
  };
}

/**
 * The audit-trail copy, to whoever holds the compliance inbox.
 *
 * Internal sender and internal audience, so it is not behind the customer
 * switch: Michael is staff, and the record of a send must not be lost because
 * customer email is off. It is also the only party told when nothing went out.
 */
async function tellCompliance(cert: ShareCertificate, label: string, outcomes: ShareOutcome[], armed: boolean): Promise<void> {
  const settings = await invoiceSettings().catch(() => null);
  const address = (settings?.complianceEmail ?? "").trim();
  if (!isEmail(address)) {
    await record(cert, { role: "compliance", name: "Compliance", email: address, address, sent: false, note: "no compliance inbox set under Maintenance, Invoices" });
    return;
  }
  const mail = certificateSharedEmail({
    label,
    propertyName: cert.propertyName,
    expiry: pretty(cert.expiry),
    fileName: cert.name,
    source: cert.source,
    armed,
    link: `${ORIGIN}/portfolio?property=${encodeURIComponent(cert.propertyId)}`,
    outcomes: outcomes.map((o) => ({ role: o.role, name: o.name, address: o.address, sent: o.sent, note: o.note })),
  });
  try {
    await sendEmail({ to: address, subject: mail.subject, html: mail.html, text: mail.text });
    await record(cert, { role: "compliance", name: "Compliance", email: address, address, sent: true, note: "the audit trail copy" });
  } catch (e) {
    await record(cert, {
      role: "compliance",
      name: "Compliance",
      email: address,
      address,
      sent: false,
      note: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "the email did not send",
    });
  }
}
