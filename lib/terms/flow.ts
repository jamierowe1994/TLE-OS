import "server-only";
import { publicError } from "@/lib/public-error";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { findUserById, type OsUser } from "@/lib/users";
import { fetchSigned, store } from "@/lib/signed-documents";
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
import { markTermsSent } from "@/lib/appraisal-store";
import { cleanSignature, keepAgentSignature, saveSignature, signaturesFor } from "@/lib/terms/signatures";
import { contractFooter, contractHtml, detailField, roleOf } from "@/lib/terms/render-html";
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
}

/** Make the contract and the agent's signing link. Nobody is emailed yet. */
export async function createTerms(n: NewTerms): Promise<{ terms: TermsRow; agentEmbedSrc: string }> {
  const doc = editionFor(n.country);
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
  const parties: Party[] = people.map((p, i) => ({
    key: `l${i + 1}`,
    name: p.name,
    email: p.email,
    phone: p.phone,
    token: newToken(),
    details: { name: p.name, email: p.email, phone: p.phone, ...(p.address ? { address: p.address } : {}) },
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
  });
  return { terms: (await getTerms(id))!, agentEmbedSrc };
}

/** The values DocuSeal puts in one landlord's read-only boxes. */
function detailValues(doc: TermsDoc, i: number, d: Partial<LandlordDetails>): Record<string, string> {
  const out: Record<string, string> = {};
  /* Only what the contract prints: an edition may ask for more than it carries,
     and DocuSeal has no field to put the rest in. */
  const printed = new Set(doc.sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === "landlords" ? b.fields : []))));
  for (const f of doc.details) {
    if (!printed.has(f.key)) continue;
    const v = (d[f.key] ?? "").toString().trim();
    if (v) out[detailField(i, f.key)] = f.kind === "date" ? ukDate(v) : v;
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
  if (t.status === "agent") {
    const agent = me ?? (await findUserById(t.agentId));
    if (agent) await emailParties(t, agent, origin, t.parties.map((p) => p.key));
    await markSent(id);
    /* The appraisal's Next up, At a glance and stage read this stamp, as they did for the old DocuSeal send. */
    if (t.appraisalId) await markTermsSent(t.appraisalId).catch(() => null);
    /* Adjust contract: the new one is out, so the old one's links stop now. */
    if (t.replaces) await cancelTerms(t.replaces).catch(() => null);
  }
  return (await getTerms(id))!;
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
    me: { key: party.key, name: party.name, details: party.details, signedAt: party.signedAt },
    people: terms.parties.map((p) => ({ key: p.key, name: p.name, signed: Boolean(p.signedAt), you: p.token === token })),
    preview: inPreview(),
  };
}

/** Their details, saved and put into their boxes. Returns where they sign. */
export async function saveDetails(token: string, details: Partial<LandlordDetails>): Promise<{ embedSrc: string }> {
  const hit = await byToken(token);
  if (!hit) throw new TermsRefused("This link isn't recognised.");
  const { terms, party } = hit;
  if (terms.status === "cancelled") throw new TermsRefused("These terms were withdrawn. Your agent will send new ones.");
  if (party.signedAt) throw new TermsRefused("You've already signed these.");
  if (!terms.agentSignedAt) throw new TermsRefused("Your agent hasn't finished their part yet.");
  const doc = edition(terms.version)!;
  const clean: Partial<LandlordDetails> = {};
  for (const f of doc.details) {
    const v = String(details[f.key] ?? "").trim().slice(0, 300);
    if (f.required && !v) throw new TermsRefused(`${f.label} is needed before you sign.`);
    clean[f.key] = v;
  }
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) throw new TermsRefused("That email address doesn't look right.");
  const i = terms.parties.findIndex((p) => p.token === token);
  if (party.submitterId && docusealConfigured()) await setSubmitterValues(party.submitterId, detailValues(doc, i, clean));
  const parties = terms.parties.map((p) => (p.token === token ? { ...p, details: { ...p.details, ...clean }, name: clean.name || p.name, phone: clean.phone || p.phone } : p));
  await saveParties(terms.id, parties);
  return { embedSrc: party.embedSrc ?? `preview:${terms.id}:${party.key}` };
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
  if (t.submissionId && docusealConfigured()) {
    const url = await signedDocumentUrl(t.submissionId);
    if (!url) throw new TermsRefused("DocuSeal hasn't finished the signed copy yet.");
    const bytes = await fetchSigned(url);
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
  }
  const first = await markSigned(id, key);
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
  for (const f of doc.details) {
    if (f.required && !String(party.details[f.key] ?? "").trim()) throw new TermsRefused(`${f.label} is needed before you sign.`);
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
