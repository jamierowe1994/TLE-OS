import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { homeOnMarket } from "@/lib/tenant-homes";
import { agentEmailFor } from "@/lib/tenant-find";
import { createPassport, findPassportByEmail, getPassport, savePassport, type PassportRecord } from "@/lib/passport";
import { APPLICANT_TYPES, EMPTY_PASSPORT, TRADING_FOR, WORK_HOURS, workFlags, workLine, type PassportData } from "@/lib/passport-shape";
import { diffOffer, offerSubset, type OfferPassport } from "@/lib/offer-passport";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { sendEmail } from "@/lib/resend";
import { proseEmail } from "@/lib/email/prose";
import { addTestOffer, isTestId, testListing } from "@/lib/test-overlay";

/**
 * An offer the AGENT puts forward for a tenant (1 Oct 2026, James: "build the
 * agent offer, save it for real").
 *
 * Rhiannon's worry was the tenant being made to repeat themselves. So the
 * offer is built from their passport, and what the agent changes or fills in
 * goes back into it. A tenant with no passport gets one started from what the
 * agent asked them - not sent, not invited: it only goes to them when the
 * agent presses Send passport (James, 1 Oct 2026), and then it arrives
 * already filled in.
 *
 * Stored in os_tenant_viewing_responses with the tenant's own offers, kind
 * "offer", so /offers/<id> shows both the same way. `recordedBy` says it was
 * the agent, and how it came in.
 */

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const str = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
const list = (v: unknown, max = 12) => (Array.isArray(v) ? v.map((x) => str(x, 120)).filter(Boolean).slice(0, max) : []);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export type OfferContext = {
  home: { id: string; address: string; locality: string; askingPcm: number; beds: number; photo: string | null } | null;
  tenant: { name: string; email: string; passport: PassportData | null; passportDoneOn: string | null };
};

/** The home and the tenant's passport, for the screen to open on. */
export async function offerContext(p: { listingId: string; email: string; name: string }): Promise<OfferContext> {
  /* A test listing (negative id, lib/test-overlay) is read off its test file,
     and nobody's passport is read for it. */
  if (/^-\d+$/.test(p.listingId)) {
    const t = await testListing(p.listingId).catch(() => null);
    return {
      home: t ? { id: p.listingId, address: t.name, locality: t.locality, askingPcm: t.rent, beds: t.beds, photo: t.images[0] ?? null } : null,
      tenant: { name: p.name, email: p.email, passport: null, passportDoneOn: null },
    };
  }
  const h = /^\d+$/.test(p.listingId) ? await homeOnMarket(p.listingId).catch(() => null) : null;
  const rec = emailOk(p.email) ? await passportFor(p.email) : null;
  return {
    home: h
      ? {
          id: p.listingId,
          address: h.name,
          locality: h.locality ?? "",
          askingPcm: h.rentPeriod === "month" ? h.rent : h.rentPcm,
          beds: h.beds ?? 0,
          photo: h.photo ?? null,
        }
      : null,
    tenant: {
      name: rec?.data.legalName || p.name,
      email: p.email,
      passport: rec ? rec.data : null,
      passportDoneOn: rec?.submittedAt
        ? new Date(rec.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })
        : null,
    },
  };
}

async function passportFor(email: string): Promise<PassportRecord | null> {
  const found = await findPassportByEmail(email, null).catch(() => null);
  return found ? await getPassport(found.token).catch(() => null) : null;
}

/** What the screen sent for the passport, kept to the shapes each answer can take. */
function cleanPassport(raw: unknown, was: OfferPassport): OfferPassport {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bool = (k: keyof OfferPassport) => (r[k] === true ? true : r[k] === false ? false : (was[k] as boolean | null));
  const text = (k: keyof OfferPassport, max = 200) => (typeof r[k] === "string" ? String(r[k]).trim().slice(0, max) : (was[k] as string));
  const pick = (k: keyof OfferPassport, allowed: readonly string[]) => {
    const v = text(k, 40);
    return v === "" || allowed.includes(v) ? v : (was[k] as string);
  };
  return {
    applicantType: pick("applicantType", APPLICANT_TYPES),
    workHours: pick("workHours", WORK_HOURS),
    zeroHours: bool("zeroHours"),
    onProbation: bool("onProbation"),
    tradingFor: pick("tradingFor", TRADING_FOR),
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

export class OfferRefused extends Error {}

export async function saveAgentOffer(me: OsUser, raw: Record<string, unknown>): Promise<{ id: string; copy: string; passport: string; href?: string }> {
  if (!hasDb()) throw new OfferRefused("This can't be saved on this environment.");
  const email = str(raw.email, 200).toLowerCase();
  const name = str(raw.name, 120);
  if (!emailOk(email)) throw new OfferRefused("The tenant needs an email address on their record first.");
  if (!name) throw new OfferRefused("Who is the offer for?");

  /* A TEST listing (7 Oct 2026): the same checks, filed on the test file as
     a test offer. No passport is touched, nobody is emailed. */
  if (isTestId(raw.listingId)) {
    const t = await testListing(str(raw.listingId, 20)).catch(() => null);
    if (!t) throw new OfferRefused("That test listing isn't there any more.");
    const amount = Math.round(Number(str(raw.amount, 20).replace(/[£,\s]/g, "")));
    if (!Number.isFinite(amount) || amount <= 0) throw new OfferRefused("Put in the rent they are offering.");
    if (t.rent && amount > t.rent) throw new OfferRefused(`The advertised rent is ${gbp(t.rent)} a month, so an offer can't be above that.`);
    const moveIn = str(raw.moveIn, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(moveIn)) throw new OfferRefused("Choose the day they'd like to move in.");
    if (raw.consent !== true) throw new OfferRefused("Tick to say the tenant has agreed the details.");
    const pp = cleanPassport(raw.passport, { ...offerSubset(null), numAdults: "1", numChildren: "0" });
    const appId = await addTestOffer({
      listingId: t.listingId,
      by: { email: me.email },
      name,
      email,
      amount,
      moveIn,
      adults: Number(pp.numAdults) || 1,
      children: Number(pp.numChildren) || 0,
      pets: pp.pets === true,
    }).catch((e) => {
      throw new OfferRefused(e instanceof Error ? e.message : "That didn't save.");
    });
    return { id: appId, copy: "not asked for", passport: "unchanged, this is a test file", href: `/applications?open=${encodeURIComponent(appId)}` };
  }

  /* The home, read again here: the rent cap is the law, so it is checked on
     the server against the live advert, not taken from the page. */
  const listingId = /^\d+$/.test(str(raw.listingId, 20)) ? str(raw.listingId, 20) : null;
  const home = listingId ? await homeOnMarket(listingId).catch(() => null) : null;
  if (!home || !listingId) throw new OfferRefused("That home isn't on the market any more, so an offer can't go on it.");
  const asking = home.rentPeriod === "month" ? home.rent : home.rentPcm;
  const address = [home.name, home.locality].filter(Boolean).join(", ");

  const amount = Math.round(Number(str(raw.amount, 20).replace(/[£,\s]/g, "")));
  if (!Number.isFinite(amount) || amount <= 0) throw new OfferRefused("Put in the rent they are offering.");
  if (asking && amount > asking) throw new OfferRefused(`The advertised rent is ${gbp(asking)} a month, so an offer can't be above that.`);
  const moveIn = str(raw.moveIn, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveIn)) throw new OfferRefused("Choose the day they'd like to move in.");
  if (raw.consent !== true) throw new OfferRefused("Tick to say the tenant has agreed the details.");
  const how = str(raw.how, 30) || "On the phone";

  /* Their passport: what we hold, what the agent sent, and the difference,
     which is saved back so nobody asks again. */
  let rec = await passportFor(email);
  const held = offerSubset(rec?.data ?? null);
  const before = { ...held, numAdults: held.numAdults || "1", numChildren: held.numChildren || "0" };
  const after = cleanPassport(raw.passport, before);
  const changes = rec ? diffOffer(before, after) : [];
  let passportNote: string;
  if (rec) {
    if (changes.length) await savePassport(rec.token, { ...rec.data, ...after });
    passportNote = changes.length ? `${changes.length} answer${changes.length === 1 ? "" : "s"} updated` : "unchanged";
  } else {
    const made = await createPassport({ name, email, agentId: me.id });
    const data: PassportData = { ...EMPTY_PASSPORT, legalName: name, email, ...after };
    await savePassport(made.token, data);
    rec = await getPassport(made.token);
    passportNote = "started from this offer, not sent";
  }

  const movingIn = list(raw.movingIn, 20);
  const works = list(raw.works);
  const note = str(raw.note);
  const payload = {
    amount,
    asking,
    moveIn,
    movingIn,
    works,
    adults: Number(after.numAdults),
    children: Number(after.numChildren),
    pets: after.pets === true,
    petsNote: after.petsNote,
    note,
    /* The household's income as the agent saw it - theirs plus whoever else
       is ticked as moving in - which is what the landlord's affordability
       figure is worked from. Falls back to theirs alone. */
    householdIncome: Math.max(0, Math.round(Number(raw.householdIncome) || 0)) || Number(String(after.annualIncome).replace(/[£,\s]/g, "")) || null,
    passport: after,
    changes,
    recordedBy: { name: me.name, email: me.email, how },
  };

  const id = randomUUID();
  const whenWords = new Date(`${moveIn}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const who = `${movingIn.length ? movingIn.join(" and ") : name}${after.pets ? `, with ${after.petsNote ? after.petsNote.charAt(0).toLowerCase() + after.petsNote.slice(1) : "pets"}` : ""}`;

  /* The tenant's copy, from the agent's own mailbox, when asked for. */
  let copy = "not asked for";
  if (raw.copyToTenant === true) {
    const summary = [
      `<strong>Rent:</strong> ${gbp(amount)} a month`,
      `<strong>Moving in:</strong> ${whenWords}`,
      `<strong>Who:</strong> ${who}`,
      works.length ? `<strong>Works before moving day:</strong> ${works.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("<br>");
    const { subject, html } = renderTleEmail("tenant-offer-copy", {
      firstName: name.split(/\s+/)[0] || "there",
      address: home.name,
      agentName: me.name || "Your agent",
      summaryList: summary,
    });
    const r = await sendAsAgent({ me, to: email, toName: name, subject, html }).catch((e) => ({ sent: false, detail: e instanceof Error ? e.message : "did not send" }));
    copy = r.sent ? "sent" : `not sent: ${r.detail}`;
  }

  /* The listing's own agent hears, when it isn't the person who took it. */
  const listingAgent = await agentEmailFor(listingId, null).catch(() => null);
  let outcome = "recorded";
  if (listingAgent && listingAgent.toLowerCase() !== me.email.toLowerCase()) {
    const base = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");
    const body = [
      `${me.name} has put an offer forward on ${address} for ${name}.`,
      [`Offer: ${gbp(amount)} a month (advertised at ${gbp(asking)})`, `Move in: ${whenWords}`, `Moving in: ${who}`, `Working: ${workLine(after)}`, ...workFlags(after)].join("\n"),
      works.length ? `Works before moving day:\n${works.map((w) => `- ${w}`).join("\n")}` : "",
      note ? `For the landlord:\n${note}` : "",
      `Open the offer: ${base}/offers/${id}`,
    ];
    try {
      await sendEmail({ to: listingAgent, subject: `Offer from ${name}: ${gbp(amount)} a month on ${address}`, html: proseEmail(body.filter(Boolean).join("\n\n")), replyTo: me.email, audience: "internal" });
      outcome = `recorded, sent to ${listingAgent}`;
    } catch {
      outcome = "recorded, listing agent not told";
    }
  }

  await q(
    `INSERT INTO os_tenant_viewing_responses (id, email, name, listing_id, address, kind, payload, sent_to, outcome)
     VALUES ($1,$2,$3,$4,$5,'offer',$6::jsonb,$7,$8)`,
    [id, email, name, listingId, address, JSON.stringify(payload), listingAgent, `${outcome}; copy ${copy}; passport ${passportNote}`.slice(0, 300)]
  );
  return { id, copy, passport: passportNote };
}
