import "server-only";
import { publicError } from "@/lib/public-error";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { findUserById, type OsUser } from "@/lib/users";
import { fetchSigned, pushToRex, store } from "@/lib/signed-documents";
import { addFileDoc } from "@/lib/file-documents";
import { putInstructionInRex } from "@/lib/rex-instruct";
import { isTestFile } from "@/lib/test-guard";
import { q } from "@/lib/db";
import {
  archiveSubmission,
  completeSubmitter,
  createHtmlSubmission,
  docusealConfigured,
  setSubmitterValues,
  signedDocumentUrl,
  submitterState,
} from "@/lib/docuseal";
import { edition, editionFor } from "@/lib/terms/catalogue";
import { agentPhone } from "@/lib/agent-phone";
import { getAppraisal, markTermsSent } from "@/lib/appraisal-store";
import { sendContractPack } from "@/lib/contract-send";
import { cleanSignature, keepAgentSignature, saveSignature, signaturesFor } from "@/lib/terms/signatures";
import { contractFooter, contractHtml, detailField, roleOf } from "@/lib/terms/render-html";
import { fileAnswersRecord } from "@/lib/terms/answers-record";
import { homeRegistration, keepFromSigning } from "@/lib/terms/registration";
import { regForLandlords } from "@/lib/reg-numbers";
import { askedOf, detailText, printedFor } from "@/lib/terms/detail-text";
import { openAccount, sealAccount } from "@/lib/bank-vault";
import { accountNumberOnFile, bankOnFile, keepBank } from "@/lib/landlord-bank";
import { cleanPatch, forForm, readHome, saveHome, type HomeIds } from "@/lib/home-answers";
import { PROPERTY_QUESTIONS, SECRET_KEYS as SECRETS, stepDone, type Answers } from "@/lib/property-questions";
import type { Country, LandlordDetails, TermsDoc, TermsValues } from "@/lib/terms/types";
import {
  byToken,
  getTerms,
  insertTerms,
  markAgentSigned,
  markCancelled,
  markSent,
  markSigned,
  newTermsId,
  newToken,
  saveParties,
  type Party,
  type TermsRow,
} from "@/lib/terms/store";

/**
 * SENDING TERMS OF BUSINESS FROM THE OS (James, 23 Oct 2026).
 *
 * "We're going to need to be able to send out terms of business to people
 * that have already agreed, and that involves speed."
 *
 *   1. The agent sends from the home's Compliance tab: the edition (from the
 *      country), everybody who signs, the service and the fees. The contract
 *      is written as HTML from lib/terms and handed to DocuSeal.
 *   2. The agent signs their part first, there and then (James chose agent
 *      first). Only then does each landlord get their own branded email, from
 *      the agent's mailbox.
 *   3. A landlord opens their link (/sign/<token>), reads the contract written
 *      out, fills in anything we don't have, and signs.
 *   4. When the last one has signed, the signed copy is filed and everybody
 *      gets it.
 *
 * PREVIEW MODE. Without DocuSeal (a laptop, the local preview) the same flow
 * runs with a typed-name stand-in for the signature and nothing filed, so the
 * screens can be walked end to end. It is refused in production: a real
 * landlord only ever signs through DocuSeal, whose audit trail is what makes
 * the signature hold.
 */

export class TermsRefused extends Error {}

const previewAllowed = () => process.env.NODE_ENV !== "production" || process.env.TERMS_PREVIEW === "yes";
export const inPreview = () => !docusealConfigured();

function london(d = new Date()) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || "there";

export interface NewTerms {
  me: OsUser;
  country: Country;
  listingId?: string | null;
  propertyId?: string | null;
  appraisalId?: string | null;
  propertyAddress: string;
  agentLarn?: string | null;
  serviceLevel: string;
  setUpFee: string;
  managementFee: string;
  additionalFees?: string | null;
  people: Array<{ name: string; email: string; phone?: string | null; address?: string | null }>;
  /** Adjust contract: the set out now, which this one replaces once the agent signs it. */
  replaces?: string | null;
  /**
   * Sent from the appraisal's Prepare and Send (11 Nov 2026): when the agent
   * signs, the appraisal's landlord gets the presentation and the contract in
   * one email with a way into their file, as that screen always sent it.
   * Anyone else who signs gets their own link as usual.
   */
  withPack?: boolean;
  /**
   * The November 2026 wording, with the questions before the contract
   * (James, 5 Nov 2026), for whoever has the "Questions before signing" switch
   * on; checked by the route, never taken from the browser alone.
   */
  next?: boolean;
  /**
   * What the agent answered on their screen for the first landlord's part of
   * the contract (licensing, the PRS rental property number). Put in for the
   * landlord to check, as their registration is. Never anything only the
   * landlord may give (bank details, no gas, their own residence).
   */
  prefill?: Partial<Pick<LandlordDetails, "rentalPropertyNumber">>;
  /**
   * Subjects the agent sent to the landlord to check anyway (James, 5 Nov 2026: "send with
   * question anyway"), with what the OS pulled through for them, shown filled in for the
   * landlord to confirm or change. The Gas screen always goes this way.
   */
  askAgain?: { steps: string[]; answers: Answers; hints?: Record<string, string> } | null;
}

const ASK_AGAIN = "terms-ask-again";
/* The answers that are a landlord's declaration on the contract: never filled in for them by anyone. */
const DECLARED = new Set(["gas-supply"]);
/* What the file may hint at, beside the question, for them to answer themselves. */
const HINTABLE = new Set(["gas-supply", "licensing"]);
const STEP_IDS = new Set(PROPERTY_QUESTIONS.map((s) => s.id));

/** What a contract asks the landlord to check again, as the agent sent it. */
async function askAgainFor(termsId: string): Promise<{ steps: string[]; answers: Answers; hints: Record<string, string>; gasAnswered: boolean }> {
  const r = await q<{ payload: { steps?: string[]; answers?: Answers; hints?: Record<string, string>; done?: string[] } | null }>(`SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`, [ASK_AGAIN, termsId]).catch(() => []);
  /* A subject a landlord on this contract has been through is not asked again. */
  const done = new Set(r[0]?.payload?.done ?? []);
  return {
    steps: (r[0]?.payload?.steps ?? []).filter((s) => !done.has(s)),
    answers: r[0]?.payload?.answers ?? {},
    hints: r[0]?.payload?.hints ?? {},
    gasAnswered: done.has("gas"),
  };
}

/** A landlord has been through subjects they were sent to check: off the list for everyone on the contract. */
async function markChecked(termsId: string, steps: string[]): Promise<void> {
  const ok = steps.filter((s) => STEP_IDS.has(s));
  if (!ok.length) return;
  await q(
    `UPDATE os_case_state SET payload = jsonb_set(payload, '{done}', COALESCE(payload->'done', '[]'::jsonb) || $3::jsonb), updated_at = NOW()
      WHERE kind = $1 AND record_id = $2`,
    [ASK_AGAIN, termsId, JSON.stringify(ok)]
  ).catch(() => null);
}

/** The home a contract is about, as lib/home-answers keys it. */
const homeOf = (t: { appraisalId?: string | null; propertyId?: string | null; listingId?: string | null }): HomeIds => ({
  appraisalId: t.appraisalId ?? null,
  propertyId: t.propertyId ?? null,
  listingId: t.listingId ?? null,
});

/** The details a contract takes from the answers about the home: no gas at the property, from the landlord's Gas screen. */
function fromAnswers(doc: TermsDoc, answers: Answers): Partial<LandlordDetails> {
  const out: Partial<LandlordDetails> = {};
  for (const f of doc.details) {
    if (!f.fromAnswer) continue;
    const v = answers[f.fromAnswer.id];
    if (typeof v === "string" && v.trim()) out[f.key] = f.fromAnswer.yes.includes(v) ? "yes" : "no";
  }
  return out;
}

/** Make the contract and the agent's signing link. Nobody is emailed yet. */
export async function createTerms(n: NewTerms): Promise<{ terms: TermsRow; agentEmbedSrc: string }> {
  const doc = editionFor(n.country, Boolean(n.next));
  if (!doc) throw new TermsRefused("There are no terms for that country yet.");
  const people = n.people
    .map((p) => ({ name: p.name.trim(), email: p.email.trim(), phone: (p.phone ?? "").trim(), address: (p.address ?? "").trim() }))
    .filter((p) => p.name || p.email);
  if (!people.length) throw new TermsRefused("Add the person who signs.");
  for (const p of people) {
    if (!p.name) throw new TermsRefused("Everybody who signs needs a name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new TermsRefused(`${p.name} needs an email address, so their link can reach them.`);
  }
  if (new Set(people.map((p) => p.email.toLowerCase())).size !== people.length) throw new TermsRefused("Two people have the same email address. Each person signs from their own.");
  if (!n.propertyAddress.trim()) throw new TermsRefused("The terms need the property's address.");
  if (!n.serviceLevel.trim() || !n.setUpFee.trim() || !n.managementFee.trim()) throw new TermsRefused("Fill in the service and both fees before it goes.");
  if (!docusealConfigured() && !previewAllowed()) throw new TermsRefused("DocuSeal isn't connected, so terms can't be signed here.");
  if (n.replaces) {
    const old = await getTerms(n.replaces);
    if (!old || old.status === "cancelled") throw new TermsRefused("The contract you're adjusting has already been withdrawn. Send a fresh one instead.");
    if (old.status === "signed") throw new TermsRefused("Those terms are already signed, so there's nothing to adjust.");
    if (old.agentId !== n.me.id && n.me.role !== "owner" && n.me.role !== "super_admin") throw new TermsRefused("Only the agent who sent these can adjust them.");
  }

  const values: TermsValues = {
    agentName: n.me.name || n.me.email,
    agentLarn: (n.agentLarn ?? "").trim() || "Not recorded",
    propertyAddress: n.propertyAddress.trim(),
    serviceLevel: n.serviceLevel.trim(),
    setUpFee: n.setUpFee.trim(),
    managementFee: n.managementFee.trim(),
    additionalFees: (n.additionalFees ?? "").trim() || "None",
    dateIssued: london(),
  };
  const id = newTermsId();
  /* Each landlord's registration from the home's file, theirs to check when
     they sign (Lianna Denholm, 4 Nov 2026: the boxes always opened blank). Only where this edition asks for it; a file that
     won't read sends the terms without it, as before. */
  const regs = doc.details.some((f) => f.key === "registrationNumber")
    ? await homeRegistration({ propertyId: n.propertyId, listingId: n.listingId, appraisalId: n.appraisalId })
        .then((r) => regForLandlords(r, people.map((p) => p.name)))
        .catch(() => people.map(() => null))
    : people.map(() => null);
  /* The first landlord's part that is already known: what the agent answered (licensing, the
     PRS rental property number) and, from the landlord's own Gas screen if they have been through
     it before, no gas at the property. Theirs to check when they sign. */
  const known: Partial<LandlordDetails> = {};
  const knownKeys: Array<keyof LandlordDetails> = [];
  if (doc.asksFirst) {
    /* Never the declarations (no gas, non-UK resident, licensing): those are the landlord's own,
       answered on this contract (James, 5 Nov 2026), so nothing from the file or the agent goes in. */
    for (const k of ["rentalPropertyNumber"] as const) {
      const v = String(n.prefill?.[k] ?? "").trim().slice(0, 60);
      if (!v || !doc.details.some((f) => f.key === k && !f.landlordOnly)) continue;
      known[k] = v;
      knownKeys.push(k);
    }
  }
  const parties: Party[] = people.map((p, i) => ({
    key: `l${i + 1}`,
    name: p.name,
    email: p.email,
    phone: p.phone,
    token: newToken(),
    details: {
      name: p.name,
      email: p.email,
      phone: p.phone,
      ...(p.address ? { address: p.address } : {}),
      ...(regs[i] ? { registrationNumber: regs[i]!.number, ...(regs[i]!.expiry ? { registrationExpiry: regs[i]!.expiry } : {}) } : {}),
      ...(i === 0 ? known : {}),
    },
    ...(regs[i] || (i === 0 && knownKeys.length)
      ? { fromFile: [...(regs[i] ? ["registrationNumber" as const, ...(regs[i]!.expiry ? ["registrationExpiry" as const] : [])] : []), ...(i === 0 ? knownKeys : [])] }
      : {}),
    submitterId: null,
    embedSrc: null,
    status: "waiting",
    emailedAt: null,
    emailError: null,
    openedAt: null,
    signedAt: null,
  }));

  let submissionId: number | null = null;
  let agentSubmitterId: number | null = null;
  let agentEmbedSrc = `preview:${id}:agent`;
  if (docusealConfigured()) {
    const made = await createHtmlSubmission({
      name: `${doc.title} - ${doc.subtitle} - ${values.propertyAddress}`,
      html: contractHtml(doc, values, parties.length),
      footer: contractFooter(doc),
      externalId: id,
      signers: [
        { role: "Agent", name: values.agentName, email: n.me.email, order: 0, values: { "Agent Date": ukShort() } },
        ...parties.map((p, i) => ({ role: roleOf(i), name: p.name, email: p.email, order: 1, values: detailValues(doc, i, p.details) })),
      ],
    });
    submissionId = made.submissionId;
    const agent = made.submitters.find((s) => s.role === "Agent");
    agentSubmitterId = agent?.id ?? null;
    agentEmbedSrc = agent?.embedSrc ?? "";
    parties.forEach((p, i) => {
      const s = made.submitters.find((x) => x.role === roleOf(i));
      p.submitterId = s?.id ?? null;
      p.embedSrc = s?.embedSrc ?? null;
    });
  } else {
    parties.forEach((p) => (p.embedSrc = `preview:${id}:${p.key}`));
  }

  await insertTerms({
    id,
    version: doc.id,
    listingId: n.listingId ?? null,
    propertyId: n.propertyId ?? null,
    appraisalId: n.appraisalId ?? null,
    propertyAddress: values.propertyAddress,
    values,
    parties,
    agentId: n.me.id,
    agentName: values.agentName,
    agentEmail: n.me.email,
    submissionId,
    agentSubmitterId,
    agentEmbedSrc,
    status: "agent",
    replaces: n.replaces ?? null,
    withPack: Boolean(n.withPack && n.appraisalId),
  });
  /* The subjects to check again, kept beside the contract: codes are never among them (they are not pulled through). */
  if (doc.asksFirst && n.askAgain) {
    const steps = n.askAgain.steps.filter((s) => STEP_IDS.has(s));
    const answers = cleanPatch(n.askAgain.answers, "landlord");
    /* Codes are never sent back, and a declaration is never filled in for them: only hinted at. */
    for (const k of Object.keys(answers)) if (SECRETS.has(k) || DECLARED.has(k)) delete answers[k];
    const hints = Object.fromEntries(
      Object.entries(n.askAgain.hints ?? {})
        .filter(([k, v]) => HINTABLE.has(k) && typeof v === "string" && v.trim())
        .map(([k, v]) => [k, v.trim().slice(0, 200)])
    );
    if (steps.length || Object.keys(answers).length || Object.keys(hints).length) {
      await q(
        `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by) VALUES ($1, $2, $3::jsonb, NOW(), $4)
         ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [ASK_AGAIN, id, JSON.stringify({ steps, answers, hints }), n.me.email]
      ).catch(() => null);
    }
  }
  return { terms: (await getTerms(id))!, agentEmbedSrc };
}

/** The values DocuSeal puts in one landlord's read-only boxes. */
function detailValues(doc: TermsDoc, i: number, d: Partial<LandlordDetails>): Record<string, string> {
  const out: Record<string, string> = {};
  /* Only what the contract prints for this landlord: an edition may ask for more than it
     carries, a first-only box (the bank account, the declarations) is Landlord 1's alone, and
     DocuSeal has no field to put the rest in. The account number is opened here, for the
     contract, and nowhere else. */
  const printed = new Set(printedFor(doc, i));
  for (const f of doc.details) {
    if (!printed.has(f.key)) continue;
    const raw = (d[f.key] ?? "").toString().trim();
    const v = f.key === "accountNumber" ? openAccount(raw) : raw;
    const shown = f.kind === "date" ? ukDate(v) : detailText(f, v);
    if (shown) out[detailField(i, f.key)] = shown;
  }
  if (d.name) out[detailField(i, "name")] = d.name;
  /* The date beside their signature: set again each time their details are
     saved, which is the moment they open the signing form. */
  out[`${roleOf(i)} Date`] = ukShort();
  return out;
}

/** "23/10/2026", London's day: the dates printed beside the signatures. */
const ukShort = () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/London" });

const ukDate = (isoDay: string) => {
  const t = new Date(`${isoDay}T00:00:00`);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : isoDay;
};

/**
 * The agent has signed: check it with DocuSeal, then email every landlord.
 * Also reached from the webhook, so it is safe to run twice.
 */
export async function agentSigned(id: string, origin: string, me?: OsUser | null): Promise<TermsRow> {
  const t = await getTerms(id);
  if (!t) throw new TermsRefused("Those terms aren't on file.");
  if (t.status === "cancelled") throw new TermsRefused("Those terms were withdrawn.");
  if (t.agentSubmitterId && docusealConfigured()) {
    const s = await submitterState(t.agentSubmitterId);
    if (s.status !== "completed") throw new TermsRefused("Your signature hasn't reached DocuSeal yet. Give it a moment.");
  }
  await markAgentSigned(id);
  /* Claimed before the email, so the screen and the webhook send it once between them. */
  if (t.status === "agent" && (await markSent(id))) {
    const agent = me ?? (await findUserById(t.agentId));
    if (agent) {
      /* From Prepare and Send: the appraisal's landlord gets the one email with the presentation. */
      const packed = t.withPack ? await packForLead(t, agent, origin) : null;
      await emailParties(t, agent, origin, t.parties.filter((p) => p.key !== packed).map((p) => p.key));
    }
    /* The appraisal's Next up, At a glance and stage read this stamp, as they did for the old DocuSeal send. */
    if (t.appraisalId) await markTermsSent(t.appraisalId).catch(() => null);
    /* Adjust contract: the new one is out, so the old one's links stop now. */
    if (t.replaces) await cancelTerms(t.replaces).catch(() => null);
  }
  return (await getTerms(id))!;
}

/**
 * The presentation and the contract in one email, to the appraisal's own
 * landlord (lib/contract-send: the email Prepare and Send always sent). Their
 * file opens on the presentation, and Sign there opens these terms
 * (lib/landlord-home-view ownTermsLink). Returns that person's key, or null
 * when there is no pack to send (no appraisal, no presentation built, they are
 * not one of the signers, or the email did not go): they then get their own
 * link like everyone else, so nobody is ever left without a way to sign.
 */
async function packForLead(t: TermsRow, agent: OsUser, origin: string): Promise<string | null> {
  if (!t.appraisalId) return null;
  try {
    const ma = await getAppraisal(t.appraisalId);
    const to = (ma?.landlordEmail ?? "").trim().toLowerCase();
    const lead = to ? t.parties.find((p) => p.email.trim().toLowerCase() === to && p.status !== "signed") : null;
    if (!ma || !lead) return null;
    await sendContractPack({ ma, me: agent, origin });
    lead.emailedAt = new Date().toISOString();
    lead.emailError = null;
    if (lead.status === "waiting") lead.status = "emailed";
    return lead.key;
  } catch (e) {
    console.error("[terms] pack not sent, their own link goes instead", t.id, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Email the given people their link. Records each outcome on the person. */
export async function emailParties(t: TermsRow, agent: OsUser, origin: string, keys: string[]): Promise<Party[]> {
  const parties = [...t.parties];
  for (const p of parties) {
    if (!keys.includes(p.key) || p.status === "signed") continue;
    try {
      const { subject, html } = renderTleEmail("landlord-terms-request", {
        firstName: firstOf(p.name),
        address: t.propertyAddress,
        agentFirst: firstOf(t.agentName),
        link: `${origin}/sign/${p.token}`,
      });
      const sent = await sendAsAgent({ me: agent, to: p.email, toName: p.name, subject, html });
      if (sent.sent) {
        p.emailedAt = new Date().toISOString();
        p.emailError = null;
        if (p.status === "waiting") p.status = "emailed";
      } else {
        p.emailError = sent.detail;
      }
    } catch (e) {
      p.emailError = publicError(e, "The email didn't go.");
    }
  }
  await saveParties(t.id, parties);
  return parties;
}

/** What the landlord's page needs. Marks the link as opened the first time. */
export async function landlordView(token: string) {
  const hit = await byToken(token);
  if (!hit) return null;
  const { terms, party } = hit;
  const doc = edition(terms.version);
  if (!doc) return null;
  if (!party.openedAt && terms.status !== "cancelled") {
    const parties = terms.parties.map((p) => (p.token === token ? { ...p, openedAt: new Date().toISOString(), status: p.status === "signed" ? p.status : ("opened" as const) } : p));
    await saveParties(terms.id, parties).catch(() => null);
  }
  const [phone, sigs] = await Promise.all([agentPhone(terms.agentId).catch(() => ""), signaturesFor(terms.id)]);
  const i = terms.parties.findIndex((p) => p.token === token);
  /* The questions about the home, asked before the contract (November 2026 on). */
  const asks = Boolean(doc.asksFirst);
  const home = asks ? await readHome(homeOf(terms)).catch(() => ({ answers: {} as Answers, who: {} })) : null;
  const bank = asks && i === 0 ? await bankOnFile(party.email).catch(() => null) : null;
  const again = asks ? await askAgainFor(terms.id) : { steps: [] as string[], answers: {} as Answers, hints: {} as Record<string, string>, gasAnswered: false };
  /* Gas is a declaration on this contract: an answer kept from before (another landlord, another
     let) is never shown as if they had given it. Theirs once a landlord on this contract has. */
  const formAnswers = home ? forForm(home.answers) : null;
  if (formAnswers && asks && !again.gasAnswered && !terms.parties.some((p) => p.details?.noGas)) delete formAnswers["gas-supply"];
  return {
    doc,
    termsId: terms.id,
    values: terms.values,
    status: terms.status,
    agent: { name: terms.agentName, email: terms.agentEmail, phone, signedAt: terms.agentSignedAt, signature: sigs.agent?.image ?? null },
    mine: sigs[party.key] ? { signature: sigs[party.key].image, startNow: sigs[party.key].startNow ?? null } : null,
    agentSigned: Boolean(terms.agentSignedAt),
    completedAt: terms.completedAt,
    hasCopy: Boolean(terms.signedR2Key),
    /* fromFile: their registration as the home's file had it, shown in a box for them to check (4 Nov 2026). */
    me: { key: party.key, name: party.name, details: masked(party.details), signedAt: party.signedAt, fromFile: party.signedAt ? [] : party.fromFile ?? [] },
    /* The first landlord's part of the home (the bank account, the declarations), as the others see it on the contract. */
    firstDetails: i > 0 ? masked(firstOnly(doc, terms.parties[0]?.details ?? {})) : null,
    first: i === 0,
    asks,
    answers: formAnswers,
    answeredBy: home ? whoSaid(home.who, terms.agentEmail) : null,
    bankOnFile: bank ? { bankName: bank.bankName, accountName: bank.accountName, sortCode: bank.sortCode, last4: bank.last4 } : null,
    /* Subjects the agent sent them to check, and what the file says for each (James, 5 Nov 2026). */
    askAgain: again.steps,
    pulled: forForm(again.answers),
    /* What the file shows for a declaration, said beside the question; never ticked for them. */
    hints: again.hints,
    people: terms.parties.map((p) => ({ key: p.key, name: p.name, signed: Boolean(p.signedAt), you: p.token === token })),
    preview: inPreview(),
  };
}

/** Their details, saved and put into their boxes. Returns where they sign. */
export async function saveDetails(token: string, details: Partial<LandlordDetails>, opts: { partial?: boolean } = {}): Promise<{ embedSrc: string; details: Partial<LandlordDetails> }> {
  const hit = await byToken(token);
  if (!hit) throw new TermsRefused("This link isn't recognised.");
  const { terms, party } = hit;
  if (terms.status === "cancelled") throw new TermsRefused("These terms were withdrawn. Your agent will send new ones.");
  if (party.signedAt) throw new TermsRefused("You've already signed these.");
  if (!terms.agentSignedAt) throw new TermsRefused("Your agent hasn't finished their part yet.");
  const doc = edition(terms.version)!;
  const i = terms.parties.findIndex((p) => p.token === token);
  /* Only what this landlord is asked: the first landlord gives the home's part (the bank
     account, the declarations), and no gas follows their Gas screen, never a box. A screen of
     the questions before the contract saves only its own boxes (partial); the check before
     signing (the rail) saves them all. */
  const asked = askedOf(doc, i).filter((f) => !opts.partial || f.key in details);
  const clean: Partial<LandlordDetails> = {};
  for (const f of asked) {
    let v = String(details[f.key] ?? "").trim().slice(0, 300);
    if (f.key === "accountNumber") {
      if (v === "on-file") {
        v = await accountNumberOnFile(party.email).catch(() => "");
        if (!v) throw new TermsRefused("We couldn't find that account. Type the details in instead.");
      } else if (v.startsWith("••••") || v === "") {
        /* Shown as its last four: left as it is. */
        v = openAccount(String(party.details.accountNumber ?? ""));
      }
      v = v.replace(/\s/g, "");
      if (v && !/^\d{6,10}$/.test(v)) throw new TermsRefused("That account number doesn't look right. It's usually eight numbers.");
    }
    if (f.kind === "sortcode" && v) {
      const d = v.replace(/\D/g, "");
      if (d.length !== 6) throw new TermsRefused("A sort code is six numbers, like 12-34-56.");
      v = `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4)}`;
    }
    if (f.kind === "yesno" && v && v !== "yes" && v !== "no") v = "";
    if (f.required && !v && f.step !== "you") throw new TermsRefused(`${f.ask ?? f.label} is needed before you sign.`);
    if (f.required && !v) throw new TermsRefused(`${f.label} is needed before you sign.`);
    clean[f.key] = f.key === "accountNumber" ? (v ? sealAccount(v) : "") : v;
  }
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw new TermsRefused("That email address doesn't look right.");
  const merged = { ...party.details, ...clean };
  if (party.submitterId && docusealConfigured()) await setSubmitterValues(party.submitterId, detailValues(doc, i, merged));
  const keptFromFile = (party.fromFile ?? []).filter((k) => !(k in clean));
  const parties = terms.parties.map((p) => (p.token === token ? { ...p, details: merged, name: clean.name || p.name, phone: clean.phone || p.phone, fromFile: opts.partial ? keptFromFile : [] } : p));
  await saveParties(terms.id, parties);
  /* What they gave goes back on file too, not only on this contract (Lianna
     Denholm, 4 Nov 2026): their registration on the home, their home address
     on their own record. Only blanks or their own entry; never REX. */
  await keepFromSigning(terms, party, clean);
  /* Their bank account, kept for their next contract (James, 5 Nov 2026). Sealed. */
  if (i === 0 && merged.accountNumber && merged.sortCode && "accountNumber" in clean) {
    await keepBank({
      email: party.email,
      name: merged.name || party.name,
      bankName: String(merged.bankName ?? ""),
      accountName: String(merged.bankAccountName ?? ""),
      sortCode: String(merged.sortCode ?? ""),
      accountNumber: openAccount(String(merged.accountNumber)),
      termsId: terms.id,
    }).catch(() => null);
  }
  return { embedSrc: party.embedSrc ?? `preview:${terms.id}:${party.key}`, details: masked(merged) };
}

/**
 * Answers about the home from a landlord's own link, before the contract
 * (James, 5 Nov 2026). Kept against the home (lib/home-answers), so the next
 * contract and the agent's screens have them too. Their Gas screen answer is
 * also the first landlord's "no gas at the property" on the contract, put in
 * the box straight away unless the first landlord has already signed.
 */
export async function saveAnswersByToken(token: string, raw: unknown, checked: string[] = []): Promise<{ answers: Answers; answeredBy: Record<string, string> }> {
  const hit = await byToken(token);
  if (!hit) throw new TermsRefused("This link isn't recognised.");
  const { terms, party } = hit;
  if (terms.status === "cancelled") throw new TermsRefused("These terms were withdrawn. Your agent will send new ones.");
  const doc = edition(terms.version);
  if (!doc?.asksFirst) throw new TermsRefused("There's nothing to answer on these terms.");
  const patch = cleanPatch(raw, "landlord");
  const saved = await saveHome(homeOf(terms), patch, `landlord:${party.email}`);
  if (checked.length) await markChecked(terms.id, checked);
  /* Only what they answered just now: an answer kept from before is never their declaration. */
  const derived = fromAnswers(doc, patch);
  const lead = terms.parties[0];
  if (lead && !lead.signedAt && Object.keys(derived).some((k) => lead.details[k as keyof LandlordDetails] !== derived[k as keyof LandlordDetails])) {
    const fresh = (await getTerms(terms.id)) ?? terms;
    const first = fresh.parties[0];
    const details = { ...first.details, ...derived };
    if (first.submitterId && docusealConfigured()) await setSubmitterValues(first.submitterId, detailValues(doc, 0, details)).catch(() => null);
    await saveParties(fresh.id, fresh.parties.map((p, k) => (k === 0 ? { ...p, details } : p)));
  }
  return { answers: forForm(saved.answers), answeredBy: whoSaid(saved.who, terms.agentEmail) };
}

/** What a landlord still has to answer before they can sign: the screens of questions, and their own details. */
export function stillToAnswer(doc: TermsDoc, i: number, details: Partial<LandlordDetails>, answers: Answers): { screens: string[]; details: Array<keyof LandlordDetails> } {
  if (!doc.asksFirst) return { screens: [], details: [] };
  const screens = PROPERTY_QUESTIONS.filter((st) => !stepDone(st, answers)).map((st) => st.id);
  const own = askedOf(doc, i).filter((f) => f.required && !String(details[f.key] ?? "").trim()).map((f) => f.key);
  const derived = i === 0 ? doc.details.filter((f) => f.fromAnswer && f.required && !String(details[f.key] ?? "").trim()).map((f) => f.key) : [];
  return { screens, details: [...own, ...derived] };
}

/** The account number as a browser may see it: the last four. */
function masked(d: Partial<LandlordDetails>): Partial<LandlordDetails> {
  const raw = String(d.accountNumber ?? "");
  if (!raw) return d;
  const plain = openAccount(raw);
  return { ...d, accountNumber: plain ? `•••• ${plain.slice(-4)}` : "" };
}

/** Only the first landlord's part of the home: what the others see of it on the contract. */
function firstOnly(doc: TermsDoc, d: Partial<LandlordDetails>): Partial<LandlordDetails> {
  const keys = new Set(doc.details.filter((f) => f.firstOnly).map((f) => f.key));
  return Object.fromEntries(Object.entries(d).filter(([k]) => keys.has(k as keyof LandlordDetails))) as Partial<LandlordDetails>;
}

/** Who gave each answer, as a landlord's page says it: "agent", "landlord" or "" (not said). */
function whoSaid(who: Record<string, { by: string }>, agentEmail: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, w] of Object.entries(who)) out[k] = w.by.startsWith("landlord:") ? "landlord" : w.by.toLowerCase() === agentEmail.toLowerCase() || w.by.startsWith("agent:") ? "agent" : "";
  return out;
}

/** A landlord has signed. When they are the last, the contract completes. */
export async function landlordSigned(token: string, origin: string, typedName?: string): Promise<{ done: boolean }> {
  const hit = await byToken(token);
  if (!hit) throw new TermsRefused("This link isn't recognised.");
  const { terms, party } = hit;
  if (!party.signedAt) {
    if (party.submitterId && docusealConfigured()) {
      const s = await submitterState(party.submitterId);
      if (s.status !== "completed") throw new TermsRefused("Your signature hasn't reached us yet. Give it a moment.");
    } else if (!inPreview() || !(typedName ?? "").trim()) {
      throw new TermsRefused("Type your name to sign.");
    }
    const parties = terms.parties.map((p) => (p.token === token ? { ...p, signedAt: new Date().toISOString(), status: "signed" as const } : p));
    await saveParties(terms.id, parties);
  }
  return { done: await completeIfAll(terms.id, origin) };
}

/** Everybody has signed: file the copy and send it round. Safe to call twice. */
export async function completeIfAll(id: string, origin: string): Promise<boolean> {
  const t = await getTerms(id);
  if (!t || t.status === "cancelled") return false;
  if (t.completedAt) return true;
  if (!t.agentSignedAt || t.parties.some((p) => !p.signedAt)) return false;
  let key: string | null = null;
  let filed: { submitterId: number; size: number } | null = null;
  let contractBytes: Uint8Array | null = null;
  if (t.submissionId && docusealConfigured()) {
    const url = await signedDocumentUrl(t.submissionId);
    if (!url) throw new TermsRefused("DocuSeal hasn't finished the signed copy yet.");
    const bytes = await fetchSigned(url);
    contractBytes = bytes;
    const doc = edition(t.version);
    const last = t.parties[t.parties.length - 1];
    const stored = await store({
      submitterId: last.submitterId ?? t.agentSubmitterId ?? 0,
      submissionId: t.submissionId,
      appraisalId: t.appraisalId || `terms:${t.id}`,
      templateName: doc ? `${doc.title} - ${doc.subtitle}` : "Terms of Business",
      signerName: t.parties.map((p) => p.name).join(", "),
      signerEmail: t.parties.map((p) => p.email).join(", "),
      completedAt: new Date().toISOString(),
      bytes,
      fileName: `Terms of Business - ${t.propertyAddress}.pdf`,
    });
    key = stored.r2Key;
    filed = { submitterId: last.submitterId ?? t.agentSubmitterId ?? 0, size: bytes.length };
  }
  const first = await markSigned(id, key);
  /* What the DocuSeal webhook always did with a signed copy (Dover Close, 24 Oct
     2026: signed on our page, and the copy never reached the home's Documents). */
  if (key && filed) await afterSigned(t, key, filed).catch(() => null);
  /* What they answered, when, their signatures and the contract, as one document on the home's file (James, 5 Nov 2026). */
  await fileAnswersRecord((await getTerms(id).catch(() => null)) ?? t, contractBytes);
  if (first) {
    const agent = await findUserById(t.agentId);
    if (agent) {
      for (const p of t.parties) {
        try {
          const { subject, html } = renderTleEmail("landlord-terms-signed", {
            firstName: firstOf(p.name),
            address: t.propertyAddress,
            agentFirst: firstOf(t.agentName),
            link: `${origin}/sign/${p.token}`,
          });
          await sendAsAgent({ me: agent, to: p.email, toName: p.name, subject, html });
        } catch {
          /* The copy is filed and on their page; an email that didn't go is not a reason to fail the signing. */
        }
      }
    }
  }
  return true;
}

/**
 * The signed copy goes where a signed contract always went: onto the home's
 * Documents as its Terms of Business, a copy into REX, and the landlord and
 * the home into REX (lib/rex-instruct, which leaves test files alone). Each
 * step on its own: one that fails costs only itself.
 */
export async function afterSigned(t: TermsRow, key: string, filed: { submitterId: number; size: number }): Promise<void> {
  const ma = t.appraisalId ? await getAppraisal(t.appraisalId).catch(() => null) : null;
  const from = t.appraisalId ? { kind: "appraisal" as const, id: t.appraisalId } : t.listingId ? { kind: "listing" as const, id: t.listingId } : null;
  if (from) {
    const had = await q<{ id: string }>(`SELECT id FROM os_file_documents WHERE r2_key = $1 AND removed_at IS NULL`, [key]).catch(() => []);
    if (!had.length) {
      await addFileDoc({
        home: { address: t.propertyAddress, propertyId: t.propertyId ?? ma?.rexPropertyId ?? null },
        from,
        type: "terms_of_business",
        name: "Terms of Business (signed)",
        fileName: `Terms of Business - ${t.propertyAddress}.pdf`,
        r2Key: key,
        mime: "application/pdf",
        sizeBytes: filed.size,
        by: { id: t.agentId, name: t.agentName },
        isTest: await isTestFile({ appraisalId: t.appraisalId, address: t.propertyAddress }).catch(() => false),
      }).catch(() => null);
    }
  }
  if (filed.submitterId) await pushToRex(filed.submitterId).catch(() => null);
  if (ma) await putInstructionInRex(ma.id).catch(() => null);
}

/** Withdraw: the links stop working, and a new set can be sent. */
export async function cancelTerms(id: string): Promise<void> {
  const t = await getTerms(id);
  if (!t) throw new TermsRefused("Those terms aren't on file.");
  if (t.status === "signed") throw new TermsRefused("Signed terms can't be withdrawn.");
  if (t.submissionId && docusealConfigured()) await archiveSubmission(t.submissionId).catch(() => null);
  await markCancelled(id);
}

/** DocuSeal said someone finished: catch anything our own calls missed. */
export async function fromWebhook(externalId: string, role: string, origin: string): Promise<void> {
  const t = await getTerms(externalId);
  if (!t || t.status === "cancelled") return;
  if (role === "Agent") {
    await agentSigned(t.id, origin).catch(() => null);
    return;
  }
  const i = t.parties.findIndex((_, k) => roleOf(k) === role);
  if (i < 0) return;
  if (!t.parties[i].signedAt) {
    const parties = t.parties.map((p, k) => (k === i ? { ...p, signedAt: new Date().toISOString(), status: "signed" as const } : p));
    await saveParties(t.id, parties);
  }
  await completeIfAll(t.id, origin);
}

/* ── Signing on our own page (James, 24 Oct 2026) ───────────────────────────
   The person signs on the OS's page; the image and what they answered go to
   DocuSeal by API and DocuSeal completes them, so the sealed copy and its
   certificate are DocuSeal's as before. Without DocuSeal (a laptop) the same
   path runs in preview and nothing is sealed. */

export interface SignMeta {
  ip: string | null;
  userAgent: string | null;
}

/** The agent signs their part on the send screen, then every landlord is emailed. */
export async function agentSign(id: string, me: OsUser, image: unknown, origin: string, meta: SignMeta, keep: boolean): Promise<TermsRow> {
  const t = await getTerms(id);
  if (!t) throw new TermsRefused("Those terms aren't on file.");
  if (t.status === "cancelled") throw new TermsRefused("Those terms were withdrawn.");
  if (t.agentId !== me.id) throw new TermsRefused("Only the agent who made these can sign them.");
  const sig = cleanSignature(image);
  if (!sig) throw new TermsRefused("Sign in the box first.");
  if (!t.agentSignedAt) {
    if (t.agentSubmitterId && docusealConfigured()) {
      await completeSubmitter(t.agentSubmitterId, { "Agent Signature": sig, "Agent Date": ukShort() });
    } else if (!inPreview()) {
      throw new TermsRefused("DocuSeal isn't connected, so terms can't be signed here.");
    }
    await saveSignature(id, "agent", { image: sig, at: new Date().toISOString(), ip: meta.ip, userAgent: meta.userAgent }, me.email);
  }
  if (keep) await keepAgentSignature(me.id, sig).catch(() => null);
  return agentSigned(id, origin, me);
}

/** A landlord signs on their page: their details, their choice about starting, their signature. */
export async function landlordSign(token: string, image: unknown, startNow: boolean | null, origin: string, meta: SignMeta): Promise<{ done: boolean }> {
  const hit = await byToken(token);
  if (!hit) throw new TermsRefused("This link isn't recognised.");
  const { terms, party } = hit;
  if (terms.status === "cancelled") throw new TermsRefused("These terms were withdrawn. Your agent will send new ones.");
  if (!terms.agentSignedAt) throw new TermsRefused("Your agent hasn't finished their part yet.");
  if (party.signedAt) return { done: await completeIfAll(terms.id, origin) };
  const sig = cleanSignature(image);
  if (!sig) throw new TermsRefused("Sign in the box first.");
  const doc = edition(terms.version);
  if (!doc) throw new TermsRefused("These terms can't be signed just now.");
  const i0 = terms.parties.findIndex((p) => p.token === token);
  if (doc.asksFirst) {
    /* The questions come first (James, 5 Nov 2026): nobody signs past one still to answer. */
    const home = await readHome(homeOf(terms));
    const left = stillToAnswer(doc, i0, party.details, home.answers);
    if (left.screens.length || left.details.length) throw new TermsRefused("A few details are still needed before you sign.");
  } else {
    for (const f of askedOf(doc, i0)) {
      if (f.required && !String(party.details[f.key] ?? "").trim()) throw new TermsRefused(`${f.label} is needed before you sign.`);
    }
  }
  const hasWaiver = doc.sections.some((s) => s.blocks.some((b) => b.kind === "waiver"));
  if (hasWaiver && startNow == null) throw new TermsRefused("Choose when we start before you sign.");
  const i = terms.parties.findIndex((p) => p.token === token);
  const role = roleOf(i);
  if (party.submitterId && docusealConfigured()) {
    await completeSubmitter(party.submitterId, {
      ...detailValues(doc, i, party.details),
      [`${role} Signature`]: sig,
      ...(hasWaiver ? { [`${role} Start Now`]: Boolean(startNow) } : {}),
    });
  } else if (!inPreview()) {
    throw new TermsRefused("Signing isn't available just now. Try again in a moment.");
  }
  await saveSignature(terms.id, party.key, { image: sig, at: new Date().toISOString(), ip: meta.ip, userAgent: meta.userAgent, startNow }, party.email);
  return landlordSigned(token, origin, party.name);
}
