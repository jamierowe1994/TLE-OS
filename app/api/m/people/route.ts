import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { scopeFor, searchScope } from "@/lib/scope";
import { hasDb, q } from "@/lib/db";
import { getApplications } from "@/lib/applications";
import { managedBookFor } from "@/lib/managed-book-cache";
import { listContacts } from "@/lib/contacts-store";
import { peopleLike, rememberPeople } from "@/lib/rex-people-store";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import type { Lead } from "@/lib/leads-sample";

/**
 * GET /api/m/people?q=… → a name, and how to reach them. The phone view's
 * contact search (16 Sep 2026).
 *
 * James: "a search function for the contact details of people, which would be
 * a stripped version of that." An agent stood outside a property wants one
 * thing - the number - so every row here carries a phone and an email where
 * we have them, and nothing that needs a drawer to read.
 *
 * READ ONLY. Nothing here creates, changes or links a person.
 *
 * ── Two halves, like the search bar ───────────────────────────────────────
 *
 * Without `rex=1` it answers from what the OS already holds - the leads
 * ledger, applications, the managed book's landlords and tenants, contacts
 * added here and people remembered from earlier look-ups. That is instant.
 * With `rex=1` it asks REX's contact book, which is 3-6 seconds for a common
 * surname, so the screen asks for it second and says it is still looking.
 *
 * Scoped like /api/search: an agent's own leads, applications and managed
 * homes. The REX half follows /api/search/rex's rule - somebody with no REX
 * link of their own gets nothing from it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface PhonePerson {
  key: string;
  name: string;
  /** "Tenant Lead", "Landlord Lead", "Applicant", "Landlord", "Tenant", "Contact". */
  role: string;
  /** The property or enquiry they belong to, when there is one. */
  context: string;
  phone: string;
  email: string;
}

const digits = (s: string) => s.replace(/\D/g, "");

function matches(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const n = needle.toLowerCase();
  const nd = digits(needle);
  return fields.some((f) => {
    if (!f) return false;
    const v = String(f).toLowerCase();
    if (v.includes(n)) return true;
    return nd.length >= 5 && digits(v).includes(nd);
  });
}

async function cachedLeads(rexUserId: string | null): Promise<Lead[]> {
  if (!hasDb()) return [];
  const key = rexUserId ? `leads:v2:agent:${rexUserId}` : "leads:v2:all";
  const rows = await q<{ payload: { book?: { leads?: Lead[] } } }>(`SELECT payload FROM os_cache WHERE key = $1`, [key]).catch(() => []);
  return rows[0]?.payload?.book?.leads ?? [];
}

/** One person seen in two places is one row: the first (strongest) wins, and a
 *  later sighting only fills in a number or address the first was missing. */
function collect() {
  const out: PhonePerson[] = [];
  const index = new Map<string, PhonePerson>();
  const idOf = (p: { name: string; phone: string; email: string }) =>
    p.email ? `e:${p.email.toLowerCase()}` : digits(p.phone).length >= 9 ? `p:${digits(p.phone).slice(-10)}` : `n:${p.name.toLowerCase().trim()}`;
  return {
    add(p: PhonePerson) {
      if (!p.name.trim()) return;
      const id = idOf(p);
      const had = index.get(id);
      if (had) {
        if (!had.phone && p.phone) had.phone = p.phone;
        if (!had.email && p.email) had.email = p.email;
        if (!had.context && p.context) had.context = p.context;
        return;
      }
      index.set(id, p);
      out.push(p);
    },
    out,
  };
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const needle = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (needle.length < 2) return NextResponse.json({ ok: true, people: [] });
  const scope = await scopeFor(req);
  const rexUserId = await searchScope(req, scope);
  if (rexUserId === false) return NextResponse.json({ ok: true, people: [] });

  if (req.nextUrl.searchParams.get("rex") === "1") {
    if (!rexConfigured()) return NextResponse.json({ ok: true, people: [] });
    if (!scope.everything && !rexUserId) return NextResponse.json({ ok: true, people: [] });
    const res = await rexCall("Contacts", "autocomplete", { search_string: needle, limit: 10 }).catch(() => null);
    if (!res?.ok) return NextResponse.json({ ok: false, error: "The contact book did not answer just now." }, { status: 502 });
    const found = collect();
    const seen: { id: string; name: string; email: string; phone: string }[] = [];
    for (const r of rexRows(res.result)) {
      const row = r as Record<string, unknown>;
      const id = String(row.id ?? "");
      const name = String(row.name ?? "").trim();
      if (!id || !name) continue;
      const email = String(row.email_address ?? "").trim();
      const phone = String(row.phone_number ?? "").trim();
      seen.push({ id, name, email, phone });
      found.add({ key: `rex-${id}`, name, role: "Contact", context: "", phone, email });
    }
    void rememberPeople(seen);
    return NextResponse.json({ ok: true, people: found.out });
  }

  const [leads, applications, managed, contacts, known] = await Promise.all([
    cachedLeads(rexUserId),
    getApplications(200, rexUserId).catch(() => []),
    managedBookFor(rexUserId).then((m) => m.book).catch(() => null),
    listContacts({ limit: 500 }).catch(() => []),
    peopleLike(needle, 10).catch(() => []),
  ]);

  const found = collect();

  for (const a of applications) {
    for (const p of a.applicants) {
      if (matches(needle, p.name, p.email, p.phone)) {
        found.add({ key: `app-${a.id}-${p.id ?? p.name}`, name: p.name, role: "Applicant", context: a.property, phone: p.phone ?? "", email: p.email ?? "" });
      }
    }
  }
  for (const h of managed?.properties ?? []) {
    for (const t of h.tenants) {
      if (matches(needle, t.name, t.email, t.phone)) {
        found.add({ key: `ten-${t.contactId}`, name: t.name, role: "Tenant", context: h.name, phone: t.phone ?? "", email: t.email ?? "" });
      }
    }
  }
  for (const l of managed?.landlords ?? []) {
    if (matches(needle, l.name, l.email, l.phone)) {
      const homes = (managed?.properties ?? []).filter((h) => l.listingIds.includes(h.listingId)).map((h) => h.name);
      found.add({
        key: `ll-${l.contactId}`,
        name: l.name,
        role: "Landlord",
        context: homes.length > 1 ? `${homes[0]} and ${homes.length - 1} more` : homes[0] ?? "",
        phone: l.phone ?? "",
        email: l.email ?? "",
      });
    }
  }
  for (const l of leads) {
    if (matches(needle, l.name, l.email, l.phone)) {
      found.add({
        key: `lead-${l.id}`,
        name: l.name,
        /* Which side, so Search for a Tenant and Search for a Landlord can
           each leave the other out (18 Sep 2026). */
        role: l.enquiry === "Letting" ? "Tenant Lead" : "Landlord Lead",
        context: l.address || `${l.enquiry} enquiry`,
        phone: l.phone ?? "",
        email: l.email ?? "",
      });
    }
  }
  for (const c of contacts) {
    if (matches(needle, c.name, c.email, c.mobile)) {
      found.add({ key: `os-${c.id}`, name: c.name, role: c.kind === "landlord" ? "Landlord" : c.kind === "tenant" ? "Tenant" : "Contact", context: c.address, phone: c.mobile, email: c.email });
    }
  }
  for (const p of known) {
    found.add({ key: `rex-${p.id}`, name: p.name, role: "Contact", context: "", phone: p.phone, email: p.email });
  }

  return NextResponse.json({ ok: true, people: found.out.slice(0, 30) });
}
