import { NextRequest, NextResponse } from "next/server";
import { currentTenant, tenantPassport } from "@/lib/tenant-account";
import { homeOnMarket } from "@/lib/tenant-homes";
import { makeEnquiry } from "@/lib/tenant-find";

/**
 * A signed-in tenant asking about a home from Find a home. Who they are comes
 * from the session, never the body: the body says which home and what they
 * want to say. See lib/tenant-find makeEnquiry for where it goes.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { listingId?: string; message?: string; phone?: string };
  const home = b.listingId ? await homeOnMarket(String(b.listingId)) : null;
  if (!home) return NextResponse.json({ ok: false, error: "That home isn't on the market any more." }, { status: 404 });
  const record = await tenantPassport(me.email).catch(() => null);
  const r = await makeEnquiry({
    email: me.email,
    name: me.name,
    phone: String(b.phone ?? "").slice(0, 40) || record?.data?.mobile || "",
    message: String(b.message ?? "").slice(0, 4000),
    home,
    passportAgentId: record?.agentId ?? null,
  }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "That didn't go through." }));
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
