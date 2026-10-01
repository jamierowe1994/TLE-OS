import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { hasDb, q } from "@/lib/db";
import { leadsForListing, searchLedger } from "@/lib/lead-ledger";
import { hiddenLeadIds } from "@/lib/hidden-leads";
import { OS_LEAD_PREFIX } from "@/lib/contacts-as-leads";
import type { Lead } from "@/lib/leads-sample";

/**
 * GET /api/viewings/people?q=&listing=
 *
 * Who a viewing can be booked for, when the booking starts from a listing or
 * from the Viewings screen rather than from a lead (Howard, 1 Oct 2026). The
 * tenants we already hold: leads on file (the ledger) and people added by hand
 * (os_contacts), under the same scope as the Leads board - an owner the whole
 * business, an agent their own.
 *
 * With `listing` and no search, the people who enquired about that home come
 * back first, because they are who a viewing on it is usually for.
 *
 * Read-only. Each person carries the lead id a booking is filed against, so
 * the viewing lands on their file exactly as one booked from the lead does.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type ViewingPerson = {
  leadId: string;
  name: string;
  email: string;
  phone: string;
  contactId: string | null;
  /** "Rightmove · 3 days ago", or "Added by hand". */
  note: string;
};

const toPerson = (l: Lead): ViewingPerson => ({
  leadId: l.id,
  name: l.name,
  email: l.email ?? "",
  phone: l.phone ?? "",
  contactId: l.contactId ?? null,
  note: [l.source, l.received].filter(Boolean).join(" · "),
});

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor && hasDb()) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const needle = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const listing = (req.nextUrl.searchParams.get("listing") ?? "").trim();
  const scope = await scopeFor(req);
  if (scope.unlinked) return NextResponse.json({ ok: true, people: [] });

  const hidden = await hiddenLeadIds().catch(() => new Set<string>());
  const tenant = (l: Lead) => l.enquiry === "Letting" && !hidden.has(l.id);
  const mine = (l: Lead) => !scope.rexUserId || l.assigneeId === scope.rexUserId;

  let leads: Lead[] = [];
  if (needle.length >= 3) {
    leads = (await searchLedger(scope.rexUserId, needle, 30).catch(() => [])).filter(tenant);
  } else if (/^-?\d+$/.test(listing)) {
    leads = (await leadsForListing(listing, 30).catch(() => [])).filter((l) => tenant(l) && mine(l));
  }

  /* People added by hand: a tenant typed in on Leads, or added here. */
  let added: ViewingPerson[] = [];
  if (hasDb() && needle.length >= 3) {
    const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const digits = needle.replace(/\D/g, "");
    const params: unknown[] = [like, digits.length >= 5 ? `%${digits}%` : null];
    if (!scope.everything && actor) params.push(actor.email);
    const rows = await q<{ id: string; name: string; email: string | null; mobile: string | null; rex_id: string | null; source: string | null }>(
      `SELECT id, name, email, mobile, rex_id, source FROM os_contacts
        WHERE kind = 'tenant'
          ${params.length > 2 ? "AND created_by = $3" : ""}
          AND (name ILIKE $1 OR email ILIKE $1
               OR ($2::text IS NOT NULL AND regexp_replace(COALESCE(mobile, ''), '\\D', '', 'g') LIKE $2))
        ORDER BY created_at DESC LIMIT 20`,
      params
    ).catch(() => []);
    added = rows
      .filter((r) => !hidden.has(OS_LEAD_PREFIX + r.id))
      .map((r) => ({
        leadId: OS_LEAD_PREFIX + r.id,
        name: r.name,
        email: r.email ?? "",
        phone: r.mobile ?? "",
        contactId: r.rex_id ?? null,
        note: r.source?.trim() || "Added by hand",
      }));
  }

  /* One row per person: the same email on two enquiries is one tenant, and
     the newest file is the one to book against. */
  const seen = new Set<string>();
  const people: ViewingPerson[] = [];
  for (const p of [...leads.map(toPerson), ...added]) {
    const key = p.email.trim().toLowerCase() || p.phone.replace(/\D/g, "") || p.leadId;
    if (seen.has(key)) continue;
    seen.add(key);
    people.push(p);
    if (people.length >= 15) break;
  }
  return NextResponse.json({ ok: true, people });
}
