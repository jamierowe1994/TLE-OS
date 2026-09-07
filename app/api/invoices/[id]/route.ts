import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { getInvoice, updateInvoice, issueInvoice, markInvoice, totalsOf, money, type InvoicePatch } from "@/lib/invoices";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { publicOrigin } from "@/lib/origin";

/**
 * One invoice.
 *
 * GET   → the invoice and its totals.
 * PATCH → { fields } edits it (until it is sent), or { action }:
 *           issue  PRODUCE it: the next number, the details frozen on
 *           send   email it to whoever it is to, with the page to print
 *           paid   settled, with a note
 *           void   withdrawn, with a reason
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = { fields?: InvoicePatch; action?: "issue" | "send" | "paid" | "void"; note?: string; to?: string };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const invoice = await getInvoice(id);
  if (!invoice) return NextResponse.json({ ok: false, error: "No such invoice." }, { status: 404 });
  return NextResponse.json({ ok: true, invoice, totals: totalsOf(invoice.lines) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as Body;
  const me = subject ?? actor;
  const by = me.name || me.email;
  try {
    if (b.fields) {
      const invoice = await updateInvoice(id, b.fields);
      return NextResponse.json({ ok: true, invoice, totals: totalsOf(invoice.lines) });
    }
    if (b.action === "issue") {
      const invoice = await issueInvoice(id, by);
      return NextResponse.json({ ok: true, invoice, totals: totalsOf(invoice.lines) });
    }
    if (b.action === "send") {
      let invoice = await getInvoice(id);
      if (!invoice) throw new Error("No such invoice.");
      if (invoice.status === "draft") invoice = await issueInvoice(id, by);
      if (invoice.status === "void") throw new Error("This invoice is void.");
      const to = (b.to ?? invoice.toEmail).trim().toLowerCase();
      if (!to.includes("@")) throw new Error("Who should it go to? Put an email address on the invoice.");
      const totals = totalsOf(invoice.lines);
      const link = `${publicOrigin(req)}/invoice/${invoice.token}`;
      const { subject, html } = await renderTleEmailLive("invoice-sent", {
        number: invoice.number ?? "",
        toName: (invoice.toName || "there").split(/\s+/)[0],
        address: invoice.property ? ` at ${invoice.property}` : "",
        total: money(totals.totalPence),
        dueDate: new Date(invoice.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
        reference: invoice.reference || invoice.number || "your invoice",
        link,
        agentName: me.name || "The Letting Experts",
        agentPhone: invoice.from.phone || me.email,
      });
      try {
        await sendEmail({ to, subject, html, audience: "customer", replyTo: me.email });
      } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof ResendBlocked ? e.message : e instanceof Error ? e.message : "The email did not send.", invoice, totals }, { status: 400 });
      }
      const sent = await markInvoice(id, "sent", by, "", to);
      return NextResponse.json({ ok: true, invoice: sent, totals: totalsOf(sent.lines), sentTo: to });
    }
    if (b.action === "paid" || b.action === "void") {
      const invoice = await markInvoice(id, b.action, by, b.note ?? "");
      return NextResponse.json({ ok: true, invoice, totals: totalsOf(invoice.lines) });
    }
    return NextResponse.json({ ok: false, error: "Say what to do." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That didn't work." }, { status: 400 });
  }
}
