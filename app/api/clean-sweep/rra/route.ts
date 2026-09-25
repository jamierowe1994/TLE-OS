import { NextRequest, NextResponse } from "next/server";
import { CopyObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { recordFact } from "@/lib/property-facts";
import { sendEmail } from "@/lib/resend";
import { isInternalAddress } from "@/lib/email-policy";
import { proseEmail } from "@/lib/email/prose";

/**
 * THE RENTERS' RIGHTS ACT INFORMATION SHEET (James, 25 Sep 2026).
 *
 * The Act changed every private tenancy in England from 1 May 2026, and the
 * tenants of a tenancy with a written agreement must be given the government's
 * Information Sheet 2026. Nothing recorded that it had been, so James ordered
 * it sent from the OS to the lead tenant of every England home we manage, and
 * logged on each home (served date, and the sheet itself in its documents).
 *
 * Owner only. Three modes:
 *   preview  the email for the first home, as HTML, nothing sent;
 *   test     one copy to one of our own addresses;
 *   send     every home in the list that has not been served yet. It goes
 *            while customer email is switched off, as the named one-off
 *            "rra-sheet-2026" (lib/resend ONE_OFF_SENDS), and only with the
 *            confirm phrase.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

/** The government's PDF, as published on GOV.UK, held once in R2. */
const SHEET_KEY = "documents/shared/The_Renters_Rights_Act_Information_Sheet_2026.pdf";
const FILE_NAME = "The Renters' Rights Act Information Sheet 2026.pdf";
const SUBJECT = "The Renters' Rights Act: information about your tenancy";

type Recipient = { id: string; address: string; agent: string | null; to: { email: string; name: string }[] };

function body(r: Recipient, agentFirst: string | null): string {
  const names = r.to.map((t) => t.name.trim().split(/\s+/)[0]).filter(Boolean);
  const dear = names.length ? names.join(" and ") : "tenant";
  return [
    `Dear ${dear},`,
    `This is about your tenancy at ${r.address}.`,
    "The Renters' Rights Act 2025 changed the rules for private tenancies in England from 1 May 2026. The government has published an information sheet explaining how the changes affect tenants who already have a written tenancy agreement, and we are giving you a copy. It is attached to this email.",
    "You do not need to do anything. Your tenancy agreement stays in place, and the information sheet explains what is different now.",
    "Please share this email with anyone else named on your tenancy.",
    agentFirst
      ? `If you have any questions, reply to this email and it will reach ${agentFirst}, who looks after your home.`
      : "If you have any questions, reply to this email and it will reach the team who look after your home.",
    "Kind regards,\nThe Letting Experts",
  ].join("\n\n");
}

async function sheetBase64(): Promise<string> {
  const res = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: SHEET_KEY })));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes).toString("base64");
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (actor.role !== "owner") return NextResponse.json({ ok: false, error: "Only an owner can send this." }, { status: 403 });
  if (!hasDb() || !r2Configured) return NextResponse.json({ ok: false, error: "Not on this environment." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { mode?: string; to?: string; confirm?: string; recipients?: Recipient[] };
  const list = (b.recipients ?? []).filter((r) => r && r.id && Array.isArray(r.to) && r.to.some((t) => /@/.test(t.email)));
  if (!list.length) return NextResponse.json({ ok: false, error: "No recipients." }, { status: 400 });

  /* The agent's first name and address, so a reply reaches the person who looks after the home. */
  const agents = await q<{ name: string; email: string }>(`SELECT name, email FROM os_users WHERE name <> ''`).catch(() => []);
  const agentOf = (name: string | null) => (name ? agents.find((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null : null);

  if (b.mode === "preview") {
    const r = list[0];
    const a = agentOf(r.agent);
    return NextResponse.json({ ok: true, subject: SUBJECT, from: "The Letting Experts", replyTo: a?.email ?? actor.email, html: proseEmail(body(r, a?.name.split(/\s+/)[0] ?? null)) });
  }

  const pdf = await sheetBase64();
  const attachments = [{ filename: FILE_NAME, content: pdf }];

  if (b.mode === "test") {
    const to = String(b.to ?? "").trim();
    if (!isInternalAddress(to)) return NextResponse.json({ ok: false, error: "A test goes to one of our own addresses only." }, { status: 400 });
    const r = list[0];
    const a = agentOf(r.agent);
    const sent = await sendEmail({ to, subject: `[Test] ${SUBJECT}`, html: proseEmail(body(r, a?.name.split(/\s+/)[0] ?? null)), audience: "customer", replyTo: a?.email ?? actor.email, attachments });
    return NextResponse.json({ ok: true, test: to, id: sent.id });
  }

  if (b.mode !== "send" || b.confirm !== "send the RRA sheet to tenants") {
    return NextResponse.json({ ok: false, error: "Say which: preview, test, or send with the confirm phrase." }, { status: 400 });
  }

  const served = new Set((await q<{ property_id: string }>(`SELECT property_id FROM os_property_facts WHERE field = 'rra_sheet_served' AND value IS NOT NULL`)).map((x) => x.property_id));
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const by = actor.name || actor.email;
  const out = { sent: 0, skipped: 0, failed: [] as { id: string; error: string }[] };
  for (const r of list) {
    if (served.has(r.id)) { out.skipped++; continue; }
    const a = agentOf(r.agent);
    const ids: string[] = [];
    try {
      for (const t of r.to) {
        const res = await sendEmail({
          to: t.email, subject: SUBJECT, html: proseEmail(body(r, a?.name.split(/\s+/)[0] ?? null)),
          audience: "customer", replyTo: a?.email ?? actor.email, attachments, oneOff: "rra-sheet-2026",
        });
        ids.push(res.id);
        await new Promise((z) => setTimeout(z, 550)); // Resend allows two a second
      }
    } catch (e) {
      out.failed.push({ id: r.id, error: e instanceof Error ? e.message.slice(0, 160) : "send failed" });
      continue;
    }
    /* Logged on the home: the date it was served, to whom, and the sheet itself in its documents. */
    const folder = `documents/property-${r.id}/doc_rra_sheet/`;
    await withR2((c) => c.send(new CopyObjectCommand({ Bucket: R2_BUCKET, CopySource: `${R2_BUCKET}/${SHEET_KEY}`, Key: `${folder}manual-${Date.now()}-${FILE_NAME.replace(/[^\w.\- ]+/g, "")}` }))).catch(() => null);
    await recordFact({ propertyId: r.id, field: "rra_sheet_served", value: today, source: "manual", sourceRef: `Emailed from the OS to ${r.to.map((t) => t.email).join(", ")} (${ids.join(", ")})`, by });
    await recordFact({ propertyId: r.id, field: "doc_rra_sheet", value: "Sent from the OS", fileKey: folder, source: "manual", by });
    out.sent++;
  }
  return NextResponse.json({ ok: true, ...out });
}
