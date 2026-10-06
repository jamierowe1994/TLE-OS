import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { normaliseEmail, normalisePhone } from "@/lib/contact-match";

/**
 * "Is this landlord already on the OS?" - asked by Book an Appraisal while the
 * agent types (6 Oct 2026).
 *
 * /api/contacts/match asks REX. This asks our own book, which REX's answer
 * never covered: a landlord added on Leads last week is in os_contacts whether
 * or not REX has them, and booking them again from Market Appraisals made a
 * second lead and a second appraisal for the same visit (Rhiannon's 79A
 * Torquay Road, twice in 40 minutes).
 *
 * Read-only. An email matches exactly (case-insensitive); a phone matches on
 * its last nine digits, so 07860 629489 finds +44 7860 629489. Each match
 * comes back with the appraisal the OS already holds for it, if any, so the
 * screen can offer that one instead of booking a second.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, matches: [] }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, matches: [] });

  const url = new URL(req.url);
  const email = normaliseEmail(url.searchParams.get("email"));
  const tail = normalisePhone(url.searchParams.get("mobile"));
  if (!email && !tail) return NextResponse.json({ ok: true, matches: [] });

  const rows = await q<{
    id: string;
    name: string;
    email: string;
    mobile: string;
    address: string;
    postcode: string;
    kind: string;
    appraisal_id: string | null;
    appointment_at: Date | string | null;
  }>(
    `SELECT c.id, c.name, c.email, c.mobile, c.address, c.postcode, c.kind,
            a.id AS appraisal_id, a.appointment_at
       FROM os_contacts c
       LEFT JOIN os_market_appraisals a ON a.lead_id = 'os-' || c.id
      WHERE ($1 <> '' AND lower(trim(c.email)) = $1)
         OR ($2 <> '' AND right(regexp_replace(c.mobile, '\\D', '', 'g'), 9) = $2)
      ORDER BY c.created_at DESC
      LIMIT 5`,
    [email, tail]
  ).catch(() => []);

  return NextResponse.json({
    ok: true,
    matches: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      mobile: r.mobile,
      address: [r.address, r.postcode].filter((x) => x && !r.address.includes(x)).join(", "),
      kind: r.kind,
      by: email && normaliseEmail(r.email) === email ? "email" : "mobile",
      appraisal: r.appraisal_id
        ? { id: r.appraisal_id, at: r.appointment_at ? new Date(r.appointment_at).toISOString() : null }
        : null,
    })),
  });
}
