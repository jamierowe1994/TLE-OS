import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor, searchScope } from "@/lib/scope";
import { searchPhoneProperties, type PhoneProperty } from "@/lib/m-properties";
import { listAppraisals } from "@/lib/appraisal-store";
import { accessLine } from "@/lib/takeon";

/**
 * GET /api/m/event?where=… → what an agent needs at the door of one
 * appointment on the phone (James, 18 Sep 2026): the property, who lives
 * there, the landlord, and how to get in. READ ONLY.
 *
 * A diary entry only carries an address and a name, so everything here is
 * found by the address: the listing or managed home at it, and - for an
 * appraisal or a take-on - the appraisal the OS holds for it, which is where
 * the landlord's own answers about access live.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface PhoneEventFacts {
  property: PhoneProperty | null;
  /** From the OS's appraisal at this address, when there is one. */
  appraisal: {
    landlord: string;
    phone: string;
    email: string;
    access: { label: string; detail: string } | null;
  } | null;
}

const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const where = (req.nextUrl.searchParams.get("where") ?? "").trim();
  if (where.length < 3) return NextResponse.json({ ok: true, property: null, appraisal: null } satisfies PhoneEventFacts & { ok: true });

  /* The first line is what both books agree on; the rest is how each spells the town. */
  const firstLine = where.split(",")[0].trim();
  const scope = await scopeFor(req);
  const mine = await searchScope(req, scope);
  const [found, appraisals] = await Promise.all([
    mine === false ? Promise.resolve(null) : searchPhoneProperties(mine, firstLine).catch(() => null),
    listAppraisals().catch(() => []),
  ]);

  const whole = flat(where);
  const property =
    (found ?? []).find((p) => p.postcode && whole.includes(flat(p.postcode))) ?? (found ?? [])[0] ?? null;

  const line = flat(firstLine);
  const ma = line.length >= 4 ? appraisals.find((a) => flat(a.address).startsWith(line)) ?? null : null;
  const appraisal = ma
    ? {
        landlord: ma.landlord,
        phone: ma.landlordMobile ?? "",
        email: ma.landlordEmail ?? "",
        access: await accessLine(ma.id).catch(() => null),
      }
    : null;

  return NextResponse.json({ ok: true, property, appraisal } satisfies PhoneEventFacts & { ok: true });
}
