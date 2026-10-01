import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { homeOnMarket } from "@/lib/tenant-homes";
import { readListingDetails } from "@/lib/listing-details";
import { noteOnLeads } from "@/lib/tenant-find";
import { validateApplication, type NewApplication } from "@/lib/applications";
import { EMPTY_PASSPORT, workFlags, workLine, type PassportData } from "@/lib/passport-shape";
import { offerSubset } from "@/lib/offer-passport";
import { proseEmail } from "@/lib/email/prose";
import { sendEmail } from "@/lib/resend";
import { publicOrigin } from "@/lib/origin";

/**
 * The application form a listing sends out (Howard's ticket, approved by James
 * 1 Oct 2026). /tenant/apply?listing=<id> is the link the agent copies or
 * emails from the listing; this is what that page reads and files to.
 *
 * Public, like the feedback page and the passport: an applicant has no
 * account. So it only ever answers for a home that is on the market now, and
 * it reads nothing a stranger could not already see on Rightmove.
 *
 * GET  ?listing=<id> → the home, its advertised rent and the agent's name.
 * POST              → the application, kept with the tenant offers
 *                     (os_tenant_viewing_responses, kind "offer"), so it shows
 *                     at /offers/<id> and on the landlord's screen exactly as
 *                     an offer made from the tenant portal does. The
 *                     listing's agent is emailed with everything in it, and
 *                     the lead applicant's Leads record gets a note.
 *
 * Nothing here writes to REX. Filing it into REX as an application stays the
 * agent's job, from the staff side, under their own sign-in.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
const noDash = (s: string) => s.replace(/\s*[—–]\s*/g, " - ");

type Home = { id: number; property: string; locality: string; askingPcm: number; agent: string; agentEmail: string | null; photo: string | null };

/* One listings read per home every ten minutes at most, however often a
   public page is opened. */
const held = new Map<string, { at: number; home: Home | null }>();

async function homeFor(id: string): Promise<Home | null> {
  if (!/^\d+$/.test(id)) return null;
  const hit = held.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.home;
  const h = await homeOnMarket(id).catch(() => null);
  let home: Home | null = null;
  if (h) {
    const details = await readListingDetails(Number(id)).catch(() => null);
    home = {
      id: Number(id),
      property: h.name,
      locality: h.locality ?? "",
      askingPcm: h.rentPeriod === "month" ? h.rent : h.rentPcm,
      agent: details?.agent.name?.trim() || "your agent",
      agentEmail: details?.agent.email ?? null,
      photo: h.photo ?? null,
    };
  }
  held.set(id, { at: Date.now(), home });
  return home;
}

export async function GET(req: NextRequest) {
  const id = (req.nextUrl.searchParams.get("listing") ?? "").trim();
  const home = await homeFor(id);
  if (!home) {
    return NextResponse.json({ ok: false, error: "This home has been let or taken off the market, so it isn't taking applications any more. Have a look at what else we have on." }, { status: 404 });
  }
  const { agentEmail: _private, ...pub } = home;
  void _private;
  return NextResponse.json({ ok: true, home: pub });
}

/** The form's work answer, in the passport's own words. */
const TYPE: Record<string, PassportData["applicantType"]> = {
  Employed: "Employed",
  "Self-Employed": "Self-employed",
  Student: "Student",
  Benefits: "On benefits",
  "In Receipt of Pension": "Retired",
};

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Applications can't be taken on this environment." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as (Partial<NewApplication> & Record<string, unknown>) | null;
  if (!body) return NextResponse.json({ ok: false, error: "That didn't arrive. Please try again." }, { status: 400 });

  const listingId = str(body.listingId, 20);
  const home = await homeFor(listingId);
  if (!home) return NextResponse.json({ ok: false, errors: ["This home has been let or taken off the market, so it can't take applications any more."] }, { status: 404 });

  const applicants = (Array.isArray(body.applicants) ? body.applicants : []).slice(0, 8).map((a) => {
    const r = (a ?? {}) as unknown as Record<string, unknown>;
    return {
      name: str(r.name, 120),
      email: str(r.email, 200).toLowerCase(),
      phone: str(r.phone, 40),
      dob: str(r.dob, 10),
      isPrimary: r.isPrimary === true,
      employment: str(r.employment, 40),
      job: str(r.job, 120),
      company: str(r.company, 120),
      position: str(r.position, 40),
      zeroHours: r.zeroHours === true,
      inProbation: r.inProbation === true,
      income: Math.max(0, Math.round(Number(r.income) || 0)),
      rightToRent: r.rightToRent === true,
      landlordRef: r.landlordRef === true,
      guarantor: r.guarantor === true,
      adverseCredit: r.adverseCredit === true,
      adverseCreditNote: str(r.adverseCreditNote, 1000),
    };
  });
  const app = {
    listingId: home.id,
    offerAmount: Math.round(Number(body.offerAmount) || 0),
    startDate: str(body.startDate, 10),
    agreementMonths: 0,
    occupants: Math.max(1, Math.min(12, Math.round(Number(body.occupants) || 1))),
    dependents: Math.max(0, Math.min(12, Math.round(Number(body.dependents) || 0))),
    hasPets: body.hasPets === true,
    conditions: str(body.conditions),
    applicants,
  } as NewApplication;

  /* The same rules as the staff route, against the live advert rather than
     what the page said it was. */
  const errors = validateApplication(app, home.askingPcm || null).map(noDash);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(app.startDate)) errors.push("Choose the day you'd like to move in.");
  if (applicants.some((a) => a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))) errors.push("One of the email addresses doesn't look right.");
  if (errors.length) return NextResponse.json({ ok: false, errors: [...new Set(errors)] }, { status: 400 });

  const lead = applicants.find((a) => a.isPrimary) ?? applicants[0];
  const address = [home.property, home.locality].filter(Boolean).join(", ");

  /* Sent twice by a double press: the first one stands. */
  const recent = await q<{ id: string }>(
    `SELECT id FROM os_tenant_viewing_responses
      WHERE kind = 'offer' AND listing_id = $1 AND LOWER(email) = $2 AND created_at > NOW() - INTERVAL '10 minutes' LIMIT 1`,
    [String(home.id), lead.email]
  ).catch(() => []);
  if (recent[0]) return NextResponse.json({ ok: true, status: "received" });

  const passport = {
    ...offerSubset(EMPTY_PASSPORT),
    applicantType: TYPE[lead.employment] ?? "",
    zeroHours: lead.employment === "Employed" ? lead.zeroHours : null,
    onProbation: lead.employment === "Employed" ? lead.inProbation : null,
    annualIncome: lead.income ? String(lead.income) : "",
    landlordRef: lead.landlordRef,
    guarantor: lead.guarantor,
    adverseCredit: lead.adverseCredit,
    adverseCreditNote: lead.adverseCreditNote,
    numAdults: String(app.occupants),
    numChildren: String(app.dependents),
    pets: app.hasPets,
  };
  const householdIncome = applicants.reduce((t, a) => t + a.income, 0);
  const payload = {
    /* Agent first (James, 1 Oct 2026): a form sent in from a link stays with
       the agent. It reaches the landlord only when the agent puts it forward
       (lib/landlord-account osOffers skips this source). */
    source: "application-form",
    amount: app.offerAmount,
    asking: home.askingPcm || null,
    moveIn: app.startDate,
    movingIn: applicants.map((a) => a.name).filter(Boolean),
    works: [] as string[],
    adults: app.occupants,
    children: app.dependents,
    pets: app.hasPets,
    petsNote: "",
    note: app.conditions ?? "",
    householdIncome: householdIncome || null,
    passport,
    changes: [],
    /* Where it came from, and every applicant's own answers - the landlord's
       screen reads the lead's, the agent's email carries them all. */
    via: "Application form",
    applicants,
  };

  const id = randomUUID();
  const link = `${publicOrigin(req)}/offers/${id}`;
  const moveIn = new Date(`${app.startDate}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const yn = (b: boolean) => (b ? "yes" : "no");
  const people = applicants.map((a, i) => {
    const type = TYPE[a.employment] ?? "";
    const work = { applicantType: type, onProbation: type === "Employed" ? a.inProbation : null, zeroHours: type === "Employed" ? a.zeroHours : null, workHours: "", tradingFor: "" } as const;
    return [
      `${i === 0 || a.isPrimary ? "Lead applicant" : `Applicant ${i + 1}`}: ${a.name}`,
      [a.email, a.phone].filter(Boolean).join(" · "),
      `Born: ${a.dob}`,
      `Working: ${workLine(work)}${a.job ? `, ${a.job}` : ""}${a.company ? ` at ${a.company}` : ""}${a.position ? ` (${a.position.toLowerCase()})` : ""}`,
      ...workFlags(work).map((f) => `  ! ${f}`),
      `Income: ${a.income ? `${gbp(a.income)} a year` : "not said"}`,
      `Right to rent: ${yn(a.rightToRent)} · Landlord reference: ${yn(a.landlordRef)} · Guarantor: ${yn(a.guarantor)} · Adverse credit: ${yn(a.adverseCredit)}${a.adverseCredit && a.adverseCreditNote ? ` (${a.adverseCreditNote})` : ""}`,
    ].join("\n");
  });
  const subject = `Application from ${lead.name}: ${gbp(app.offerAmount)} a month on ${address}`;
  const text = [
    `${lead.name} has applied for ${address} through the application form.`,
    [
      `Offer: ${gbp(app.offerAmount)} a month${home.askingPcm ? ` (advertised at ${gbp(home.askingPcm)})` : ""}`,
      `Move in: ${moveIn}`,
      `Moving in: ${app.occupants} adult${app.occupants === 1 ? "" : "s"}${app.dependents ? `, ${app.dependents} child${app.dependents === 1 ? "" : "ren"}` : ""}, ${app.hasPets ? "with pets" : "no pets"}`,
      householdIncome ? `Household income: ${gbp(householdIncome)} a year (rent is ${Math.round(((app.offerAmount * 12) / householdIncome) * 100)}% of it)` : "",
    ].filter(Boolean).join("\n"),
    ...people,
    app.conditions ? `Anything else, in their words:\n${app.conditions}` : "",
    `Open the application: ${link}`,
    "Put it to the landlord, and reply to them either way.",
  ];

  /* Staff mail, so not behind the customer switch: an application sitting in
     a table nobody reads is the failure here. */
  let outcome = "not_sent";
  if (home.agentEmail) {
    try {
      await sendEmail({ to: home.agentEmail, subject, html: proseEmail(text.filter(Boolean).join("\n\n")), replyTo: lead.email, audience: "internal" });
      outcome = "sent";
    } catch (e) {
      outcome = `failed: ${e instanceof Error ? e.message : "send failed"}`.slice(0, 300);
    }
  }

  await q(
    `INSERT INTO os_tenant_viewing_responses (id, email, name, listing_id, address, kind, payload, sent_to, outcome)
     VALUES ($1,$2,$3,$4,$5,'offer',$6::jsonb,$7,$8)`,
    [id, lead.email, lead.name, String(home.id), address, JSON.stringify(payload), home.agentEmail, outcome]
  );
  const on = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  await noteOnLeads({ email: lead.email, name: lead.name, phone: lead.phone, address, line: `${on}: ${subject}.${outcome === "sent" ? ` Emailed to ${home.agentEmail}.` : ""}` }).catch(() => null);

  return NextResponse.json({ ok: true, status: "received" });
}
