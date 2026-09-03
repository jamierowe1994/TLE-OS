import "server-only";
import { cookies } from "next/headers";
import { hasDb, q } from "@/lib/db";
import { LANDLORD_COOKIE, uid, verifyPortalToken } from "@/lib/auth";
import { managedBookFor } from "@/lib/managed-book-cache";
import { normaliseEmail } from "@/lib/users";
import { listAppraisals } from "@/lib/appraisal-store";
import { presentationsFor, readPresentation, type PresentationRow } from "@/lib/present-store";
import { signedFor } from "@/lib/signed-documents";
import { effectiveStage, SERVICE_LEVELS, type MarketAppraisal, type MaStage } from "@/lib/market-appraisal";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * Who a landlord is, and what is theirs.
 *
 * ── Identity comes from two records, not from a form ─────────────────────
 *
 * A landlord is one of two things to us, and often both in turn:
 *
 *   1. The OWNER CONTACT on a managed listing in REX - read for the Portfolio
 *      screen (lib/managed-book.ts), with the contact's email inline.
 *   2. The PERSON on a market appraisal in the OS - the lead's contact
 *      record, whose email the appraisal derives on read.
 *
 * The second is the one James cares about most (2 Sep): the landlord who has
 * had the visit, been sent the figure, and comes here to read the
 * presentation and the terms. They are not in REX's managed book yet and
 * will not be until the property lets. So the match runs over both, and the
 * home page tells the story from wherever the person is on it.
 *
 * REX's Contacts service refuses every email field as a search criterion
 * (measured 2 Sep 2026), so a search was never an option; both sources are
 * books we already hold.
 *
 * ── The account row is a record of a visit, not a credential ─────────────
 *
 * os_portal_accounts holds the email, the name we had, the REX contact ids
 * the email matched, and when they first came in. No password: the link is
 * the sign-in.
 */

export interface LandlordMatch {
  email: string;
  name: string;
  contactIds: string[];
  properties: ManagedProperty[];
  appraisals: MarketAppraisal[];
}

export interface LandlordAccount {
  id: string;
  email: string;
  name: string;
  contactIds: string[];
  activatedAt: string | null;
}

type Row = {
  id: string;
  email: string;
  name: string;
  rex_contact_id: string | null;
  activated_at: Date | string | null;
  profile: { contactIds?: string[] } | null;
};

const shape = (r: Row): LandlordAccount => ({
  id: r.id,
  email: r.email,
  name: r.name,
  contactIds: [
    ...new Set([...(r.profile?.contactIds ?? []), ...(r.rex_contact_id ? [r.rex_contact_id] : [])]),
  ],
  activatedAt: r.activated_at ? new Date(r.activated_at).toISOString() : null,
});

async function managedFor(email: string, contactIds: string[] = []): Promise<ManagedProperty[]> {
  const { book } = await managedBookFor(null);
  const ids = new Set(contactIds);
  return book.properties.filter(
    (p) =>
      p.landlord &&
      (ids.has(p.landlord.contactId) || (p.landlord.email && normaliseEmail(p.landlord.email) === email))
  );
}

async function appraisalsFor(email: string): Promise<MarketAppraisal[]> {
  const all = await listAppraisals().catch(() => [] as MarketAppraisal[]);
  return all.filter((a) => a.landlordEmail && normaliseEmail(a.landlordEmail) === email);
}

/** Everything we hold for this email: managed properties and appraisals. */
export async function landlordByEmail(rawEmail: string): Promise<LandlordMatch | null> {
  const email = normaliseEmail(rawEmail);
  if (!email.includes("@")) return null;
  const [properties, appraisals] = await Promise.all([managedFor(email), appraisalsFor(email)]);
  if (!properties.length && !appraisals.length) return null;
  const contactIds = [...new Set(properties.map((p) => p.landlord!.contactId))];
  const name = properties[0]?.landlord?.name || appraisals[0]?.landlord || email;
  return { email, name, contactIds, properties, appraisals };
}

export async function upsertLandlordAccount(m: LandlordMatch): Promise<LandlordAccount> {
  const rows = await q<Row>(
    `INSERT INTO os_portal_accounts (id, kind, email, name, rex_contact_id, profile)
     VALUES ($1, 'landlord', $2, $3, $4, $5)
     ON CONFLICT (email, kind) DO UPDATE
       SET name = EXCLUDED.name,
           rex_contact_id = COALESCE(EXCLUDED.rex_contact_id, os_portal_accounts.rex_contact_id),
           profile = os_portal_accounts.profile || EXCLUDED.profile
     RETURNING id, email, name, rex_contact_id, activated_at, profile`,
    [uid(), m.email, m.name, m.contactIds[0] ?? null, JSON.stringify({ contactIds: m.contactIds })]
  );
  return shape(rows[0]);
}

export async function landlordAccountByEmail(rawEmail: string): Promise<LandlordAccount | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    `SELECT id, email, name, rex_contact_id, activated_at, profile
       FROM os_portal_accounts WHERE kind = 'landlord' AND email = $1`,
    [normaliseEmail(rawEmail)]
  );
  return rows[0] ? shape(rows[0]) : null;
}

export async function landlordAccountById(id: string): Promise<LandlordAccount | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(
    `SELECT id, email, name, rex_contact_id, activated_at, profile
       FROM os_portal_accounts WHERE kind = 'landlord' AND id = $1`,
    [id]
  );
  return rows[0] ? shape(rows[0]) : null;
}

/** First time through the door. Returns true if this visit was the first. */
export async function activateLandlord(id: string): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `UPDATE os_portal_accounts SET activated_at = NOW()
      WHERE kind = 'landlord' AND id = $1 AND activated_at IS NULL RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

/** The signed-in landlord for this request, or null. Server components and routes. */
export async function currentLandlord(): Promise<LandlordAccount | null> {
  const jar = await cookies();
  const id = verifyPortalToken(jar.get(LANDLORD_COOKIE)?.value, "landlord");
  if (!id) return null;
  return landlordAccountById(id);
}

/** Their managed properties, live from the book. */
export async function landlordProperties(a: LandlordAccount): Promise<ManagedProperty[]> {
  return managedFor(normaliseEmail(a.email), a.contactIds);
}

/* ------------------------------------------------------------- journey -- */

/**
 * The landlord's journey with us, in their words.
 *
 * The OS thinks in eight appraisal stages plus a listing plus a managed
 * book. A landlord thinks: we came round, you told me a figure, I read your
 * presentation, I signed, you got it ready, you let it, you look after it.
 * These are those beats, and the appraisal stage is mapped onto them.
 */
export type JourneyBeat = "visit" | "valuation" | "presentation" | "terms" | "ready" | "market" | "let" | "managed";

export const JOURNEY: Array<{ id: JourneyBeat; label: string }> = [
  { id: "visit", label: "The visit" },
  { id: "valuation", label: "Your valuation" },
  { id: "presentation", label: "Your presentation" },
  { id: "terms", label: "Your terms" },
  { id: "ready", label: "Getting it ready" },
  { id: "market", label: "On the market" },
  { id: "let", label: "Let" },
  { id: "managed", label: "Looked after" },
];

export interface SignedTerms {
  submitterId: string;
  name: string;
  signedAt: string | null;
}

export interface AppraisalJourney {
  appraisal: MarketAppraisal;
  stage: MaStage;
  /** Where they are on the beats above. */
  at: JourneyBeat;
  /** The decks minted for this appraisal, newest first. */
  decks: PresentationRow[];
  /** The terms they have signed, if any. */
  signed: SignedTerms[];
  /** "Fully managed", from the Propoly key. */
  serviceLabel: string | null;
}

function beatFor(stage: MaStage, a: MarketAppraisal, signed: SignedTerms[], now: Date): JourneyBeat {
  if (stage === "won") return "market";
  if (stage === "takeon" || stage === "aml") return "ready";
  if (signed.length) return "ready";
  if (a.valuation != null) return a.presentToken ? "terms" : "valuation";
  if (a.appointmentAt && new Date(a.appointmentAt) < now) return "valuation";
  return "visit";
}

export async function landlordJourneys(a: LandlordAccount): Promise<AppraisalJourney[]> {
  const appraisals = await appraisalsFor(normaliseEmail(a.email));
  const now = new Date();
  return Promise.all(
    appraisals.map(async (ap) => {
      const [byRef, byToken, signedRows] = await Promise.all([
        presentationsFor(ap.id),
        ap.presentToken ? readPresentation(ap.presentToken) : Promise.resolve(null),
        signedFor(ap.id),
      ]);
      const decks = [...byRef];
      if (byToken && !decks.some((d) => d.token === byToken.token)) decks.push(byToken);
      decks.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
      const signed: SignedTerms[] = signedRows
        .filter((r) => r.completed_at)
        .map((r) => ({ submitterId: String(r.submitter_id), name: r.template_name, signedAt: r.completed_at }));
      const stage = effectiveStage(ap, now);
      return {
        appraisal: ap,
        stage,
        at: beatFor(stage, ap, signed, now),
        decks,
        signed,
        serviceLabel: SERVICE_LEVELS.find((s) => s.id === ap.serviceLevel)?.label ?? null,
      };
    })
  );
}

/** Does this appraisal belong to the signed-in landlord? Checked before any read or write on it. */
export async function landlordOwnsAppraisal(a: LandlordAccount, appraisalId: string): Promise<boolean> {
  if (!appraisalId) return false;
  const mine = await appraisalsFor(normaliseEmail(a.email));
  return mine.some((x) => x.id === appraisalId);
}

/* ----------------------------------------------------------- documents -- */

export type DocKind = "id" | "ownership" | "gas" | "eicr" | "epc" | "other";

export const DOC_KINDS: Array<{ id: DocKind; label: string }> = [
  { id: "id", label: "Photo ID" },
  { id: "ownership", label: "Proof of ownership" },
  { id: "gas", label: "Gas safety certificate (CP12)" },
  { id: "eicr", label: "Electrical safety report (EICR)" },
  { id: "epc", label: "Energy Performance Certificate (EPC)" },
  { id: "other", label: "Something else" },
];

export const isDocKind = (v: string): v is DocKind => DOC_KINDS.some((k) => k.id === v);

export interface LandlordDocument {
  id: string;
  accountId: string;
  appraisalId: string | null;
  kind: DocKind;
  name: string;
  r2Key: string;
  bytes: number | null;
  contentType: string;
  uploadedAt: string;
}

type DocRow = {
  id: string;
  account_id: string;
  appraisal_id: string | null;
  kind: string;
  name: string;
  r2_key: string;
  bytes: number | null;
  content_type: string;
  uploaded_at: Date | string;
};

const docShape = (r: DocRow): LandlordDocument => ({
  id: r.id,
  accountId: r.account_id,
  appraisalId: r.appraisal_id,
  kind: isDocKind(r.kind) ? r.kind : "other",
  name: r.name,
  r2Key: r.r2_key,
  bytes: r.bytes,
  contentType: r.content_type,
  uploadedAt: new Date(r.uploaded_at).toISOString(),
});

export async function landlordDocuments(accountId: string): Promise<LandlordDocument[]> {
  if (!hasDb()) return [];
  const rows = await q<DocRow>(
    `SELECT id, account_id, appraisal_id, kind, name, r2_key, bytes, content_type, uploaded_at
       FROM os_landlord_documents WHERE account_id = $1 ORDER BY uploaded_at DESC`,
    [accountId]
  ).catch(() => [] as DocRow[]);
  return rows.map(docShape);
}

export async function landlordDocument(accountId: string, id: string): Promise<LandlordDocument | null> {
  if (!hasDb()) return null;
  const rows = await q<DocRow>(
    `SELECT id, account_id, appraisal_id, kind, name, r2_key, bytes, content_type, uploaded_at
       FROM os_landlord_documents WHERE account_id = $1 AND id = $2`,
    [accountId, id]
  ).catch(() => [] as DocRow[]);
  return rows[0] ? docShape(rows[0]) : null;
}

export async function recordLandlordDocument(d: {
  accountId: string;
  appraisalId: string | null;
  kind: DocKind;
  name: string;
  r2Key: string;
  bytes: number;
  contentType: string;
}): Promise<LandlordDocument> {
  const rows = await q<DocRow>(
    `INSERT INTO os_landlord_documents (id, account_id, appraisal_id, kind, name, r2_key, bytes, content_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, account_id, appraisal_id, kind, name, r2_key, bytes, content_type, uploaded_at`,
    [uid(), d.accountId, d.appraisalId, d.kind, d.name, d.r2Key, d.bytes, d.contentType]
  );
  return docShape(rows[0]);
}

/* ------------------------------------------------------------ messages -- */

export interface LandlordMessage {
  id: string;
  appraisalId: string | null;
  direction: "landlord" | "agent";
  body: string;
  toEmail: string;
  sentAt: string;
  emailedAt: string | null;
  emailError: string;
}

type MsgRow = {
  id: string;
  appraisal_id: string | null;
  direction: string;
  body: string;
  to_email: string;
  sent_at: Date | string;
  emailed_at: Date | string | null;
  email_error: string;
};

const msgShape = (r: MsgRow): LandlordMessage => ({
  id: r.id,
  appraisalId: r.appraisal_id,
  direction: r.direction === "agent" ? "agent" : "landlord",
  body: r.body,
  toEmail: r.to_email,
  sentAt: new Date(r.sent_at).toISOString(),
  emailedAt: r.emailed_at ? new Date(r.emailed_at).toISOString() : null,
  emailError: r.email_error ?? "",
});

export async function landlordMessages(accountId: string): Promise<LandlordMessage[]> {
  if (!hasDb()) return [];
  const rows = await q<MsgRow>(
    `SELECT id, appraisal_id, direction, body, to_email, sent_at, emailed_at, email_error
       FROM os_landlord_messages WHERE account_id = $1 ORDER BY sent_at ASC LIMIT 200`,
    [accountId]
  ).catch(() => [] as MsgRow[]);
  return rows.map(msgShape);
}

export async function recordLandlordMessage(m: {
  accountId: string;
  appraisalId: string | null;
  body: string;
  toEmail: string;
}): Promise<LandlordMessage> {
  const rows = await q<MsgRow>(
    `INSERT INTO os_landlord_messages (id, account_id, appraisal_id, direction, body, to_email)
     VALUES ($1,$2,$3,'landlord',$4,$5)
     RETURNING id, appraisal_id, direction, body, to_email, sent_at, emailed_at, email_error`,
    [uid(), m.accountId, m.appraisalId, m.body, m.toEmail]
  );
  return msgShape(rows[0]);
}

export async function markMessageEmailed(id: string, error: string | null): Promise<void> {
  await q(
    error
      ? `UPDATE os_landlord_messages SET email_error = $2 WHERE id = $1`
      : `UPDATE os_landlord_messages SET emailed_at = NOW(), email_error = '' WHERE id = $1`,
    error ? [id, error.slice(0, 500)] : [id]
  ).catch(() => {});
}
