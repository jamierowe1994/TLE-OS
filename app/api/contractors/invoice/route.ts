import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { createOrder, getContractor, moveOrder, logEvent, markAccountsTold, pounds } from "@/lib/works-orders";
import { tellAccounts } from "@/lib/works-emails";
import { invoiceSettings } from "@/lib/invoices";
import { withR2, R2_BUCKET, safeName, r2Configured } from "@/lib/r2";

/**
 * A contractor's invoice for work nobody raised on the OS (Rhiannon, 19 Oct
 * 2026: "he sent me an invoice", and there was no job for it to go on).
 *
 * It becomes a finished job so it sits with everything else: on the home,
 * on the contractor's record, and on the accounts list. It is raised quiet -
 * landlord skipped, no tenant emails - because the work is already done and
 * nobody needs telling about it twice. The one email that does go is the
 * same "invoice in" note to accounts that every other invoice sends.
 *
 * The invoice FILE is required. The contractor-upload rule existed so an
 * invoice always has a paper trail; this keeps the trail without making the
 * contractor do it themselves.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  if (!r2Configured) return NextResponse.json({ ok: false, error: "File storage isn't set up here, so the invoice can't be kept." }, { status: 503 });
  const me = subject ?? actor;
  const by = me.name || me.email;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Send the invoice as a form." }, { status: 400 });
  const str = (k: string) => String(form.get(k) ?? "").trim();

  const contractor = await getContractor(str("contractorId"));
  if (!contractor || (contractor.ownerId && contractor.ownerId !== me.id && !can(me.role, "see:everything"))) {
    return NextResponse.json({ ok: false, error: "That contractor isn't in your book." }, { status: 404 });
  }
  const propertyName = str("propertyName");
  if (!propertyName) return NextResponse.json({ ok: false, error: "Which home was the work at?" }, { status: 400 });
  const title = str("title");
  if (!title) return NextResponse.json({ ok: false, error: "Say what the work was." }, { status: 400 });
  const amount = Number(str("amount").replace(/[£,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, error: "The invoice needs its total." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "Attach the invoice itself - the PDF or a photo of it." }, { status: 400 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Files up to 50 MB, please." }, { status: 400 });
  const payee = str("payee") === "agent" ? "agent" : "contractor";
  const doneOn = str("completedAt");

  try {
    const order = await createOrder(
      {
        kind: "repair",
        propertyId: str("propertyId") || null,
        propertyName,
        locality: str("locality"),
        landlord: str("landlord"),
        title,
        category: "Other",
        urgency: "routine",
        reportedBy: by,
        contractorId: contractor.id,
        landlordSkipped: true,
        tellTenants: false,
      },
      by
    );
    await logEvent(order.id, by, "note", "Logged from the contractor's invoice: the work was done without a job on the OS.");
    const key = `documents/works-${order.ref}/${Date.now()}-${safeName(file.name) || "invoice"}`;
    const body = Buffer.from(await file.arrayBuffer());
    await withR2((client) => client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: file.type || "application/octet-stream" })));
    await moveOrder(order.id, { action: "file", file: { key, name: file.name, type: file.type, kind: "invoice" } }, by);
    await moveOrder(order.id, { action: "done", note: "Done before it was logged; see the contractor's invoice.", completedAt: doneOn ? new Date(doneOn).toISOString() : null }, by);
    /* Nobody to ask whether they're happy about work done before it was
       logged (Rhiannon, 19 Oct 2026): it goes straight to the money. */
    await moveOrder(order.id, { action: "skip_step", step: "aftercare", note: "Done before it was logged on the OS." }, by);
    await moveOrder(order.id, { action: "payee", payee }, by);
    const next = await moveOrder(order.id, { action: "invoice", invoicePence: Math.round(amount * 100), invoiceRef: str("ref") }, by);
    const told = await tellAccounts(next, (await invoiceSettings()).accountsEmail ?? "");
    if (told.sent) await markAccountsTold(order.id);
    await logEvent(order.id, "TLE OS", "email", told.sent ? `Accounts told: ${pounds(next.invoicePence)} to pay, at ${told.address}.` : `Accounts not told: ${told.reason}.`);
    return NextResponse.json({ ok: true, order: next, accountsTold: told.sent });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not log the invoice.") }, { status: 400 });
  }
}
