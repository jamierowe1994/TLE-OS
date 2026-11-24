import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { getOrder, moveOrder, logEvent, markAccountsTold, type Move, type MoveOut } from "@/lib/works-orders";
import { emailsForMove, invoiceChecker, outcomeLine, tellAccounts, tellInvoiceAnswer } from "@/lib/works-emails";
import { pingCompliance } from "@/lib/works-compliance";
import { invoiceSettings } from "@/lib/invoices";
import { pounds } from "@/lib/works-orders";
import { managedBookFor } from "@/lib/managed-book-cache";
import { can } from "@/lib/roles";
import { lookFor } from "@/lib/new-look-store";

/* On the payment run (James, 21 Oct 2026): only the office - Kirstie,
   Michael, Josel - and the owners key invoices on PayProp, so only they say
   it is on the run. Agents see it and cannot press it. Decided on the actor. */
const PAYRUN_ACTIONS = new Set<Move["action"]>(["payrun", "payrun_undo"]);
const canPayrun = (role: string | null | undefined) => can(role, "see:everything");

/* A contractor's own invoice is the agent's to pass or send back (Sean
   McMahon, 23 Nov 2026): whoever was asked to check it, the home's agent,
   whoever raised the job, or the office. Nobody else's press counts. */
const INVOICE_CHECK = new Set<Move["action"]>(["invoice_approve", "invoice_decline"]);
async function mayCheckInvoice(me: { email: string; name: string; role?: string | null }, id: string): Promise<boolean> {
  if (can(me.role, "see:everything")) return true;
  const o = (await getOrder(id))?.order;
  if (!o) return true; /* moveOrder says "No such job" */
  const mine = new Set([me.email, me.name].map((x) => (x ?? "").trim().toLowerCase()).filter(Boolean));
  if (mine.has(o.invoiceWaitFor.trim().toLowerCase()) || mine.has((o.raisedBy ?? "").trim().toLowerCase())) return true;
  const checker = await invoiceChecker(o).catch(() => null);
  return !!checker && mine.has(checker.email.trim().toLowerCase());
}

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
  if (INVOICE_CHECK.has(move.action) && !(await mayCheckInvoice(subject ?? actor, id))) {
    return NextResponse.json({ ok: false, error: "This invoice is for the home's agent to check." }, { status: 403 });
  }
  /* The Landlord Paid Directly (Dan, ticket b7a79378, 20 Nov 2026): behind
     its own switch (lib/new-look "landlordpaid"), decided on whoever is
     signed in. It sends nothing: no emails for a payee move, no accounts. */
  if (move.action === "payee" && move.payee === "landlord" && !(await lookFor(actor).catch(() => null))?.landlordpaid) {
    return NextResponse.json({ ok: false, error: "The Landlord Paid Directly isn't switched on for you yet." }, { status: 403 });
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
    const out: MoveOut = {};
    const order = await moveOrder(id, move, by, out);
    /* Work already done before the OS: nobody is told it is done (Rhiannon, 19 Oct 2026). */
    const quietDone = move.action === "done" && move.alreadyDone === true;
    /* The tenants' email in the agent's own words: Confirm the Contractor, the date, Tell the tenants (Lianna Denholm, 16 Nov 2026). */
    const te = "tenantEdit" in move && move.tenantEdit && typeof move.tenantEdit === "object" ? move.tenantEdit : null;
    const tenantEdit = te ? { subject: typeof te.subject === "string" ? te.subject.slice(0, 200) : null, body: typeof te.body === "string" ? te.body.slice(0, 6000) : null } : null;
    /* The contractor's email in the agent's own words (James, 17 Nov 2026). */
    const ce = "contractorEdit" in move && move.contractorEdit && typeof move.contractorEdit === "object" ? move.contractorEdit : null;
    const contractorEdit = ce ? { subject: typeof ce.subject === "string" ? ce.subject.slice(0, 200) : null, body: typeof ce.body === "string" ? ce.body.slice(0, 6000) : null, template: typeof ce.template === "string" ? ce.template.slice(0, 80) : null } : null;
    const emails = quietDone ? [] : await emailsForMove(order, move.action, subject ?? actor, { how: "how" in move ? move.how : undefined, quiet: move.action === "assign" && move.quiet === true, tenantEdit, contractorEdit, ...out }).catch(() => []);
    if ((tenantEdit?.body?.trim() || tenantEdit?.subject?.trim()) && emails.some((e) => e.to === "tenant" && e.sent)) await logEvent(order.id, by, "note", "The email to the tenants was reworded before it went.");
    if ((contractorEdit?.body?.trim() || contractorEdit?.subject?.trim()) && emails.some((e) => e.to === "contractor" && e.sent)) await logEvent(order.id, by, "note", "The email to the contractor was reworded before it went.");
    for (const e of emails) await logEvent(order.id, "TLE OS", "email", outcomeLine(e));
    /* Logged by one of ours, or a contractor's own invoice passed by the agent: either way accounts now hear. */
    if (move.action === "invoice" || move.action === "invoice_approve") {
      const told = await tellAccounts(order, (await invoiceSettings()).accountsEmail ?? "");
      if (told.sent) await markAccountsTold(order.id);
      await logEvent(order.id, "TLE OS", "email", told.sent ? `Accounts told: ${pounds(order.invoicePence)} to pay, at ${told.address}.` : `Accounts not told: ${(told.reason ?? "").replace(/\.+$/, "")}.`);
    }
    /* The landlord's answer on the invoice, recorded by the agent after a call. */
    if (move.action === "landlord_invoice") await logEvent(order.id, "TLE OS", "email", outcomeLine(await tellInvoiceAnswer(order)));
    await pingCompliance(order, move.action);
    const found = await getOrder(id);
    /* A declined invoice: who to write to and the link they upload from, for the
       email the agent sends themselves. Nothing is sent from here. */
    let declined: { email: string; contact: string; link: string } | undefined;
    if (move.action === "invoice_decline") {
      const [c] = order.contractorId ? await q<{ email: string | null; contact: string | null }>(`SELECT email, contact FROM os_contractors WHERE id = $1`, [order.contractorId]).catch(() => []) : [];
      const origin = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");
      declined = { email: (c?.email ?? "").trim(), contact: (c?.contact ?? "").trim(), link: order.contractorToken ? `${origin}/contractor/${order.contractorToken}` : "" };
    }
    /* Read again: an email can stamp the job as it goes (who the works order went to). */
    return NextResponse.json({ ok: true, order: found?.order ?? order, events: found?.events ?? [], emails, canPayrun: canPayrun(actor.role), ...(declined ? { declined } : {}) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't work.") }, { status: 400 });
  }
}
