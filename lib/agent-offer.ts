import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { homeOnMarket } from "@/lib/tenant-homes";
import { agentEmailFor } from "@/lib/tenant-find";
import { createPassport, findPassportByEmail, getPassport, markScottishHome, savePassport, type PassportRecord } from "@/lib/passport";
import { isScottish } from "@/lib/property-flags";
import { SCOTLAND } from "@/lib/passport-shape";
import { forScreen } from "@/lib/passport-scotland";
import { APPLICANT_TYPES, EMPTY_PASSPORT, TRADING_FOR, WORK_HOURS, workFlags, workLine, type PassportData } from "@/lib/passport-shape";
import { diffOffer, offerSubset, type OfferPassport } from "@/lib/offer-passport";
import { escapeHtml, renderTleEmail } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { sendEmail } from "@/lib/resend";
import { proseEmail } from "@/lib/email/prose";
import { addTestOffer, isTestId, kitPeopleForTestListing, testListing } from "@/lib/test-overlay";
import { addOfferPeople, checkOthers, partLink } from "@/lib/offer-people";
import { incomeOf, personLines } from "@/lib/offer-people-shape";
import { foldRepeat, priorOffer, repeatLine } from "@/lib/offer-repeat";
import { getApplications } from "@/lib/applications";

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

/** An application this tenant already has on this home, with everyone on it. */
export type ExistingApplication = { id: string; status: string; people: { name: string; email: string | null; phone: string | null; isPrimary: boolean }[] };

export type OfferContext = {
  home: { id: string; address: string; locality: string; askingPcm: number; beds: number; photo: string | null } | null;
  tenant: { name: string; email: string; passport: PassportData | null; passportDoneOn: string | null; existing?: ExistingApplication | null };
};

/**
 * 12 South Chesters Lane, 30 Oct 2026: Lianna opened Put an Offer Forward
 * from Katherine Quinn's lead although REX already held the application, with
 * Steven Quinn's own email and mobile on it. The form reads the passport, which
 * keeps the second adult as a name and an income, so Steven came up blank
 * and "full tenants don't pull through". The application is the file: the
 * form now says so, and fills the others from it.
 */
async function existingApplication(listingId: string, email: string): Promise<ExistingApplication | null> {
  const e = email.trim().toLowerCase();
  if (!e) return null;
  const apps = await getApplications(300).catch(() => []);
  const hit = apps.find((a) => String(a.listingId ?? "") === listingId && a.status !== "unsuccessful" && a.applicants.some((p) => (p.email ?? "").trim().toLowerCase() === e));
  return hit ? { id: hit.id, status: hit.status, people: hit.applicants.map((p) => ({ name: p.name, email: p.email, phone: p.phone, isPrimary: p.isPrimary })) } : null;
}

/** The home and the tenant's passport, for the screen to open on. */
export async function offerContext(p: { listingId: string; email: string; name: string }): Promise<OfferContext> {
  /* A test listing (negative id, lib/test-overlay) is read off its test file.
     The tenant's passport is read as for a real one (13 Oct 2026), so the
     offer opens filled in from it - read only: saving a test offer still
     writes nothing back to the passport (saveAgentOffer). */
  if (/^-\d+$/.test(p.listingId)) {
    const [t, rec] = await Promise.all([
      testListing(p.listingId).catch(() => null),
      testPassportFor(p.listingId, p.email, p.name).catch(() => null),
    ]);
    return {
      home: t ? { id: p.listingId, address: t.name, locality: t.locality, askingPcm: t.rent, beds: t.beds, photo: t.images[0] ?? null } : null,
      tenant: {
        /* The person picked wins on a test file: see testPassportFor. */
        name: p.name || rec?.data.legalName || "",
        email: p.email,
        passport: rec ? (t && isScottish(t.locality, t.name) ? forScreen(rec.data, SCOTLAND) : rec.data) : null,
        passportDoneOn: rec?.submittedAt
          ? new Date(rec.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })
          : null,
      },
    };
  }
  const h = /^\d+$/.test(p.listingId) ? await homeOnMarket(p.listingId).catch(() => null) : null;
  const [rec, existing] = await Promise.all([
    emailOk(p.email) ? passportFor(p.email) : Promise.resolve(null),
    h && emailOk(p.email) ? existingApplication(p.listingId, p.email) : Promise.resolve(null),
  ]);
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
      /* A Scottish home: no nationality or Right to rent sent to the screen (lib/passport-scotland). */
      passport: rec ? (h && isScottish(h.locality, h.name) ? forScreen(rec.data, SCOTLAND) : rec.data) : null,
      passportDoneOn: rec?.submittedAt
        ? new Date(rec.submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })
        : null,
      existing,
    },
  };
}

/**
 * A TEST tenant's passport (James, 13 Oct 2026, the E2E walk). Every test
 * tenant a tester makes carries the tester's own email, so the newest
 * passport on that email was another test tenant's: Tenant E2E's offer opened
 * as "James (test tenant 2)". On a test listing a passport only counts when
 * it is the file's own tenant contact's, or its name is the person's picked;
 * otherwise there is none and the form asks the questions.
 */
async function testPassportFor(listingId: string, email: string, name: string): Promise<PassportRecord | null> {
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const want = norm(name);
  if (!hasDb() || !emailOk(email) || !want) return null;
  const kitTenants = new Set(
    (await kitPeopleForTestListing(listingId).catch(() => [])).filter((c) => c.kind === "tenant" && norm(c.name) === want).map((c) => c.id)
  );
  const rows = await q<{ token: string; contact_id: string | null; name: string; legal: string | null }>(
    `SELECT token, contact_id, name, data->>'legalName' AS legal FROM os_tenant_passports
      WHERE lower(email) = lower($1) AND contact_id IS DISTINCT FROM 'demo'
      ORDER BY created_at DESC LIMIT 50`,
    [email.trim()]
  ).catch(() => []);
  const hit =
    rows.find((r) => r.contact_id != null && kitTenants.has(r.contact_id)) ??
    rows.find((r) => norm(r.legal) === want || norm(r.name) === want);
  return hit ? await getPassport(hit.token).catch(() => null) : null;
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

export async function saveAgentOffer(me: OsUser, raw: Record<string, unknown>): Promise<{ id: string; copy: string; passport: string; href?: string; links: { name: string; url: string }[] }> {
  if (!hasDb()) throw new OfferRefused("This can't be saved on this environment.");
  const email = str(raw.email, 200).toLowerCase();
  const name = str(raw.name, 120);
  if (!emailOk(email)) throw new OfferRefused("The tenant needs an email address on their record first.");
  if (!name) throw new OfferRefused("Who is the offer for?");
  /* The other adults moving in, each with their own part (lib/offer-people,
     James 14 Oct 2026): filled in by the agent now, or a link for them. */
  /* A Scottish home asks no Right to rent of anyone (James, 15 Oct 2026). */
  const listingRaw = str(raw.listingId, 20);
  const scotHome = isTestId(raw.listingId)
    ? await testListing(listingRaw).then((t) => isScottish(t?.locality, t?.name)).catch(() => false)
    : /^\d+$/.test(listingRaw)
      ? await homeOnMarket(listingRaw).then((h) => isScottish(h?.locality, h?.name)).catch(() => false)
      : false;
  /* Nobody else on the offer may have the lead's email or mobile (lib/offer-people-shape, 30 Oct 2026). */
  const leadMobile = isTestId(raw.listingId) ? "" : ((await passportFor(email).catch(() => null))?.data as { mobile?: string } | undefined)?.mobile ?? "";
  const checked = checkOthers(raw.others, scotHome ? SCOTLAND : {}, { name, email, mobile: leadMobile });
  if (!checked.ok) throw new OfferRefused(checked.error);
  const others = checked.others;
  const keepPeople = async (offerId: string, listingId: string | null, property: string) =>
    (await addOfferPeople({ offerId, listingId, property, leadName: name, others, filledBy: "agent", byName: me.name || me.email }).catch(() => []))
      .filter((m) => !m.filled)
      .map((m) => ({ name: m.name, url: partLink(m.token) }));

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
      by: { email: me.email, name: me.name },
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
    const links = await keepPeople(appId, String(t.listingId), t.name ?? "");
    return { id: appId, copy: "not asked for", passport: "unchanged, this is a test file", href: `/applications?open=${encodeURIComponent(appId)}`, links };
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
  const sent = cleanPassport(raw.passport, before);
  /* Never asked on a Scottish home, so what the passport holds is kept, not blanked. */
  const after = scotHome ? { ...sent, hasBritishPassport: before.hasBritishPassport, shareCode: before.shareCode } : sent;
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
  /* An offer on a Scottish home: the passport carries no nationality from now on (lib/passport-scotland). */
  if (rec && isScottish(home.locality, address)) await markScottishHome(rec.token).catch(() => null);

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
    householdIncome:
      Math.max(
        Math.max(0, Math.round(Number(raw.householdIncome) || 0)),
        incomeOf({ annualIncome: after.annualIncome }) + others.reduce((t, o) => t + (o.mode === "fill" ? incomeOf(o.answers) : 0), 0)
      ) || null,
    others: others.map((o) => ({ name: o.answers.name, part: o.mode === "fill" ? "filled by the agent" : "link sent" })),
    passport: after,
    changes,
    recordedBy: { name: me.name, email: me.email, how },
  };

  /* Their offer already on this home takes this one in (lib/offer-repeat,
     29 Oct 2026): one offer per person per home, whoever keys it in. */
  const prior = await priorOffer(listingId, email, [(after as { mobile?: string }).mobile, (rec?.data as { mobile?: string } | undefined)?.mobile]).catch(() => null);
  const id = prior?.id ?? randomUUID();
  const whenWords = new Date(`${moveIn}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const who = `${movingIn.length ? movingIn.join(" and ") : name}${after.pets ? `, with ${after.petsNote ? after.petsNote.charAt(0).toLowerCase() + after.petsNote.slice(1) : "pets"}` : ""}`;

  /* The tenant's copy, from the agent's own mailbox, when asked for. */
  let copy = "not asked for";
  if (raw.copyToTenant === true) {
    const summary = [
      `<strong>Rent:</strong> ${gbp(amount)} a month`,
      `<strong>Moving in:</strong> ${whenWords}`,
      /* Typed text inside a markup line: escaped here (see escapeHtml). */
      `<strong>Who:</strong> ${escapeHtml(who)}`,
      works.length ? `<strong>Works before moving day:</strong> ${escapeHtml(works.join("; "))}` : "",
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
      prior ? repeatLine(prior) : "",
      [`Offer: ${gbp(amount)} a month (advertised at ${gbp(asking)})`, `Move in: ${whenWords}`, `Moving in: ${who}`, `Working: ${workLine(after)}`, ...workFlags(after)].join("\n"),
      works.length ? `Works before moving day:\n${works.map((w) => `- ${w}`).join("\n")}` : "",
      note ? `For the landlord:\n${note}` : "",
      ...others.map((o) =>
        o.mode === "fill"
          ? `Also moving in: ${o.answers.name}:\n${personLines(o.answers, scotHome ? SCOTLAND : {}).map((l) => `${l.label}: ${l.value}`).join("\n")}`
          : `Also moving in: ${o.answers.name}. Their part is with them to fill in from their own link.`
      ),
      `Open the offer: ${base}/offers/${id}`,
    ];
    try {
      await sendEmail({ to: listingAgent, subject: `${prior ? "Offer again" : "Offer"} from ${name}: ${gbp(amount)} a month on ${address}`, html: proseEmail(body.filter(Boolean).join("\n\n")), replyTo: me.email, audience: "internal" });
      outcome = `recorded, sent to ${listingAgent}`;
    } catch {
      outcome = "recorded, listing agent not told";
    }
  }

  if (prior) await foldRepeat(prior, { name, email, payload, sentTo: listingAgent, outcome: `${outcome}; copy ${copy}; passport ${passportNote}` });
  else
    await q(
      `INSERT INTO os_tenant_viewing_responses (id, email, name, listing_id, address, kind, payload, sent_to, outcome)
       VALUES ($1,$2,$3,$4,$5,'offer',$6::jsonb,$7,$8)`,
      [id, email, name, listingId, address, JSON.stringify(payload), listingAgent, `${outcome}; copy ${copy}; passport ${passportNote}`.slice(0, 300)]
    );
  const links = await keepPeople(id, listingId, address);
  return { id, copy, passport: passportNote, links };
}
