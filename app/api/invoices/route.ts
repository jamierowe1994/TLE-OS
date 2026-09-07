import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { createInvoice, listInvoices, invoiceSettings, saveInvoiceSettings, type InvoiceSettings } from "@/lib/invoices";

/**
 * The invoicing schedule.
 *
 * GET  → every invoice, newest first, and the settings (who they are from).
 * POST → a new draft: { orderId } writes it from a job; otherwise blank.
 * PUT  → the settings. Any member of staff can read; owners and
 *        pre-tenancy can change the company details.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, live: false, invoices: [], settings: null });
  const [invoices, settings] = await Promise.all([listInvoices(), invoiceSettings()]);
  return NextResponse.json({ ok: true, live: true, invoices, settings });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { orderId?: string | null; toName?: string; toAddress?: string; toEmail?: string; property?: string };
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    const invoice = await createInvoice(b, by);
    return NextResponse.json({ ok: true, invoice });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not draft the invoice." }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!can(actor.role, "see:business")) {
    return NextResponse.json({ ok: false, error: "Only an owner can change who invoices are from." }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const patch = (await req.json().catch(() => ({}))) as Partial<InvoiceSettings>;
  const settings = await saveInvoiceSettings(patch, actor.email);
  return NextResponse.json({ ok: true, settings });
}
