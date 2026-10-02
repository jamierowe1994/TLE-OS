import "server-only";
import type { AppraisalTick, MarketAppraisal, MaStage } from "@/lib/market-appraisal";
import { after } from "next/server";
import { EXTRA_DOC_KINDS, REQUIRED_DOCS_CASE, isExtraDocKind, type RequiredDocsCase } from "@/lib/landlord-doc-kinds";
import { bookFor } from "@/lib/listings-cache";
import { hasDb, q } from "@/lib/db";
import { appraisalsGeneration, listAppraisals, persistStages } from "@/lib/appraisal-store";
import { getComplianceItemsFor } from "@/lib/business/rex-stats";
import { listVault } from "@/lib/vault";
import { pendingKeyFor } from "@/lib/property-match";
import { PRE_SEND_HOLD_MS, PRE_SEND_SOON_MS } from "@/lib/pre-send-time";
import { allDone, progress, type Answers } from "@/lib/property-questions";

/* lib/property-answers-store's os_case_state kind. Read here in the batch
   rather than through readAnswers, which asks one appraisal at a time. */
const ANSWERS_KIND = "property-answers";

/**
 * Where an appraisal is, worked out from what has happened.
 *
 * Nothing moved a market appraisal between stages before this: every record
 * sat at Booked from the day it was made, whatever the agent had since sent,
 * shown, valued or had signed. The launch list called it out (item 1). The
 * same answer as the pre-tenancy board: read the record, do not ask anyone
 * to drag.
 *
 * ── The signals, in order ─────────────────────────────────────────────────
 *
 *   lost / won        the agent said so (the only two hand moves)
 *   won               a listing exists in REX for the property picked at
 *                     booking - the instruction became a listing
 *   aml               terms signed, the property questions answered AND the
 *                     landlord has put ID and proof of ownership on their
 *                     portal (the questions gate added 15 Sep 2026: Susan,
 *                     "the property does not move through the process until
 *                     it is done")
 *   takeon            terms signed - the next visit is the photographs
 *   post_appraisal    a figure recorded (the rule that already existed)
 *   appraisal         the visit has happened and no figure yet
 *   pre_appraisal     the pre-appraisal deck exists
 *   booked            nothing else yet
 *
 * Take-on has no record of its own (a photographs visit is a diary entry,
 * not a file), so it is the stage between terms and documents rather than
 * something detected. Honest, and shorter than pretending.
 *
 * ── The ticks (6 Sep 2026) ────────────────────────────────────────────────
 *
 * James, 23 Aug: "Have I sent this? Have I done this? Have I made this?" -
 * any stage that cannot be answered yes/no is too big. So each stage now
 * carries the small ticks the record can answer: deck sent, opened by the
 * landlord, visit happened, figure recorded, terms sent, terms signed, ID
 * and ownership on the portal, the certificates on file. The stage is still
 * the headline; the ticks are what the agent actually did.
 *
 * ── Why the API attaches it rather than the page computing it ────────────
 *
 * These reads are the database or a cached book; none belongs in a client
 * bundle. The list API attaches `liveStage`, a one-line `stageWhy` and the
 * `ticks` to every record, and effectiveStage (client-safe) honours
 * liveStage when it is there. The stored stage is brought up to the live
 * one as a side effect, so a filter on the column and the screen agree.
 */

export interface AppraisalFacts {
  preDeck: boolean;
  visitPassed: boolean;
  valued: boolean;
  termsSigned: boolean;
  landlordDocs: boolean;
  /** Every screen of the property questionnaire answered (lib/property-questions). */
  answered: boolean;
  listed: boolean;
}

export function deriveAppraisalStage(ma: MarketAppraisal, f: AppraisalFacts): { stage: MaStage; why: string } {
  if (ma.stage === "lost") return { stage: "lost", why: "Marked lost." };
  if (ma.stage === "won") return { stage: "won", why: "Marked won." };
  if (f.listed) return { stage: "won", why: "The property is listed." };
  if (f.termsSigned && f.answered && f.landlordDocs) return { stage: "aml", why: "Terms signed, the property questions answered, and the landlord's ID and proof of ownership are on the portal." };
  if (f.termsSigned && !f.answered) return { stage: "takeon", why: "Terms signed. The landlord still has property questions to answer - they are chased by email until they do." };
  if (f.termsSigned) return { stage: "takeon", why: "Terms signed. Next is the take-on visit and photographs." };
  if (f.valued) return { stage: "post_appraisal", why: "A figure has been recorded." };
  if (f.visitPassed) return { stage: "appraisal", why: "The visit has happened. No figure recorded yet." };
  if (f.preDeck) return { stage: "pre_appraisal", why: "The pre-presentation is made. Record a video, or send it without one." };
  /* Never "booked": booking is the first stop and it is done the moment the
     file exists, so a file at rest sits at the pre-appraisal (James, 11 Sep
     2026: "the first stage is always done... it should always be green"). */
  return { stage: "pre_appraisal", why: "Booked and in the diary. The pre-presentation is next." };
}

interface Signals {
  facts: AppraisalFacts;
  ticks: AppraisalTick[];
  videoState: "recorded" | "declined" | "none";
  preSend: { state: "queued" | "sent" | "none"; at: string | null; opens?: number };
  nudgeAt: string | null;
}

const SEND_LABEL: Record<string, string> = {
  "pre-appraisal": "Pre-presentation emailed",
  /* Not "nudge" - that is what James calls the reminder to himself. On the
     file it is the job: a personal video, or the choice not to make one. */
  "video-chase": "Record a personalised video for your appraisal",
  confirmation: "Confirmation sent",
};

/** When it would go if nothing is queued: two hours from now, or a quarter
 *  of an hour with the visit under three hours away (lib/pre-send-time; it
 *  was 9am the day before until 1 Oct 2026). The file page queues it for
 *  this the first time it is opened, so a file booked before the booking
 *  queued it itself still gets one. Null once the visit has been. */
function preSendMoment(ma: MarketAppraisal, now: Date): string | null {
  if (!ma.appointmentAt) return null;
  const visit = new Date(ma.appointmentAt);
  if (Number.isNaN(visit.valueOf()) || visit <= now) return null;
  const soon = visit.getTime() - now.getTime() < PRE_SEND_SOON_MS;
  return new Date(now.getTime() + (soon ? 15 * 60 * 1000 : PRE_SEND_HOLD_MS)).toISOString();
}

const iso = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString() : null);
const dayWords = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");

/**
 * EVERYTHING THE TICKS READ, FOR THE WHOLE LIST, IN SIX QUERIES (2 Oct 2026).
 *
 * signalsFor used to ask the database eight or nine questions PER appraisal
 * (decks per ref, signatures, the landlord's account, then their documents,
 * the sends, the e-sign watch, the answers, the extras). With sixty files on
 * the list and a pool of five connections that was ~500 queries queued
 * behind each other, which is where the 1.4 s p95 and 3.3 s p99 came from.
 * Each question is now asked once for every appraisal with ANY($1), and the
 * answers are handed out by id. Same rows, same rules, same ticks.
 *
 * The decks come back WITHOUT their deck JSON - only the one field the ticks
 * read (welcomeVideo.status) - because a deck is the heaviest thing in the
 * table and the list never shows one.
 */
interface DeckLite {
  kind: string;
  createdAt: string;
  firstOpenedAt: string | null;
  opens: number;
  video: string | null;
}
interface SendLite { kind: string; state: string; send_at: string; sent_at: string | null; created_at: string }
interface Batch {
  decks: Map<string, DeckLite[]>;
  signed: Map<string, { signer_name: string; completed_at: string }>;
  docs: Map<string, { kind: string; uploadedAt: string }[]>;
  sends: Map<string, SendLite[]>;
  esign: Map<string, string>;
  answers: Map<string, Answers>;
  extras: Map<string, string[]>;
}

const refsOf = (ma: MarketAppraisal) => [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
const emailKey = (v: string | null | undefined) => (v ? String(v).trim().toLowerCase() : "");

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const held = m.get(k);
  if (held) held.push(v);
  else m.set(k, [v]);
}

async function readBatch(list: MarketAppraisal[]): Promise<Batch> {
  const out: Batch = { decks: new Map(), signed: new Map(), docs: new Map(), sends: new Map(), esign: new Map(), answers: new Map(), extras: new Map() };
  if (!hasDb() || !list.length) return out;
  const ids = [...new Set(list.map((m) => m.id))];
  const refs = [...new Set(list.flatMap(refsOf))];
  const emails = [...new Set(list.map((m) => emailKey(m.landlordEmail)).filter(Boolean))];
  /* Every one is caught on its own: one table that will not answer costs
     its ticks, not the whole list - the same promise each per-row .catch
     made before. */
  const [decks, signed, docs, sends, esign, cases] = await Promise.all([
    q<{ kind: string; ref: string; created_at: string | Date; first_opened_at: string | Date | null; opens: number; video: string | null }>(
      `SELECT DISTINCT ON (ref, kind) kind, ref, created_at, first_opened_at, opens,
              deck->'welcomeVideo'->>'status' AS video
         FROM os_presentations WHERE ref = ANY($1)
        ORDER BY ref, kind, created_at DESC`,
      [refs]
    ).catch(() => []),
    q<{ appraisal_id: string; signer_name: string; completed_at: string | Date }>(
      `SELECT DISTINCT ON (appraisal_id) appraisal_id, signer_name, completed_at
         FROM os_signed_documents WHERE appraisal_id = ANY($1) AND completed_at IS NOT NULL
        ORDER BY appraisal_id, stored_at DESC`,
      [ids]
    ).catch(() => []),
    emails.length
      ? q<{ email: string; kind: string; uploaded_at: string | Date }>(
          `SELECT a.email, d.kind, d.uploaded_at
             FROM os_portal_accounts a JOIN os_landlord_documents d ON d.account_id = a.id
            WHERE a.kind = 'landlord' AND a.email = ANY($1)
            ORDER BY d.uploaded_at DESC`,
          [emails]
        ).catch(() => [])
      : Promise.resolve([]),
    q<{ ref: string; kind: string; state: string; send_at: string; sent_at: string | null; created_at: string | Date }>(
      `SELECT ref, kind, state, send_at, sent_at, created_at FROM os_scheduled_sends WHERE ref = ANY($1) ORDER BY created_at DESC`,
      [refs]
    ).catch(() => []),
    q<{ ref: string; created_at: string | Date }>(
      `SELECT ref, max(created_at) AS created_at FROM os_esign_watch WHERE ref = ANY($1) GROUP BY ref`,
      [refs]
    ).catch(() => []),
    q<{ kind: string; record_id: string; payload: Record<string, unknown> | null }>(
      `SELECT kind, record_id, payload FROM os_case_state WHERE kind = ANY($1) AND record_id = ANY($2)`,
      [[ANSWERS_KIND, REQUIRED_DOCS_CASE], ids]
    ).catch(() => []),
  ]);
  for (const d of decks)
    push(out.decks, d.ref, { kind: d.kind, createdAt: iso(d.created_at)!, firstOpenedAt: iso(d.first_opened_at), opens: Number(d.opens ?? 0), video: d.video });
  for (const s of signed) out.signed.set(s.appraisal_id, { signer_name: s.signer_name, completed_at: iso(s.completed_at)! });
  for (const d of docs) push(out.docs, emailKey(d.email), { kind: d.kind, uploadedAt: iso(d.uploaded_at)! });
  for (const s of sends) push(out.sends, s.ref, { kind: s.kind, state: s.state, send_at: s.send_at, sent_at: s.sent_at, created_at: iso(s.created_at)! });
  for (const e of esign) out.esign.set(e.ref, iso(e.created_at)!);
  for (const c of cases) {
    if (c.kind === ANSWERS_KIND) out.answers.set(c.record_id, (c.payload ?? {}) as Answers);
    else {
      const extra = (c.payload as Partial<RequiredDocsCase> | null)?.extra;
      out.extras.set(c.record_id, Array.isArray(extra) ? extra.filter(isExtraDocKind) : []);
    }
  }
  return out;
}

function signalsFor(ma: MarketAppraisal, b: Batch, certs: CertTick[], listedIds: Set<string>, now: Date): Signals {
  const refs = refsOf(ma);
  const decks = refs.flatMap((r) => b.decks.get(r) ?? []);
  const signedDoc = b.signed.get(ma.id) ?? null;
  const docs = b.docs.get(emailKey(ma.landlordEmail)) ?? [];
  /* Newest first across both refs, as the single ORDER BY used to give. */
  const sends = refs.length > 1 ? refs.flatMap((r) => b.sends.get(r) ?? []).sort((x, y) => y.created_at.localeCompare(x.created_at)) : b.sends.get(refs[0]) ?? [];
  const esignAt = refs.map((r) => b.esign.get(r) ?? "").sort().pop() || null;
  const answers = b.answers.get(ma.id) ?? {};
  const extras = b.extras.get(ma.id) ?? [];
  const kinds = new Set(docs.map((d) => d.kind));

  const deck = (kind: string) => decks.filter((d) => d.kind === kind).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
  const pre = deck("pre-appraisal");
  const post = deck("post-appraisal");
  const termsSentAt = ma.termsSentAt ?? esignAt;
  const visitPassed = Boolean(ma.appointmentAt && new Date(ma.appointmentAt) < now);
  const listed = Boolean(ma.rexPropertyId && listedIds.has(String(ma.rexPropertyId)));

  const facts: AppraisalFacts = {
    preDeck: Boolean(pre),
    visitPassed,
    valued: ma.valuation != null,
    termsSigned: Boolean(signedDoc),
    landlordDocs: kinds.has("id") && kinds.has("ownership"),
    answered: allDone(answers),
    listed,
  };

  const ticks: AppraisalTick[] = [];
  const tick = (stage: MaStage, id: string, label: string, done: boolean, at: string | null = null, detail?: string) => ticks.push({ id, stage, label, done, at, ...(detail ? { detail } : {}) });

  /* booked: the video, recorded or declined. The reminder to the agent is
     only a detail - the job is done when there is a recording on the deck
     or the agent has said "send it without one". */
  const video = sends.find((s) => s.kind === "video-chase");
  const recorded = Boolean(pre && pre.video === "ready");
  const declined = !recorded && sends.some((s) => s.kind === "video-chase" && s.state === "declined");
  const videoState: Signals["videoState"] = recorded ? "recorded" : declined ? "declined" : "none";
  const nudgeAt = video && video.state === "queued" ? iso(video.send_at) : null;
  tick(
    "booked", "video", SEND_LABEL["video-chase"], recorded || declined,
    recorded ? iso(pre?.createdAt ?? null) : null,
    recorded ? "recorded" : declined ? "sending without one" : nudgeAt ? `reminder ${dayWords(nudgeAt)}` : undefined
  );
  for (const s of sends.filter((x) => x.kind !== "video-chase" && x.kind !== "pre-appraisal" && x.kind !== "pre-heads-up")) {
    tick("booked", `send-${s.kind}`, SEND_LABEL[s.kind] ?? s.kind.replace(/[-_]/g, " "), Boolean(s.sent_at), iso(s.sent_at), !s.sent_at && s.state === "queued" ? `queued for ${dayWords(iso(s.send_at))}` : undefined);
  }

  /* pre-appraisal */
  const preMail = sends.find((s) => s.kind === "pre-appraisal");
  const preQueued = preMail && !preMail.sent_at && preMail.state === "queued" ? preMail : null;
  const preSend: Signals["preSend"] = preMail?.sent_at
    ? { state: "sent", at: iso(preMail.sent_at), opens: pre?.opens ?? 0 }
    : preQueued
      ? { state: "queued", at: iso(preQueued.send_at) }
      : { state: "none", at: preSendMoment(ma, now) };
  tick("pre_appraisal", "pre-made", "Pre-presentation made", Boolean(pre), iso(pre?.createdAt ?? null));
  /* Made is not sent. This used to tick the moment the deck existed. */
  tick("pre_appraisal", "pre-sent", "Sent to the landlord", Boolean(preMail?.sent_at), iso(preMail?.sent_at ?? null), preQueued ? `goes out ${dayWords(iso(preQueued.send_at))}` : undefined);
  tick("pre_appraisal", "pre-opened", "Opened by the landlord", Boolean(pre && pre.opens > 0), iso(pre?.firstOpenedAt ?? null), pre && pre.opens > 1 ? `opened ${pre.opens} times` : undefined);

  /* appraisal */
  tick("appraisal", "visit", "Visit happened", visitPassed, visitPassed ? ma.appointmentAt : null, !ma.appointmentAt ? "no date on the booking" : !visitPassed ? dayWords(ma.appointmentAt) : undefined);
  tick("appraisal", "figure", "Figure recorded", ma.valuation != null, ma.valuedAt ?? null, ma.valuation != null ? `£${ma.valuation.toLocaleString("en-GB")} pcm` : undefined);

  /* post-appraisal */
  tick("post_appraisal", "post-sent", "Post-appraisal deck sent", Boolean(post), iso(post?.createdAt ?? null));
  tick("post_appraisal", "post-opened", "Opened by the landlord", Boolean(post && post.opens > 0), iso(post?.firstOpenedAt ?? null), post && post.opens > 1 ? `opened ${post.opens} times` : undefined);
  tick("post_appraisal", "terms-sent", "Terms sent for signature", Boolean(termsSentAt), termsSentAt);
  tick("post_appraisal", "terms-signed", "Terms signed", Boolean(signedDoc), iso(signedDoc?.completed_at ?? null), signedDoc ? `by ${signedDoc.signer_name}` : undefined);

  /* take-on: what only the landlord knows, asked once they have signed */
  const asked = progress(answers);
  tick("takeon", "questions", "Property questions answered", facts.answered, null, signedDoc && !facts.answered ? `${asked.done} of ${asked.of} parts done, chased by email` : undefined);

  /* aml */
  tick("aml", "id", "ID on the landlord portal", kinds.has("id"), iso(docs.find((d) => d.kind === "id")?.uploadedAt ?? null));
  tick("aml", "ownership", "Proof of ownership on the portal", kinds.has("ownership"), iso(docs.find((d) => d.kind === "ownership")?.uploadedAt ?? null));
  for (const c of certs) tick("aml", `cert-${c.key}`, `${c.label} on file`, c.held, c.at, c.detail);
  /* And whatever else the agent asked this property for (Documents This
     Property Needs, on the appraisal). */
  for (const k of EXTRA_DOC_KINDS.filter((x) => extras.includes(x.id))) {
    tick("aml", `extra-${k.id}`, `${k.label} on the portal`, kinds.has(k.id), iso(docs.find((d) => d.kind === k.id)?.uploadedAt ?? null));
  }

  /* won */
  tick("won", "listed", "Listed", listed, null);

  return { facts, ticks, videoState, preSend, nudgeAt };
}

type CertTick = { key: string; label: string; held: boolean; at: string | null; detail?: string };
type ComplianceRead = Awaited<ReturnType<typeof getComplianceItemsFor>>;
type VaultRead = Awaited<ReturnType<typeof listVault>>;

/**
 * THE TWO OUTSIDE READS, KEPT BRIEFLY (2 Oct 2026).
 *
 * Every appraisal on the list asked REX for its property's compliance and
 * listed its folder in R2, on every load, uncached - the slow tail of the
 * list. Both are kept per key now: REX compliance for five minutes (one
 * minute when REX did not finish answering, the same rule as the deal board
 * in lib/business/rex-stats), the R2 folder for two. A certificate filed in
 * the last few minutes shows on the LIST a few minutes late; the file page
 * (opts.fresh) reads the R2 folder every time and REX within the minute.
 *
 * On globalThis so every route module and every dev reload share one copy.
 */
interface CertCaches {
  rex: Map<string, { at: number; ttl: number; p: Promise<ComplianceRead> }>;
  vault: Map<string, { at: number; p: Promise<VaultRead> }>;
}
declare global {
  // eslint-disable-next-line no-var
  var __osAppraisalCerts: CertCaches | undefined;
  // eslint-disable-next-line no-var
  var __osStagedAppraisals: StagedCache | undefined;
}
const certCaches: CertCaches = (globalThis.__osAppraisalCerts ??= { rex: new Map(), vault: new Map() });
const REX_CERT_MS = 5 * 60_000;
const REX_CERT_UNKNOWN_MS = 60_000;
const VAULT_MS = 2 * 60_000;

/* The file page reads with `fresh`, and reloads after every save. The R2
   folder is cheap and is where the OS's own uploads land, so it is always
   read again; REX compliance is the slowest call REX has and nothing on the
   file page writes to it, so a copy under a minute old still stands. */
const REX_CERT_FRESH_MS = 60_000;

function complianceFor(propertyId: string, fresh: boolean): Promise<ComplianceRead> {
  const held = certCaches.rex.get(propertyId);
  if (held && Date.now() - held.at < (fresh ? Math.min(held.ttl, REX_CERT_FRESH_MS) : held.ttl)) return held.p;
  const entry = { at: Date.now(), ttl: REX_CERT_UNKNOWN_MS, p: getComplianceItemsFor(propertyId).catch((): ComplianceRead => ({ items: [], checked: false })) };
  /* Kept for the full five minutes only once REX gave a whole answer. */
  void entry.p.then((r) => { if (r.checked) entry.ttl = REX_CERT_MS; });
  certCaches.rex.set(propertyId, entry);
  return entry.p;
}

function vaultFor(key: string, fresh: boolean): Promise<VaultRead> {
  const held = certCaches.vault.get(key);
  if (!fresh && held && Date.now() - held.at < VAULT_MS) return held.p;
  const entry = { at: Date.now(), p: listVault(key).catch((): VaultRead => []) };
  certCaches.vault.set(key, entry);
  return entry.p;
}

/** Gas, EICR and EPC: in REX on the picked property, or held against the address. */
async function certificatesFor(ma: MarketAppraisal, fresh: boolean): Promise<CertTick[]> {
  const want: { key: string; type: string; vault: string; label: string }[] = [
    { key: "gas", type: "gas_safety", vault: "gas", label: "Gas safety" },
    { key: "eicr", type: "eicr", vault: "eicr", label: "EICR" },
    { key: "epc", type: "epc", vault: "epc", label: "EPC" },
  ];
  const [rex, held] = await Promise.all([
    ma.rexPropertyId ? complianceFor(String(ma.rexPropertyId), fresh) : Promise.resolve({ items: [], checked: false } as ComplianceRead),
    vaultFor(pendingKeyFor(`${ma.address}${ma.postcode && !ma.address.includes(ma.postcode) ? `, ${ma.postcode}` : ""}`), fresh),
  ]);
  return want.map((w) => {
    const item = rex.items.find((i) => i.type === w.type);
    const file = held.find((f) => f.certKey === w.vault);
    if (item && (item.state === "valid" || item.state === "expiring")) return { key: w.key, label: w.label, held: true, at: null, detail: item.expiry ? `expires ${item.expiry}` : undefined };
    if (item && item.state === "expired") return { key: w.key, label: w.label, held: false, at: null, detail: `expired ${item.expiry ?? ""}`.trim() };
    if (file) return { key: w.key, label: w.label, held: true, at: file.uploadedAt, detail: "held against the address" };
    return { key: w.key, label: w.label, held: false, at: null };
  });
}

/**
 * Fire-and-forget that does not hold the response. Inside a request, after()
 * runs it once the reply has gone; outside one (a cron, the assistant's
 * tools) after() throws, and it simply runs now without being awaited.
 */
function later(work: () => Promise<unknown>) {
  try {
    after(work);
  } catch {
    void work().catch(() => null);
  }
}

export interface StageOptions {
  /** The single file page, read after a save: R2 read again, REX compliance at most a minute old. */
  fresh?: boolean;
}

/** One record, its live stage, why, and the ticks; the stored stage brought up to match. */
export async function withLiveStage(ma: MarketAppraisal, listedIds: Set<string>, now = new Date(), opts: StageOptions = {}): Promise<MarketAppraisal> {
  const [one] = await stageAll([ma], listedIds, now, opts);
  return one;
}

async function stageAll(list: MarketAppraisal[], listedIds: Set<string>, now: Date, opts: StageOptions): Promise<MarketAppraisal[]> {
  const [batch, certs] = await Promise.all([
    readBatch(list).catch((): Batch | null => null),
    Promise.all(list.map((ma) => certificatesFor(ma, Boolean(opts.fresh)).catch((): CertTick[] | null => null))),
  ]);
  const moves: { id: string; stage: MaStage }[] = [];
  const out = list.map((ma, i) => {
    /* A record whose signals could not be read keeps its stored stage,
       exactly as the per-row try/catch did. */
    if (!batch || !certs[i]) return ma;
    try {
      const { facts, ticks, videoState, preSend, nudgeAt } = signalsFor(ma, batch, certs[i]!, listedIds, now);
      const { stage, why } = deriveAppraisalStage(ma, facts);
      if (stage !== ma.stage && ma.stage !== "won" && ma.stage !== "lost") moves.push({ id: ma.id, stage });
      return { ...ma, liveStage: stage, stageWhy: why, ticks, videoState, preSend, nudgeAt };
    } catch {
      return ma;
    }
  });
  /* The stored stage brought up to the live one, AFTER the reply: it used to
     be a write per row racing the reads for the same five connections. */
  if (moves.length) later(() => persistStages(moves));
  return out;
}

/** The list, each record carrying its live stage, the reason and the ticks. */
export async function withLiveStages(list: MarketAppraisal[], now = new Date(), opts: StageOptions = {}): Promise<MarketAppraisal[]> {
  let listedIds = new Set<string>();
  /* Which listing each property has, so the file can open THAT listing
     (Howard, 1 Oct 2026: "opens listing but doesn't open my listing"). The
     link used to hand the property id to ?open=, which takes a listing id,
     so it landed on the board with nothing open. A home let more than once
     has a listing per let; the newest is the one being worked on. */
  const listingOf = new Map<string, { id: string; at: string }>();
  try {
    const book = await bookFor(null);
    listedIds = new Set(book.listings.filter((l) => l.propertyId).map((l) => String(l.propertyId)));
    for (const l of book.listings) {
      if (!l.propertyId) continue;
      const key = String(l.propertyId);
      const at = l.createdAt ?? "";
      const held = listingOf.get(key);
      if (!held || at > held.at) listingOf.set(key, { id: String(l.id), at });
    }
  } catch {
    /* no book: nothing reads as won on that evidence; nothing else changes */
  }
  const staged = await stageAll(list, listedIds, now, opts);
  return staged.map((ma) => ({ ...ma, listingId: ma.rexPropertyId ? listingOf.get(String(ma.rexPropertyId))?.id ?? null : null }));
}

/**
 * THE STAGED LIST, HELD FOR HALF A MINUTE (2 Oct 2026).
 *
 * The Market Appraisals screen and the dashboard ask for the whole staged
 * list on every load. It is now kept for 30 seconds and, between 30 seconds
 * and two minutes old, served while a fresh one is built behind it - the
 * stale-while-revalidate the listing book already uses. Past two minutes it
 * is not shown at all; the caller waits for a real read.
 *
 * Any write through lib/appraisal-store (booking, a figure, won/lost, terms
 * sent) bumps a generation and the held copy is thrown away, so the person
 * who just saved never reads their own change back stale. Writes the store
 * does not see (a deck made, a landlord signing) reach the list within 30
 * seconds; the file page reads its one record live and sees them at once.
 *
 * A failed read is never cached, so an error is not frozen onto the screen.
 */
interface StagedCache {
  held: { at: number; gen: number; list: MarketAppraisal[] } | null;
  building: Promise<MarketAppraisal[]> | null;
}
const staged: StagedCache = (globalThis.__osStagedAppraisals ??= { held: null, building: null });
const STAGED_FRESH_MS = 30_000;
const STAGED_KEEP_MS = 2 * 60_000;

function buildStaged(): Promise<MarketAppraisal[]> {
  if (staged.building) return staged.building;
  const gen = appraisalsGeneration();
  const p = listAppraisals()
    .then((list) => withLiveStages(list))
    .then((list) => {
      /* Only kept if nothing was written while it was being built. */
      if (gen === appraisalsGeneration()) staged.held = { at: Date.now(), gen, list };
      return list;
    })
    .finally(() => {
      if (staged.building === p) staged.building = null;
    });
  staged.building = p;
  return p;
}

export async function stagedAppraisals(): Promise<MarketAppraisal[]> {
  const held = staged.held;
  const age = held ? Date.now() - held.at : Infinity;
  if (held && held.gen === appraisalsGeneration() && age < STAGED_KEEP_MS) {
    if (age >= STAGED_FRESH_MS) later(() => buildStaged().catch(() => null));
    return held.list;
  }
  return buildStaged();
}
