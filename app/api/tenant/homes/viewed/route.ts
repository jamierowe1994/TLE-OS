import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { currentTenant, tenantPassport } from "@/lib/tenant-account";
import { homeOnMarket } from "@/lib/tenant-homes";
import { agentEmailFor, noteOnLeads } from "@/lib/tenant-find";
import { proseEmail } from "@/lib/email/prose";
import { sendEmail } from "@/lib/resend";
import type { PassportData } from "@/lib/passport-shape";

/**
 * After a viewing, from the tenant's own area (James, 18 Sep 2026): the three
 * answers on the Viewed stage, each from its own bottom sheet.
 *
 *   not_for_me   what was not right (reasons ticked, and their own words)
 *   questions    what they want to know, emailed to the agent to answer
 *   offer        the rent they offer, when and for how long, who is moving
 *                in, and their passport's details confirmed as up to date
 *
 * The rule the How Was It? page and the application form already keep: an
 * offer can be AT or BELOW the advertised rent, never above - rent is not an
 * auction. Checked here as well as in the sheet, because the sheet is only
 * the browser's word for it.
 *
 * Who the tenant is comes from the session, never the body. The agent is
 * emailed (staff mail, so not behind the customer switch - an offer sitting
 * in a table nobody reads is the failure here) and the tenant's Leads record
 * gets a note, so it is on file whoever picks it up.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = ["not_for_me", "questions", "offer"] as const;
type Kind = (typeof KINDS)[number];

const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, 12) : []);
const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const yn = (b: boolean | null | undefined) => (b == null ? "not said" : b ? "yes" : "no");

/** The passport, as the agent reads it in the email. */
function passportLines(d: PassportData | null): string[] {
  if (!d) return ["No passport on file."];
  return [
    `Working: ${d.applicantType || "not said"}${d.annualIncome ? `, ${gbp(Number(d.annualIncome.replace(/[£,\s]/g, "")) || 0)} a year` : ""}`,
    `Right to rent: ${d.hasBritishPassport ? "British passport" : d.shareCode ? `share code ${d.shareCode}` : "not given yet"}`,
    `Landlord reference: ${yn(d.landlordRef)} · Guarantor: ${yn(d.guarantor)} · Adverse credit: ${yn(d.adverseCredit)}${d.adverseCreditNote ? ` (${d.adverseCreditNote})` : ""}`,
    `Smoker: ${yn(d.smoker)} · Pets: ${yn(d.pets)}${d.petsNote ? ` (${d.petsNote})` : ""}`,
  ];
}

export async function POST(req: NextRequest) {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "This can't be saved on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = str(b.kind, 20) as Kind;
  if (!KINDS.includes(kind)) return NextResponse.json({ ok: false, error: "That wasn't one of the choices." }, { status: 400 });

  const listingId = /^\d+$/.test(str(b.listingId, 20)) ? str(b.listingId, 20) : null;
  const home = listingId ? await homeOnMarket(listingId).catch(() => null) : null;
  const address = home ? [home.name, home.locality].filter(Boolean).join(", ") : str(b.address, 200) || "the home they viewed";
  const record = await tenantPassport(me.email).catch(() => null);
  const data = record?.data ?? null;

  /* What they said, checked. */
  let payload: Record<string, unknown>;
  if (kind === "not_for_me") {
    payload = { reasons: list(b.reasons), note: str(b.note) };
  } else if (kind === "questions") {
    const message = str(b.message);
    if (!message) return NextResponse.json({ ok: false, error: "Write your questions in the box." }, { status: 400 });
    payload = { topics: list(b.topics), message };
  } else {
    const o = (b.offer ?? {}) as Record<string, unknown>;
    const amount = Math.round(Number(String(o.amount ?? "").replace(/[£,\s]/g, "")));
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, error: "Tell us what you'd like to offer each month." }, { status: 400 });
    const asking = home?.rentPeriod === "month" ? home.rent : null;
    if (asking && amount > asking) {
      return NextResponse.json({ ok: false, error: `The advertised rent is ${gbp(asking)} a month, so an offer can't be above that.` }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str(o.moveIn, 10))) return NextResponse.json({ ok: false, error: "Choose the day you'd like to move in." }, { status: 400 });
    if (o.confirmed !== true) return NextResponse.json({ ok: false, error: "Tick to say your details are up to date." }, { status: 400 });
    payload = {
      amount,
      asking,
      moveIn: str(o.moveIn, 10),
      term: str(o.term, 20) || "12 months",
      adults: Math.max(1, Math.min(9, Math.round(Number(o.adults) || 1))),
      children: Math.max(0, Math.min(9, Math.round(Number(o.children) || 0))),
      pets: o.pets === true,
      petsNote: str(o.petsNote, 200),
      note: str(o.note),
    };
  }

  /* The agent hears. */
  const to = await agentEmailFor(listingId, record?.agentId ?? null);
  const who = me.name || me.email;
  const phone = data?.mobile?.trim() ?? "";
  let subject: string;
  let body: string[];
  if (kind === "not_for_me") {
    const reasons = (payload.reasons as string[]).join(", ");
    subject = `Not for them: ${who} on ${address}`;
    body = [`${who} has viewed ${address} and says it isn't for them.`, reasons ? `What wasn't right: ${reasons}.` : "They didn't tick a reason.", payload.note ? `In their words:\n${payload.note}` : ""];
  } else if (kind === "questions") {
    const topics = (payload.topics as string[]).join(", ");
    subject = `Questions from ${who} on ${address}`;
    body = [`${who} liked ${address} but has some questions before they decide.`, topics ? `About: ${topics}.` : "", `Their questions:\n${payload.message}`, "Reply to this email to answer them."];
  } else {
    const p = payload as { amount: number; asking: number | null; moveIn: string; term: string; adults: number; children: number; pets: boolean; petsNote: string; note: string };
    const moveIn = new Date(p.moveIn).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    subject = `Offer from ${who}: ${gbp(p.amount)} a month on ${address}`;
    body = [
      `${who} would like to offer on ${address}.`,
      [`Offer: ${gbp(p.amount)} a month${p.asking ? ` (advertised at ${gbp(p.asking)})` : ""}`, `Move in: ${moveIn}`, `Term: ${p.term}`, `Moving in: ${p.adults} adult${p.adults === 1 ? "" : "s"}${p.children ? `, ${p.children} child${p.children === 1 ? "" : "ren"}` : ""}${p.pets ? `, with pets${p.petsNote ? ` (${p.petsNote})` : ""}` : ", no pets"}`].join("\n"),
      p.note ? `For the landlord:\n${p.note}` : "",
      `From their tenant passport, confirmed as up to date:\n${passportLines(data).join("\n")}`,
      "Put it to the landlord, and reply to them either way.",
    ];
  }
  body.push([`Email: ${me.email}`, phone ? `Phone: ${phone}` : null].filter(Boolean).join("\n"));

  let outcome = "not_sent";
  if (to) {
    try {
      await sendEmail({ to, subject, html: proseEmail(body.filter(Boolean).join("\n\n")), replyTo: me.email, audience: "internal" });
      outcome = "sent";
    } catch (e) {
      outcome = `failed: ${e instanceof Error ? e.message : "send failed"}`.slice(0, 300);
    }
  }

  await q(
    `INSERT INTO os_tenant_viewing_responses (id, email, name, listing_id, address, kind, payload, sent_to, outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
    [randomUUID(), me.email, me.name, listingId, address, kind, JSON.stringify(payload), to, outcome]
  );
  const on = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  await noteOnLeads({ email: me.email, name: me.name, phone, address, line: `${on}: ${subject}.${outcome === "sent" ? ` Emailed to ${to}.` : ""}` }).catch(() => null);

  return NextResponse.json({ ok: true, sentTo: outcome === "sent" ? to : null });
}
