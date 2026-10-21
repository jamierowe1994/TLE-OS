import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { getOrder, moveOrder, logEvent, markAccountsTold, type Move } from "@/lib/works-orders";
import { emailsForMove, outcomeLine, tellAccounts, tellInvoiceAnswer } from "@/lib/works-emails";
import { pingCompliance } from "@/lib/works-compliance";
import { invoiceSettings } from "@/lib/invoices";
import { pounds } from "@/lib/works-orders";
import { managedBookFor } from "@/lib/managed-book-cache";
import { can } from "@/lib/roles";

/* On the payment run (James, 21 Oct 2026): only the office - Kirstie,
   Michael, Josel - and the owners key invoices on PayProp, so only they say
   it is on the run. Agents see it and cannot press it. Decided on the actor. */
const PAYRUN_ACTIONS = new Set<Move["action"]>(["payrun", "payrun_undo"]);
const canPayrun = (role: string | null | undefined) => can(role, "see:everything");

/**
 * One job: read it with its timeline, or move it along.
 *
 * PATCH takes a Move (lib/works-orders): quote, approve, assign, schedule,
 * done, invoice, paid, cancel, reopen, note, edit, file. Every move writes
 * a line on the job's timeline under the person's name.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const found = await getOrder(id);
  if (!found) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
  return NextResponse.json({ ok: true, ...found, canPayrun: canPayrun(actor.role) });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const move = (await req.json().catch(() => null)) as Move | null;
  if (!move || typeof move.action !== "string") return NextResponse.json({ ok: false, error: "Say what to do." }, { status: 400 });
  if (PAYRUN_ACTIONS.has(move.action) && !canPayrun(actor.role)) {
    return NextResponse.json({ ok: false, error: "Only the office can put an invoice on the payment run." }, { status: 403 });
  }
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    /* The landlord's email for the invoice ask, from the home's record when
       the job has none and the agent typed none (a job logged off a
       contractor's invoice is raised with the landlord skipped). */
    if (move.action === "ask_landlord_invoice" && !move.email) {
      const cur = (await getOrder(id))?.order;
      if (cur && !cur.landlordEmail.includes("@") && cur.propertyId) {
        const { book } = await managedBookFor(null).catch(() => ({ book: null }));
        const home = book?.properties.find((p) => p.propertyId === cur.propertyId);
        if (home?.landlord?.email?.includes("@")) move.email = home.landlord.email;
      }
    }
    const order = await moveOrder(id, move, by);
    /* Work already done before the OS: nobody is told it is done (Rhiannon, 19 Oct 2026). */
    const quietDone = move.action === "done" && move.alreadyDone === true;
    const emails = quietDone ? [] : await emailsForMove(order, move.action, subject ?? actor, { how: "how" in move ? move.how : undefined }).catch(() => []);
    for (const e of emails) await logEvent(order.id, "TLE OS", "email", outcomeLine(e));
    if (move.action === "invoice") {
      const told = await tellAccounts(order, (await invoiceSettings()).accountsEmail ?? "");
      if (told.sent) await markAccountsTold(order.id);
      await logEvent(order.id, "TLE OS", "email", told.sent ? `Accounts told: ${pounds(order.invoicePence)} to pay, at ${told.address}.` : `Accounts not told: ${told.reason}.`);
    }
    /* The landlord's answer on the invoice, recorded by the agent after a call. */
    if (move.action === "landlord_invoice") await logEvent(order.id, "TLE OS", "email", outcomeLine(await tellInvoiceAnswer(order)));
    await pingCompliance(order, move.action);
    const found = await getOrder(id);
    return NextResponse.json({ ok: true, order, events: found?.events ?? [], emails, canPayrun: canPayrun(actor.role) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't work.") }, { status: 400 });
  }
}
