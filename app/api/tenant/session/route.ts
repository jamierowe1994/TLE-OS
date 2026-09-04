import { NextResponse } from "next/server";
import { currentTenant } from "@/lib/tenant-account";
import { TENANT_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const me = await currentTenant();
  return NextResponse.json({ ok: true, tenant: me ? { name: me.name, email: me.email } : null });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TENANT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
