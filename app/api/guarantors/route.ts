import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { leadAccess } from "@/lib/lead-access";
import { letPeople } from "@/lib/let-people";
import { scopeFor } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { contactIdOf, isOsContactLead } from "@/lib/contact-leads";
import {
  addGuarantor,
  guarantorsFor,
  problemWith,
  removeGuarantor,
  updateGuarantor,
  type Guarantor,
  type GuarantorInput,
} from "@/lib/guarantors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /api/guarantors - an applicant's guarantors (lib/guarantors).
 *
 *   GET    ?lead=<lead id> | ?let=<let ref> | ?listing=<listing id>
 *   POST   { lead|let|listing, guarantor }            add one
 *   PATCH  { lead|let|listing, id, guarantor }        change one
 *   DELETE { lead|let|listing, id }                   take one off
 *
 * Every call names the record it is made from, and is allowed exactly when
 * that record is: the lead by lib/lead-access, the let by lib/let-people,
 * the home by being on this person's Portfolio. The record also says who the
 * applicants are, so a guarantor can only be put on somebody who is on it,
 * and only that record's guarantors can be read or changed from it.
 * Nothing is sent anywhere.
 */

type Person = { name: string; email: string | null };
type Place = { people: Person[]; leadId: string | null; letRef: string | null };

async function placeOf(req: NextRequest, p: { lead?: string | null; let?: string | null; listing?: string | null }): Promise<{ place: Place; by: string } | { error: NextResponse }> {
  const fail = (error: string, status: number) => ({ error: NextResponse.json({ ok: false, error }, { status }) });
  if (!hasDb()) return fail("No database here, so guarantors can't be kept.", 503);

  if (p.lead) {
    const { who, denied } = await leadAccess(req, p.lead);
    if (denied) return { error: denied };
    const rows = isOsContactLead(p.lead)
      ? await q<{ name: string; email: string | null }>(`SELECT name, email FROM os_contacts WHERE id = $1`, [contactIdOf(p.lead)]).catch(() => [])
      : await q<{ name: string; email: string | null }>(`SELECT name, email FROM os_leads WHERE id = $1`, [p.lead]).catch(() => []);
    const people = rows.map((r) => ({ name: r.name ?? "", email: r.email || null }));
    return { place: { people, leadId: p.lead, letRef: null }, by: who.actor.email };
  }

  const { actor } = await whoIs(req);
  if (!actor) return fail("Sign in first.", 401);

  if (p.let) {
    const a = await letPeople(p.let, actor);
    if (!a.ok) return fail(a.error, a.status);
    return { place: { people: a.let.tenants.map((t) => ({ name: t.name, email: t.email })), leadId: null, letRef: p.let }, by: actor.email };
  }

  if (p.listing) {
    const scope = await scopeFor(req);
    if (scope.unlinked) return fail("We can't tell which REX user you are, so we can't open homes for you.", 403);
    const { book } = await managedBookFor(scope.rexUserId).catch(() => ({ book: null }));
    if (!book) return fail("Your homes couldn't be read just now. Try again in a minute.", 503);
    const home = book.properties.find((h) => String(h.listingId) === String(p.listing));
    if (!home) return fail("That home isn't on your book.", 404);
    return { place: { people: home.tenants.map((t) => ({ name: t.name, email: t.email })), leadId: null, letRef: null }, by: actor.email };
  }

  return fail("Say which record: a lead, a let or a home.", 400);
}

const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The guarantor as typed, put on an applicant who is on this record. */
function onThis(place: Place, g: Partial<GuarantorInput>): GuarantorInput | string {
  const input: GuarantorInput = {
    applicantName: String(g.applicantName ?? ""),
    applicantEmail: g.applicantEmail ? String(g.applicantEmail) : null,
    name: String(g.name ?? ""),
    email: String(g.email ?? ""),
    phone: String(g.phone ?? ""),
    relationship: String(g.relationship ?? ""),
    address: String(g.address ?? ""),
  };
  const problem = problemWith(input);
  if (problem) return problem;
  const who = place.people.find((p) => (input.applicantEmail ? sameEmail(p.email, input.applicantEmail) : sameName(p.name, input.applicantName)));
  if (!who) return "That applicant isn't on this record.";
  return { ...input, applicantName: who.name || input.applicantName, applicantEmail: who.email };
}

async function theirs(place: Place): Promise<Guarantor[]> {
  return guarantorsFor({ emails: place.people.map((p) => p.email), leadId: place.leadId, letRef: place.letRef });
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const r = await placeOf(req, { lead: sp.get("lead"), let: sp.get("let"), listing: sp.get("listing") });
  if ("error" in r) return r.error;
  try {
    return NextResponse.json({ ok: true, guarantors: await theirs(r.place), applicants: r.place.people });
  } catch {
    return NextResponse.json({ ok: false, error: "The guarantors couldn't be read just now. Try again in a minute." }, { status: 503 });
  }
}

type Body = { lead?: string; let?: string; listing?: string; id?: string; guarantor?: Partial<GuarantorInput> };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const r = await placeOf(req, body);
  if ("error" in r) return r.error;
  const g = onThis(r.place, body.guarantor ?? {});
  if (typeof g === "string") return NextResponse.json({ ok: false, error: g }, { status: 400 });
  try {
    const saved = await addGuarantor(g, { leadId: r.place.leadId, letRef: r.place.letRef }, r.by);
    return NextResponse.json({ ok: true, guarantor: saved, guarantors: await theirs(r.place) });
  } catch {
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const r = await placeOf(req, body);
  if ("error" in r) return r.error;
  const mine = await theirs(r.place).catch(() => []);
  if (!body.id || !mine.some((x) => x.id === body.id)) return NextResponse.json({ ok: false, error: "That guarantor isn't on this record." }, { status: 404 });
  const g = onThis(r.place, body.guarantor ?? {});
  if (typeof g === "string") return NextResponse.json({ ok: false, error: g }, { status: 400 });
  try {
    const saved = await updateGuarantor(body.id, g, r.by);
    return NextResponse.json({ ok: true, guarantor: saved, guarantors: await theirs(r.place) });
  } catch {
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const r = await placeOf(req, body);
  if ("error" in r) return r.error;
  const mine = await theirs(r.place).catch(() => []);
  if (!body.id || !mine.some((x) => x.id === body.id)) return NextResponse.json({ ok: false, error: "That guarantor isn't on this record." }, { status: 404 });
  try {
    await removeGuarantor(body.id, r.by);
    return NextResponse.json({ ok: true, guarantors: await theirs(r.place) });
  } catch {
    return NextResponse.json({ ok: false, error: "That didn't save. Try again." }, { status: 500 });
  }
}
