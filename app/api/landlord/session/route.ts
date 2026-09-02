import { NextResponse } from "next/server";
import { currentLandlord } from "@/lib/landlord-account";
import { LANDLORD_COOKIE } from "@/lib/auth";

/** Who is signed in to the landlord portal (GET), and signing out (DELETE). */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const me = await currentLandlord();
  return NextResponse.json({ ok: true, landlord: me ? { name: me.name, email: me.email } : null });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LANDLORD_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
