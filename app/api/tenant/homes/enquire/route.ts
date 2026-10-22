import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { jsonObject } from "@/lib/json-body";
import { currentTenant, tenantPassport } from "@/lib/tenant-account";
import { homeOnMarket } from "@/lib/tenant-homes";
import { makeEnquiry } from "@/lib/tenant-find";
import { letNoticeFor, readMoreHomesToken } from "@/lib/let-notice";

/**
 * A signed-in tenant asking about a home from Find a home. Who they are comes
 * from the session, never the body: the body says which home and what they
 * want to say. See lib/tenant-find makeEnquiry for where it goes.
 *
 * Or somebody with no account, from Show Me Other Homes (22 Oct 2026): who
 * they are comes from their signed link (lib/let-notice), never the body,
 * and only once they have been sent that email.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const b = (await jsonObject(req)) as { listingId?: string; message?: string; phone?: string; guest?: string };
  const tenant = await currentTenant();
  const guest = !tenant && typeof b.guest === "string" ? readMoreHomesToken(b.guest) : null;
  const told = guest ? await letNoticeFor(guest.listingId, guest.email) : null;
  const me = tenant ?? (guest && told ? { email: guest.email, name: told.name || guest.email.split("@")[0] } : null);
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
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
    afterLet: tenant ? null : told?.address || "a home",
  }).catch((e) => ({ ok: false as const, error: publicError(e, "That didn't go through.") }));
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
