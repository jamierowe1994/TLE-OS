import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { findHomeAddress, saveHomeAddress } from "@/lib/landlord-home";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * A landlord's own home address (lib/landlord-home), one person at a time.
 *
 * GET  ?email=&ref=&name=&property=  -> { ok, home }  saved, or offered from PayProp / REX
 * PUT  { email?, ref?, name?, address, sameAsProperty?, source? } -> { ok, home }
 *
 * Saved on the OS record only. Nothing is written to REX or PayProp.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const u = req.nextUrl.searchParams;
  const email = s(u.get("email"), 200);
  const ref = s(u.get("ref"), 120);
  if (!email && !ref) return NextResponse.json({ ok: true, home: null });
  try {
    const home = await findHomeAddress({ email, ref, name: s(u.get("name"), 160), propertyAddress: s(u.get("property"), 300) });
    return NextResponse.json({ ok: true, home });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Their address couldn't be read just now.") }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = s(b?.email, 200).toLowerCase();
  const ref = s(b?.ref, 120);
  const address = s(b?.address, 300);
  if (!email && !ref) return NextResponse.json({ ok: false, error: "Add their email first, so the address has somebody to belong to." }, { status: 400 });
  if (address.replace(/[^a-z0-9]/gi, "").length < 6) return NextResponse.json({ ok: false, error: "That doesn't look like a full address. Add the street and postcode." }, { status: 400 });
  try {
    /* Kept as offered: say where it came from. Anything typed is the agent's. */
    const kept = b?.source === "payprop" || b?.source === "rex" ? (b.source as "payprop" | "rex") : undefined;
    const home = await saveHomeAddress({ email, ref, name: s(b?.name, 160), address, sameAsProperty: b?.sameAsProperty === true, source: b?.sameAsProperty === true ? "same-as-property" : kept, by: actor.email });
    await record({
      kind: "landlord_home_address_saved",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${email || ref}: home address saved${home.sameAsProperty ? " (same as the let property)" : ""}`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, home });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Their address didn't save.") }, { status: 500 });
  }
}
