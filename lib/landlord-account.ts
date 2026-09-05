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
import { certificatesFor } from "@/lib/rex-compliance";
import { getApplications, type Application } from "@/lib/applications";
import type { ViewOffer, ViewProgress } from "@/lib/landlord-view";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";
import { getMeta } from "@/lib/business/deal-store";
import { derivedStageFor } from "@/lib/business/deal-stage";
import { PORTAL_STAGES } from "@/lib/business/propoly-stages";
import { propertyKey } from "@/lib/business/payprop-portfolio";
import { CERT_META, requiredCerts, statusOf, type CertKey, type CertStatus, type CompProperty } from "@/lib/compliance";

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

/* -------------------------------------------------------- certificates -- */

/** One certificate as the landlord reads it. */
export interface LandlordCert {
  key: CertKey;
  label: string;
  status: CertStatus;
  /** Days until expiry; negative when expired; null with no record. */
  daysLeft: number | null;
  /** ISO date of expiry, worked back from daysLeft. */
  expires: string | null;
  /** The certificate file is on the REX record, not just a date. */
  attached: boolean;
  /** "Expires 12 March 2027", "Expired 40 days ago", "No record". */
  line: string;
  /** Alarms and legionella: no fixed expiry, so "no record" is not a fault. */
  quiet: boolean;
}

export interface LandlordCompliance {
  propertyId: string;
  certs: LandlordCert[];
  /** Everything required is in date. */
  allInDate: boolean;
  /** "All in date", "Gas due in 12 days", "EICR: no record". Worst first. */
  headline: string;
}

const RANK: Record<CertStatus, number> = { expired: 0, missing: 1, urgent: 2, watch: 3, ok: 4 };

function certLine(status: CertStatus, daysLeft: number | null, expires: string | null): string {
  const when = expires
    ? new Date(expires).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;
  if (status === "missing" || daysLeft == null) return "No record with us";
  if (status === "expired") return `Expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"} ago${when ? ` (${when})` : ""}`;
  if (daysLeft === 0) return "Expires today";
  return `Expires ${when ?? `in ${daysLeft} days`}${daysLeft <= 90 ? ` - ${daysLeft} days` : ""}`;
}

function summarise(p: CompProperty): LandlordCompliance {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const certs: LandlordCert[] = requiredCerts(p).map((key) => {
    const c = p.certs[key];
    const status = statusOf(c);
    const daysLeft = c?.expires ?? null;
    const expires = daysLeft == null ? null : new Date(today.getTime() + daysLeft * 86400000).toISOString().slice(0, 10);
    const quiet = key === "alarms" || key === "legionella";
    const line = quiet && status === "missing" ? "Checked at each visit - no dated record" : certLine(status, daysLeft, expires);
    return { key, label: CERT_META[key].label, status, daysLeft, expires, attached: Boolean(c?.attached), line, quiet };
  });
  /* The quiet duties have no fixed expiry, so "no record" on alarms or
     legionella is not a fault the landlord can act on. The headline reads
     the ones with a date. */
  const dated = certs.filter((c) => !["alarms", "legionella"].includes(c.key));
  const worst = [...dated].sort((a, b) => RANK[a.status] - RANK[b.status])[0];
  const allInDate = dated.every((c) => c.status === "ok" || c.status === "watch");
  const headline = !worst || allInDate
    ? "All in date"
    : worst.status === "missing"
      ? `${CERT_META[worst.key].short}: no record`
      : worst.status === "expired"
        ? `${CERT_META[worst.key].short} expired`
        : `${CERT_META[worst.key].short} due in ${worst.daysLeft} day${worst.daysLeft === 1 ? "" : "s"}`;
  return { propertyId: p.id, certs, allInDate, headline };
}

/**
 * The certificates on the landlord's managed properties, from REX, by
 * property id. The same read and the same rules as the Compliance screen,
 * so what the landlord sees is what Michael sees. Empty on any failure: a
 * portal must render without it rather than hang on REX.
 */
export async function landlordCompliance(props: ManagedProperty[]): Promise<Map<string, LandlordCompliance>> {
  const out = new Map<string, LandlordCompliance>();
  const subjects = props
    .filter((p) => p.propertyId)
    .map((p) => ({ propertyId: p.propertyId as string, name: p.name, locality: p.locality, epcExpiry: null }));
  if (!subjects.length) return out;
  try {
    const book = await certificatesFor(subjects);
    for (const cp of book.properties) out.set(cp.id, summarise(cp));
  } catch {
    /* the portal shows the property without certificates rather than nothing */
  }
  return out;
}

/* -------------------------------------------------------------- offers -- */

const OFFER_WORDS: Record<string, { status: ViewOffer["status"]; label: string }> = {
  received: { status: "received", label: "Received" },
  communicated: { status: "with-you", label: "With you" },
  accepted: { status: "accepted", label: "Accepted" },
  unsuccessful: { status: "unsuccessful", label: "Unsuccessful" },
};

function firstName(n: string): string {
  return n.trim().split(/\s+/)[0] || "Applicant";
}

function offerOf(a: Application): ViewOffer {
  const w = OFFER_WORDS[a.status] ?? OFFER_WORDS.received;
  const people: string[] = [];
  if (a.occupants != null) people.push(`${a.occupants} ${a.occupants === 1 ? "adult" : "adults"}`);
  if (a.dependents != null && a.dependents > 0) people.push(`${a.dependents} ${a.dependents === 1 ? "child" : "children"}`);
  if (a.hasPets != null) people.push(a.hasPets ? "pets" : "no pets");
  const amount =
    a.offerAmount != null
      ? `£${Math.round(a.offerAmount).toLocaleString("en-GB")} per ${a.offerPeriod === "week" ? "week" : "month"}`
      : "Amount to follow";
  return {
    id: a.id,
    amount,
    status: w.status,
    statusLabel: w.label,
    who: people.join(", ") || "Details to follow",
    applicants: a.applicants.map((p) => firstName(p.name)).filter(Boolean).join(" and ") || "An applicant",
    moveIn: a.startDate,
    received: a.dateReceived,
    /* "N/A", "none" and a dash are an agent saying nothing was asked for.
       A block starting "Flags:" or carrying "key info" is the agent's own
       referencing shorthand typed into the wrong field - right to rent,
       credit, a full name - and is not the landlord's to read here. */
    conditions:
      a.conditions &&
      !/^(n\/?a|none|nil|-|no)\.?$/i.test(a.conditions.trim()) &&
      !/^flags?\s*:|key info|poor credit|right to rent\s*:/i.test(a.conditions)
        ? a.conditions.trim()
        : null,
  };
}

/**
 * The offers on a landlord's property, from REX's applications. Matched on
 * the REX property id (the appraisal's pick, the managed property's record)
 * and on the listing id where there is one. Newest first; an accepted offer
 * floats to the top because it is the one the landlord wants to see.
 * Empty on any failure: a portal must render without REX.
 */
export async function landlordOffers(propertyIds: Array<string | null | undefined>, listingIds: Array<string | number | null | undefined> = []): Promise<ViewOffer[]> {
  const props = new Set(propertyIds.filter((x): x is string => Boolean(x)).map(String));
  const lists = new Set(listingIds.filter((x): x is string | number => x != null && x !== "").map(String));
  if (!props.size && !lists.size) return [];
  let apps: Application[] = [];
  try {
    apps = await getApplications(300);
  } catch {
    return [];
  }
  const mine = apps.filter(
    (a) => (a.propertyId && props.has(String(a.propertyId))) || (a.listingId != null && lists.has(String(a.listingId)))
  );
  mine.sort((a, b) => {
    const acc = Number(b.status === "accepted") - Number(a.status === "accepted");
    if (acc) return acc;
    return (b.dateReceived ?? "").localeCompare(a.dateReceived ?? "");
  });
  return mine.map(offerOf);
}

/* ------------------------------------------------------------ progress -- */

/* The eight stages as a landlord reads them. Kirstie (4 Sep): whatever
   reaches her should also reach the landlord's portal. The stage is the same
   derivation her board uses; only the words are the landlord's. */
const LANDLORD_WORDS: Record<string, { label: string; now: string; next: string }> = {
  deal_started: { label: "Offer accepted", now: "The offer has been accepted and the deal is being set up.", next: "We collect the holding fee from the tenant, which takes the property off the market." },
  holding_fee: { label: "Holding fee", now: "We are collecting the tenant's holding fee.", next: "Once it is in, referencing starts." },
  referencing: { label: "Referencing", now: "The tenant's references are being checked: employer, previous landlord and credit.", next: "Nothing for you yet. We will tell you the moment they are back." },
  plc: { label: "Compliance checks", now: "References are back. We are checking the property's certificates and your documents before anything is signed.", next: "If a certificate or a document is missing, your agent will ask you for it." },
  deposit: { label: "Deposit", now: "The checks have passed. The deposit, or the deposit alternative, is being arranged.", next: "Nothing for you here unless your agent asks." },
  tenancy_agreement: { label: "Tenancy agreement", now: "The tenancy agreement is being drawn up and sent for signing.", next: "Read it and sign when it arrives. Both you and the tenant sign before the rent is requested." },
  rent_payment: { label: "First rent", now: "Signed. The tenant's first month and standing order are being set up.", next: "Your first payment follows once the rent has landed and been reconciled." },
  move_day: { label: "Move-in day", now: "Everything is in place. The tenant moves in on the date agreed.", next: "Keys, inventory and check-in are handled by your agent." },
};

/**
 * The landlord's accepted let, from Propoly, by address or by their email on
 * the deal. Nearest move-in first where there is more than one. Null when no
 * live deal exists for the property.
 */
export async function landlordProgress(email: string, propertyNames: string[]): Promise<ViewProgress | null> {
  const all = (await getAllPropolyDeals().catch(() => null)) ?? [];
  const keys = new Set(propertyNames.map((n) => propertyKey(n)).filter(Boolean));
  const mine = all.filter(
    (d) =>
      d.statusKey !== "cancelled" &&
      d.statusKey !== "complete" &&
      ((d.app.propoly?.landlord?.email && normaliseEmail(d.app.propoly.landlord.email) === email) ||
        (keys.size > 0 && keys.has(propertyKey(d.app.propertyName))))
  );
  if (!mine.length) return null;
  mine.sort((a, b) => (a.app.startDate ?? "9999").localeCompare(b.app.startDate ?? "9999"));
  const d = mine[0];
  const meta = await getMeta(d.app.id).catch(() => null);
  const stageKey = await derivedStageFor(d, meta);
  const idx = Math.max(0, PORTAL_STAGES.findIndex((s) => s.key === stageKey));
  const words = LANDLORD_WORDS[stageKey] ?? LANDLORD_WORDS.deal_started;
  return {
    property: [d.app.propertyName, d.app.locality].filter(Boolean).join(", "),
    tenants: d.app.tenants.map((t) => t.name.split(/\s+/)[0]).filter(Boolean).join(" and ") || "The tenant",
    moveIn: d.app.startDate,
    rentPcm: d.app.offer,
    stageKey,
    stages: PORTAL_STAGES.map((s, i) => ({
      key: s.key,
      label: LANDLORD_WORDS[s.key]?.label ?? s.label,
      state: i < idx ? "done" : i === idx ? "current" : "upcoming",
    })),
    now: words.now,
    next: words.next,
  };
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
