import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { hasDb } from "@/lib/db";
import { orderByToken, moveOrder, logEvent, markAccountsTold, stepOf, pounds, type WorksOrder } from "@/lib/works-orders";
import { emailsForMove, outcomeLine, tellAccounts } from "@/lib/works-emails";
import { pingCompliance } from "@/lib/works-compliance";
import { agentFor } from "@/lib/works-agent";
import { invoiceSettings } from "@/lib/invoices";
import { withR2, R2_BUCKET, safeName, r2Configured } from "@/lib/r2";

/**
 * The contractor's page for one job, reached by the token in their works
 * order. No sign-in. They can set the date they've agreed with the tenant,
 * mark the job done, and drop in photos and their invoice - which lands on
 * the job and tells accounts (Michael, 7 Sep 2026: "they don't actually
 * tell me they've uploaded an invoice").
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function publicView(o: WorksOrder) {
  return {
    ref: o.ref, title: o.title, category: o.category, description: o.description, status: o.status, step: stepOf(o),
    address: [o.propertyName, o.locality].filter(Boolean).join(", "), access: o.access, tenant: o.tenant, contractorName: o.contractorName,
    scheduledAt: o.scheduledAt, completedAt: o.completedAt, invoicePence: o.invoicePence, invoiceRef: o.invoiceRef,
    files: o.files.map((f) => ({ name: f.name, at: f.at })),
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const o = await orderByToken("contractor", token);
  if (!o || !o.contractorId) return NextResponse.json({ ok: false, error: "That link isn't one of ours." }, { status: 404 });
  return NextResponse.json({ ok: true, job: publicView(o) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const o = await orderByToken("contractor", token);
  if (!o || !o.contractorId || !hasDb()) return NextResponse.json({ ok: false, error: "That link isn't one of ours." }, { status: 404 });
  if (o.status === "cancelled" || o.status === "paid") return NextResponse.json({ ok: false, error: "This job is closed." }, { status: 400 });
  const by = o.contractorName || "The contractor";
  const me = await agentFor(o);

  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No file." }, { status: 400 });
      if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Files up to 25 MB, please." }, { status: 400 });
      if (!r2Configured) return NextResponse.json({ ok: false, error: "Storage isn't connected on this environment." }, { status: 503 });
      const key = `documents/works-${o.ref}/${Date.now()}-${safeName(file.name) || "file"}`;
      const body = Buffer.from(await file.arrayBuffer());
      await withR2((client) => client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: file.type || "application/octet-stream" })));
      let next = await moveOrder(o.id, { action: "file", file: { key, name: file.name, type: file.type } }, by);
      const kind = String(form.get("kind") ?? "photo");
      const amount = Number(String(form.get("amount") ?? "").replace(/[£,\s]/g, ""));
      if (kind === "invoice" && Number.isFinite(amount) && amount > 0) {
        if (!next.completedAt) next = await moveOrder(o.id, { action: "done", note: String(form.get("note") ?? "").trim() || "Marked done by the contractor with their invoice." }, by);
        next = await moveOrder(o.id, { action: "invoice", invoicePence: Math.round(amount * 100), invoiceRef: String(form.get("ref") ?? "").trim() }, by);
        const settings = await invoiceSettings();
        const told = await tellAccounts(next, settings.accountsEmail ?? "");
        if (told.sent) await markAccountsTold(o.id);
        await logEvent(o.id, "TLE OS", "email", told.sent ? `Accounts told: ${pounds(next.invoicePence)} to pay, at ${told.address}.` : `Accounts not told: ${told.reason}.`);
        if (me) for (const e of await emailsForMove(next, "done", me).catch(() => [])) await logEvent(o.id, "TLE OS", "email", outcomeLine(e));
        await pingCompliance(next, "done");
      } else {
        /* A photo on a job that is already finished still goes over; on one
           that is not, it rides along in the completion email. */
        await pingCompliance(next, "file");
      }
      return NextResponse.json({ ok: true, job: publicView(next) });
    }

    const b = (await req.json().catch(() => ({}))) as { action?: string; scheduledAt?: string; note?: string };
    if (b.action === "date") {
      if (!b.scheduledAt) return NextResponse.json({ ok: false, error: "When?" }, { status: 400 });
      const next = await moveOrder(o.id, { action: "schedule", scheduledAt: new Date(b.scheduledAt).toISOString(), note: "Booked by the contractor from their page." }, by);
      if (me) for (const e of await emailsForMove(next, "schedule", me).catch(() => [])) await logEvent(o.id, "TLE OS", "email", outcomeLine(e));
      return NextResponse.json({ ok: true, job: publicView(next) });
    }
    if (b.action === "done") {
      const next = await moveOrder(o.id, { action: "done", note: (b.note ?? "").trim() || "Marked done by the contractor." }, by);
      if (me) for (const e of await emailsForMove(next, "done", me).catch(() => [])) await logEvent(o.id, "TLE OS", "email", outcomeLine(e));
      await pingCompliance(next, "done");
      return NextResponse.json({ ok: true, job: publicView(next) });
    }
    return NextResponse.json({ ok: false, error: "Say what to do." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That didn't work." }, { status: 400 });
  }
}
