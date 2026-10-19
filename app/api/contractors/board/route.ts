import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { listAllContractors, listContractors, listOrders } from "@/lib/works-orders";
import { publicError } from "@/lib/public-error";

/**
 * Portfolio > Contractors (James, 19 Oct 2026): every contractor you can
 * book, who is out on a job right now, when each one is booked in, and what
 * is owed to them.
 *
 * Whose contractors: an agent sees their own book and the company's. The
 * office (see:everything - Michael, Josel, Kirstie, Susan, the owners) sees
 * every agent's book too, because the office pays the invoices.
 *
 * Every figure is read off the jobs as they stand now. Nothing is stored or
 * snapshotted here, so a booking moved or an invoice paid shows on the next
 * read.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIVE = ["reported", "approval", "approved", "scheduled", "done", "invoiced"];
/** Paid jobs stay on the board this long, so "what did we pay them" has an answer. */
const PAID_KEEP_DAYS = 90;

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment, so there are no contractors to read." }, { status: 503 });
  const me = subject ?? actor;
  const office = can(me.role, "see:everything");
  try {
    const [contractors, orders] = await Promise.all([
      office ? listAllContractors() : listContractors(me.id),
      listOrders({ limit: 2000 }),
    ]);
    const ids = new Set(contractors.map((c) => c.id));
    const paidSince = Date.now() - PAID_KEEP_DAYS * 86400000;
    const jobs = orders
      .filter((o) => o.contractorId && ids.has(o.contractorId))
      .filter((o) => LIVE.includes(o.status) || (o.status === "paid" && o.paidAt && new Date(o.paidAt).getTime() >= paidSince))
      .map((o) => ({
        id: o.id, ref: o.ref, kind: o.kind, status: o.status, title: o.title, category: o.category,
        propertyName: o.propertyName, locality: o.locality, contractorId: o.contractorId, contractorName: o.contractorName,
        dueAt: o.dueAt, scheduledAt: o.scheduledAt, completedAt: o.completedAt, contractorContactedAt: o.contractorContactedAt,
        quotePence: o.quotePence, invoicePence: o.invoicePence, invoiceRef: o.invoiceRef, invoicedAt: o.invoicedAt,
        paidAt: o.paidAt, payee: o.payee, raisedBy: o.raisedBy, urgency: o.urgency,
      }));
    /* Whose book each agent's contractor is in, by name, for the office's view. */
    const owners = [...new Set(contractors.map((c) => c.ownerId).filter((x): x is string => Boolean(x)))];
    const ownerNames: Record<string, string> = {};
    if (owners.length) {
      const rows = await q<{ id: string; name: string | null; email: string }>(`SELECT id, name, email FROM os_users WHERE id = ANY($1)`, [owners]);
      for (const r of rows) ownerNames[r.id] = (r.name || r.email || "").trim();
    }
    return NextResponse.json({
      ok: true,
      contractors: contractors.map((c) => ({ ...c, ownerName: c.ownerId ? ownerNames[c.ownerId] || "an agent" : null })),
      jobs,
      me: me.id,
      office,
      canCorporate: can(actor.role, "see:business"),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not read the contractors.") }, { status: 500 });
  }
}
