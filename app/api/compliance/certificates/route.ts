import { NextRequest, NextResponse } from "next/server";
import { requireAnyCapability, whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { pendingKeyFor } from "@/lib/property-match";
import { hasDb, q } from "@/lib/db";
import { r2Configured } from "@/lib/r2";
import { rexWriteBlockedBecause } from "@/lib/plc-rex";
import {
  CERT_TYPES,
  FilingFailed,
  dateProblem,
  fileCertificate,
  outCert,
  writeCertificateRow,
  ymd,
  type CertRow,
} from "@/lib/certificate-intake";

/**
 * Certificates that arrive outside a PLC pack - the backlog (5 Sep 2026).
 *
 * James downloads them out of Propoly a batch at a time; each one is read,
 * matched to its REX property, and posted here with what was read. The OS
 * stores the file and writes the compliance entry into REX through the same
 * gated path the pack uses, and records what REX said so a refused one can
 * be written again without a second upload.
 *
 *   GET  /api/compliance/certificates?property=<id>   → what is held, and how REX took it
 *   POST /api/compliance/certificates   multipart: file, propertyId, type, expiry, issue?, propertyName?, source?
 *   POST /api/compliance/certificates?retry=<id>      → write an existing one to REX again
 *
 * Owner or the compliance role.
 *
 * ── AND THEN EVERYONE WHO IS ENTITLED TO IT GETS IT (14 Sep 2026) ─────────
 *
 * Filing is only half of what happens to a renewed certificate. The landlord,
 * the sitting tenant and the contractor who produced it are each owed a copy,
 * and the compliance inbox is owed the proof that they got one. That is
 * lib/certificate-share.ts, called here so that EVERY door into this intake
 * gets it - the property file, a listing, an application, a PLC pack, the
 * contractor's own page - rather than each of them remembering to.
 *
 * Since 4 Oct 2026 it waits for compliance's check first (shareOnceChecked,
 * on the desk's Verified); then it decides for itself whether to send: off
 * unless the certificate_share switch is armed, in date, a renewal, and
 * somebody living there. So the
 * Propoly backlog posting hundreds of historical certificates through here
 * costs one switch read each and writes to nobody.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function gate(req: NextRequest) {
  return requireAnyCapability(req, ["manage:switches", "see:agent-compliance"]);
}

export async function GET(req: NextRequest) {
  const me = await gate(req);
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, certificates: [] });
  const property = req.nextUrl.searchParams.get("property");
  const rows = property
    ? await q<CertRow>(`SELECT * FROM os_certificates WHERE property_id = $1 ORDER BY added_at DESC`, [property])
    : await q<CertRow>(`SELECT * FROM os_certificates ORDER BY added_at DESC LIMIT 500`);
  return NextResponse.json({ ok: true, stored: true, blocked: await rexWriteBlockedBecause(), certificates: rows.map(outCert) });
}

/* Whatever throws on the way through, the screen gets words and not a bare
   500 page it cannot read (Josel, compliance desk, 7-12 Oct). */
export async function POST(req: NextRequest) {
  try {
    return await post(req);
  } catch (e) {
    console.error("[compliance/certificates] POST threw:", e);
    return NextResponse.json({ ok: false, error: "Something went wrong there. Look on the home to see whether the certificate is on file before trying again; if it fails twice, tell the office." }, { status: 500 });
  }
}

async function post(req: NextRequest) {
  /* Filing a certificate is anyone's job - an agent on a listing, Kirstie on
     a deal - so any signed-in person may. Reading the whole list is not. */
  const { actor } = await whoIs(req);
  const me = actor;
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const by = me.name || me.email;

  const retry = req.nextUrl.searchParams.get("retry");
  if (retry) {
    let rows = await q<CertRow>(`SELECT * FROM os_certificates WHERE id = $1`, [retry]);
    if (!rows[0]) return NextResponse.json({ ok: false, error: "No such certificate." }, { status: 404 });
    /* Held for compliance's check (lib/cert-hold): it goes into REX when they
       verify it, not before. */
    if (rows[0].awaiting_check) {
      return NextResponse.json({ ok: false, error: "Waiting for the compliance team to verify it. It goes into REX once they have." }, { status: 409 });
    }
    /* A corrected date travels with the retry (6 Sep: the small reader gave
       1905 and 1994 on a handful, the bigger one read them right). The
       stored row is put right first, then REX is brought up to it. */
    const fix = (await req.json().catch(() => null)) as { expiry?: string; issue?: string } | null;
    if (fix?.expiry || fix?.issue) {
      const bad = (fix.expiry ? dateProblem(fix.expiry, "expiry") : null) ?? (fix.issue ? dateProblem(fix.issue, "issue") : null);
      if (bad) return NextResponse.json({ ok: false, error: bad }, { status: 400 });
      rows = await q<CertRow>(`UPDATE os_certificates SET expiry = COALESCE($2, expiry), issue = COALESCE($3, issue) WHERE id = $1 RETURNING *`, [retry, fix.expiry ?? null, fix.issue ?? null]);
    }
    const r = await writeCertificateRow(rows[0], `Written by TLE OS from ${rows[0].source || "a dropped file"} (${rows[0].name}).`, req.nextUrl.searchParams.get("refresh") === "1");
    /* A retry is REX only. Sending it on is compliance's check, on the desk. */
    return NextResponse.json({ ok: true, certificate: outCert(r), share: null });
  }

  if (!r2Configured) return NextResponse.json({ ok: false, error: "File storage isn't configured here, so the certificate cannot be kept." }, { status: 503 });
  /* A form that will not open is nearly always one that did not arrive
     whole - too big, or the connection dropped - so say that, not "form". */
  const form = await req.formData().catch(() => null);
  if (!form) {
    const big = Number(req.headers.get("content-length") ?? 0) > 50 * 1024 * 1024;
    return NextResponse.json(
      { ok: false, error: big ? "That file is over 50MB, so it was not kept. Save a smaller copy and upload that." : "The file did not arrive whole, so it was not kept. Try again." },
      { status: big ? 413 : 400 }
    );
  }
  const file = form.get("file");
  /* No REX property yet (a market appraisal, say): the address is the key,
     and the file waits there for the property. */
  const address = String(form.get("address") ?? "").trim().slice(0, 200);
  const propertyId = String(form.get("propertyId") ?? "").trim() || (address ? pendingKeyFor(address) : "");
  const type = String(form.get("type") ?? "").trim();
  const expiry = String(form.get("expiry") ?? "").trim();
  const issueRaw = String(form.get("issue") ?? "").trim();
  const propertyName = (String(form.get("propertyName") ?? "").trim() || address).slice(0, 200);
  const source = String(form.get("source") ?? "dropped file").trim().slice(0, 120);
  if (!(file instanceof File) || !file.size) return NextResponse.json({ ok: false, error: "No file." }, { status: 400 });
  if (!/^(\d+|pending-[a-z0-9-]+|pm-[0-9a-f-]+)$/i.test(propertyId)) return NextResponse.json({ ok: false, error: "propertyId must be the REX property id, an OS property id, or give an address." }, { status: 400 });
  if (!CERT_TYPES.has(type)) return NextResponse.json({ ok: false, error: `type must be one of ${[...CERT_TYPES].join(", ")}.` }, { status: 400 });
  const badDate = dateProblem(expiry, "expiry") ?? (issueRaw ? dateProblem(issueRaw, "issue") : null);
  if (badDate) return NextResponse.json({ ok: false, error: `${badDate} Nothing was kept.` }, { status: 400 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ ok: false, error: "That file is over 50MB, so it was not kept. Save a smaller copy and upload that." }, { status: 413 });

  const name = file.name || `${type}.pdf`;
  /* Said, not thrown (15 Oct 2026, Dan's EPC on 11 Oct; Josel on the
     compliance desk, 7-12 Oct): a filing that broke came back as an HTML
     error page the screens could not read. Now it is a sentence, and it says
     whether the certificate was kept (lib/certificate-intake FilingFailed);
     anything after the save no longer fails the filing at all. */
  let filed: Awaited<ReturnType<typeof fileCertificate>>;
  try {
    filed = await fileCertificate({
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: name,
      contentType: file.type,
      propertyId,
      propertyName,
      type,
      expiry,
      issue: issueRaw || null,
      source,
      by,
      refreshBook: req.nextUrl.searchParams.get("refresh") === "1",
      /* The compliance office filing it has checked it already (4 Oct 2026). */
      checkedBy: can(me.role, "see:agent-compliance") ? by : null,
    });
  } catch (e) {
    if (e instanceof FilingFailed) return NextResponse.json({ ok: false, kept: e.kept, error: e.message }, { status: 500 });
    console.error("[certificates] filing failed", { propertyId, type, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, kept: false, error: "The certificate did not file, so it has not been counted. Try again in a minute, or send it to the compliance team." }, { status: 500 });
  }
  if (filed.duplicate) return NextResponse.json({ ok: true, duplicate: true, certificate: outCert(filed.row) });
  return NextResponse.json({ ok: true, certificate: outCert(filed.row), share: filed.share });
}
