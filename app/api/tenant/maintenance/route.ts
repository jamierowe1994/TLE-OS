import { NextRequest, NextResponse } from "next/server";
import { landlordForTestDeal } from "@/lib/test-overlay";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";
import { createOrder, listOrders } from "@/lib/works-orders";
import { hasDb } from "@/lib/db";

/**
 * A TENANT REPORTING SOMETHING BROKEN.
 *
 * The Maintenance page in the tenant portal has been a paragraph and a mailto
 * link - "reporting from this page comes with your move-in" - and the screen
 * docs said plainly that a tenant cannot raise a repair because there is no
 * route for it. This is the route. It is J6 and F1.11.
 *
 * ── The property comes from the SESSION, never from the browser ──────────
 *
 * The body carries what is wrong and nothing else. The address, the landlord,
 * the agent and the tenant's own name are read from the signed-in tenant's
 * deal, server side. A propertyId in a request body would let anybody with a
 * tenant login raise work against somebody else's home, and the first anyone
 * would know is a contractor knocking on the wrong door.
 *
 * ── Why it does not arrive as an emergency ───────────────────────────────
 *
 * Emergency on a works order means attend within 24 hours and the clock starts
 * when it is reported. Letting a tenant set that from a form would let them
 * start the agency's own SLA clock, and every report would be an emergency
 * within a fortnight. Every tenant report lands ROUTINE, with their own words
 * kept verbatim, and an agent re-grades it - which is what happens on the
 * phone today. The page tells them to ring for a real emergency rather than
 * pretending a form is the right tool for a burst pipe.
 *
 * Worth James or Susan confirming: whether a tenant should ever be able to set
 * the urgency themselves.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A works order as a tenant should read it: no money, no blame. */
const TENANT_STATUS: Record<string, string> = {
  reported: "With us",
  approval: "Being arranged",
  approved: "Being arranged",
  scheduled: "Booked in",
  done: "Done",
  invoiced: "Done",
  paid: "Done",
  cancelled: "Closed",
};

export async function GET() {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, jobs: [] });
  const orders = await listOrders({ tenantEmail: me.email, limit: 50 }).catch(() => []);
  return NextResponse.json({
    ok: true,
    jobs: orders.map((o) => ({
      id: o.id,
      ref: o.ref,
      title: o.title,
      reportedAt: o.createdAt,
      /* Their words, their status. Nothing about quotes, authority or what it
         cost - none of that is the tenant's business and some of it is the
         landlord's alone. */
      status: TENANT_STATUS[o.status] ?? "With us",
    })),
  });
}

export async function POST(req: NextRequest) {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Not available on this environment." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { what?: string; where?: string } | null;
  const what = (body?.what ?? "").trim();
  const where = (body?.where ?? "").trim();
  if (what.length < 4) return NextResponse.json({ ok: false, error: "Tell us a little more about what is wrong." }, { status: 400 });

  const home = await loadTenantHome(me);
  const deal = home.deal;
  if (!deal) {
    return NextResponse.json(
      { ok: false, error: "We cannot see a tenancy on your account yet, so there is nothing to report against. Message your agent and they will sort it." },
      { status: 400 }
    );
  }

  /* A test tenancy's landlord (lib/test-overlay): a job the tester reports as
     their own tenant should reach the landlord portal they also own. A real
     deal carries no landlord here, so nothing changes for one. */
  const testLandlord = deal.id.startsWith("test-") ? await landlordForTestDeal(deal.id).catch(() => null) : null;
  const order = await createOrder(
    {
      kind: "repair",
      /* The tenant's record carries an address, not a REX property id, so the
         order carries the address and the agent links it. Better an honest
         gap than a guessed id pointing at the wrong home. */
      propertyId: null,
      propertyName: deal.property,
      locality: deal.locality,
      tenant: me.name,
      tenantEmail: me.email,
      title: [where, what].filter(Boolean).join(" - ").slice(0, 140),
      description: what,
      /* Not guessed from the words. "Other" is honest and an agent sets the
         trade when they read it - a wrong trade sends the wrong contractor. */
      category: "Other",
      urgency: "routine",
      reportedBy: "Tenant",
      ...(testLandlord ? { landlord: testLandlord.name, landlordEmail: testLandlord.email } : {}),
    },
    me.name || me.email
  );

  return NextResponse.json({ ok: true, ref: order.ref });
}
