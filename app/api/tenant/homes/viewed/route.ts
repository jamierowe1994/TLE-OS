import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { currentTenant, tenantPassport } from "@/lib/tenant-account";
import { homeOnMarket } from "@/lib/tenant-homes";
import { agentEmailFor, noteOnLeads } from "@/lib/tenant-find";
import { proseEmail } from "@/lib/email/prose";
import { sendEmail } from "@/lib/resend";
import { APPLICANT_TYPES, type PassportData } from "@/lib/passport-shape";
import { savePassport } from "@/lib/passport";
import { diffOffer, offerSubset, show, type OfferChange, type OfferPassport } from "@/lib/offer-passport";

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

/**
 * The passport, as the agent reads it in the email. A changed answer carries
 * an asterisk and what it said before; one worth a second look (lib/offer-
 * passport watched) says so. Plain text: the email is prose.
 */
function passportLines(d: OfferPassport, changes: OfferChange[]): string[] {
  const mark = (k: keyof OfferPassport, line: string) => {
    const c = changes.find((x) => x.key === k);
    return c ? `${line} *  (was: ${c.from})${c.watch ? "  - worth a look" : ""}` : line;
  };
  return [
    mark("applicantType", `Working: ${show("applicantType", d.applicantType)}`),
    mark("annualIncome", `Income: ${show("annualIncome", d.annualIncome)}`),
    mark("hasBritishPassport", `British or Irish passport: ${show("hasBritishPassport", d.hasBritishPassport)}`),
    ...(d.hasBritishPassport ? [] : [mark("shareCode", `Share code: ${show("shareCode", d.shareCode)}`)]),
    mark("landlordRef", `Landlord reference: ${show("landlordRef", d.landlordRef)}`),
    mark("guarantor", `Guarantor: ${show("guarantor", d.guarantor)}`),
    mark("adverseCredit", `Adverse credit: ${show("adverseCredit", d.adverseCredit)}${d.adverseCredit && d.adverseCreditNote ? ` (${d.adverseCreditNote})` : ""}`),
    mark("smoker", `Smoker: ${show("smoker", d.smoker)}`),
  ];
}

/** What the sheet sent for the passport, kept to the shapes each answer can take. */
function cleanPassport(raw: unknown, was: OfferPassport): OfferPassport {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bool = (k: keyof OfferPassport) => (r[k] === true ? true : r[k] === false ? false : (was[k] as boolean | null));
  const text = (k: keyof OfferPassport, max = 200) => (typeof r[k] === "string" ? String(r[k]).trim().slice(0, max) : (was[k] as string));
  const type = text("applicantType", 40);
  return {
    applicantType: (APPLICANT_TYPES as readonly string[]).includes(type) || type === "" ? type : was.applicantType,
    annualIncome: text("annualIncome", 20),
    hasBritishPassport: bool("hasBritishPassport"),
    shareCode: text("shareCode", 20),
    landlordRef: bool("landlordRef"),
    guarantor: bool("guarantor"),
    adverseCredit: bool("adverseCredit"),
    adverseCreditNote: text("adverseCreditNote"),
    smoker: bool("smoker"),
    numAdults: String(Math.max(1, Math.min(9, parseInt(text("numAdults", 2), 10) || 1))),
    numChildren: String(Math.max(0, Math.min(9, parseInt(text("numChildren", 2), 10) || 0))),
    pets: bool("pets"),
    petsNote: text("petsNote"),
  };
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
    /* Their passport as they sent it, against the passport as we HOLD it -
       never against what the page says it was. What differs is saved to the
       passport and kept here with the original, for the agent only. */
    /* A blank household count reads as the sheet's own default (1 adult,
       no children), so filling it in is not flagged to the agent as a change. */
    const held = offerSubset(data);
    const before = { ...held, numAdults: held.numAdults || "1", numChildren: held.numChildren || "0" };
    const after = cleanPassport(b.passport, before);
    const changes = diffOffer(before, after);
    if (changes.length && record) {
      await savePassport(record.token, { ...(data as PassportData), ...after }).catch(() => null);
    }
    payload = {
      amount,
      asking,
      moveIn: str(o.moveIn, 10),
      term: str(o.term, 20) || "12 months",
      adults: Number(after.numAdults),
      children: Number(after.numChildren),
      pets: after.pets === true,
      petsNote: after.petsNote,
      note: str(o.note),
      passport: after,
      changes,
    };
  }

  const id = randomUUID();
  const OFFER_LINK = `${(process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "")}/offers/${id}`;

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
    const p = payload as { amount: number; asking: number | null; moveIn: string; term: string; adults: number; children: number; pets: boolean; petsNote: string; note: string; passport: OfferPassport; changes: OfferChange[] };
    const moveIn = new Date(p.moveIn).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    subject = `Offer from ${who}: ${gbp(p.amount)} a month on ${address}`;
    body = [
      `${who} would like to offer on ${address}.`,
      [`Offer: ${gbp(p.amount)} a month${p.asking ? ` (advertised at ${gbp(p.asking)})` : ""}`, `Move in: ${moveIn}`, `Term: ${p.term}`, `Moving in: ${p.adults} adult${p.adults === 1 ? "" : "s"}${p.children ? `, ${p.children} child${p.children === 1 ? "" : "ren"}` : ""}${p.pets ? `, with pets${p.petsNote ? ` (${p.petsNote})` : ""}` : ", no pets"}`].join("\n"),
      p.note ? `For the landlord:\n${p.note}` : "",
      `From their tenant passport, confirmed as up to date:\n${passportLines(p.passport, p.changes).join("\n")}`,
      p.changes.length
        ? `* ${p.changes.length === 1 ? "One answer was" : `${p.changes.length} answers were`} changed with this offer. They can't see these marks.${p.changes.some((c) => c.watch) ? " Worth a look before it goes to the landlord." : ""}\nOpen the offer: ${OFFER_LINK}`
        : `Open the offer: ${OFFER_LINK}`,
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
    [id, me.email, me.name, listingId, address, kind, JSON.stringify(payload), to, outcome]
  );
  const on = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
  await noteOnLeads({ email: me.email, name: me.name, phone, address, line: `${on}: ${subject}.${outcome === "sent" ? ` Emailed to ${to}.` : ""}` }).catch(() => null);

  return NextResponse.json({ ok: true, sentTo: outcome === "sent" ? to : null });
}
