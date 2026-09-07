import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { managedBookFor } from "@/lib/managed-book-cache";

/**
 * What the OS already knows about a home, for the report form: the
 * landlord's name, email and mobile, the sitting tenant's name, number and
 * email, where it is, and any access notes on file - from the last job on
 * it and from notes written against the property. James, 7 Sep 2026: "all
 * of this stuff should be automated."
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Which property?" }, { status: 400 });

  let landlord: { name: string; email: string; phone: string } | null = null;
  let tenant: { name: string; email: string; phone: string } | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  try {
    const { book } = await managedBookFor(null);
    const p = book.properties.find((x) => x.propertyId === id || x.listingId === id);
    if (p) {
      landlord = p.landlord ? { name: p.landlord.name, email: p.landlord.email ?? "", phone: p.landlord.phone ?? "" } : null;
      const t = p.tenants[0];
      tenant = t ? { name: t.name, email: t.email ?? "", phone: t.phone ?? "" } : null;
      lat = p.lat ?? null;
      lng = p.lng ?? null;
    }
  } catch {
    /* REX did not answer; the form still opens, blank where it must. */
  }

  let access = "";
  if (hasDb()) {
    const [last] = await q<{ access: string }>(`SELECT access FROM os_works_orders WHERE property_id = $1 AND access <> '' ORDER BY created_at DESC LIMIT 1`, [id]).catch(() => []);
    access = last?.access ?? "";
    if (!access) {
      const notes = await q<{ body: string }>(`SELECT body FROM os_notes WHERE record_type = 'property' AND record_id = $1 AND body ILIKE '%access%' ORDER BY created_at DESC LIMIT 1`, [id]).catch(() => []);
      access = notes[0]?.body ?? "";
    }
  }
  return NextResponse.json({ ok: true, landlord, tenant, lat, lng, access });
}
