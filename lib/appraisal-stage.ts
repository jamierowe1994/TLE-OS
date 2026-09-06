import "server-only";
import type { AppraisalTick, MarketAppraisal, MaStage } from "@/lib/market-appraisal";
import { presentationsFor } from "@/lib/present-store";
import { signedFor } from "@/lib/signed-documents";
import { landlordAccountByEmail, landlordDocuments } from "@/lib/landlord-account";
import { bookFor } from "@/lib/listings-cache";
import { hasDb, q } from "@/lib/db";
import { persistStage } from "@/lib/appraisal-store";
import { getComplianceItemsFor } from "@/lib/business/rex-stats";
import { listVault } from "@/lib/vault";
import { pendingKeyFor } from "@/lib/property-match";

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
 *   aml               terms signed AND the landlord has put ID and proof of
 *                     ownership on their portal
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
  listed: boolean;
}

export function deriveAppraisalStage(ma: MarketAppraisal, f: AppraisalFacts): { stage: MaStage; why: string } {
  if (ma.stage === "lost") return { stage: "lost", why: "Marked lost." };
  if (ma.stage === "won") return { stage: "won", why: "Marked won." };
  if (f.listed) return { stage: "won", why: "The property is listed in REX." };
  if (f.termsSigned && f.landlordDocs) return { stage: "aml", why: "Terms signed and the landlord's ID and proof of ownership are on the portal." };
  if (f.termsSigned) return { stage: "takeon", why: "Terms signed. Next is the take-on visit and photographs." };
  if (f.valued) return { stage: "post_appraisal", why: "A figure has been recorded." };
  if (f.visitPassed) return { stage: "appraisal", why: "The visit has happened. No figure recorded yet." };
  if (f.preDeck) return { stage: "pre_appraisal", why: "The pre-appraisal deck has been made." };
  return { stage: "booked", why: "Booked. Nothing sent yet." };
}

interface Signals {
  facts: AppraisalFacts;
  ticks: AppraisalTick[];
}

const SEND_LABEL: Record<string, string> = {
  "pre-appraisal": "Pre-appraisal deck emailed",
  "video-chase": "Welcome video nudge",
  confirmation: "Confirmation sent",
};

const iso = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString() : null);
const dayWords = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");

async function signalsFor(ma: MarketAppraisal, listedIds: Set<string>, now: Date): Promise<Signals> {
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const [decks, signed, account, sends, esign, certs] = await Promise.all([
    Promise.all(refs.map((r) => presentationsFor(r).catch(() => []))).then((d) => d.flat()),
    signedFor(ma.id).catch(() => []),
    ma.landlordEmail ? landlordAccountByEmail(ma.landlordEmail).catch(() => null) : Promise.resolve(null),
    hasDb()
      ? q<{ kind: string; state: string; send_at: string; sent_at: string | null }>(
          `SELECT kind, state, send_at, sent_at FROM os_scheduled_sends WHERE ref = ANY($1) ORDER BY created_at DESC`,
          [refs]
        ).catch(() => [])
      : Promise.resolve([]),
    hasDb()
      ? q<{ created_at: string; completed_at: string | null }>(`SELECT created_at, completed_at FROM os_esign_watch WHERE ref = ANY($1) ORDER BY created_at DESC LIMIT 5`, [refs]).catch(() => [])
      : Promise.resolve([]),
    certificatesFor(ma),
  ]);
  const docs = account ? await landlordDocuments(account.id).catch(() => []) : [];
  const kinds = new Set(docs.map((d) => d.kind));

  const deck = (kind: string) => decks.filter((d) => d.kind === kind).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
  const pre = deck("pre-appraisal");
  const post = deck("post-appraisal");
  const signedDoc = signed.find((s) => s.completed_at) ?? null;
  const termsSentAt = ma.termsSentAt ?? iso(esign[0]?.created_at ?? null);
  const visitPassed = Boolean(ma.appointmentAt && new Date(ma.appointmentAt) < now);
  const listed = Boolean(ma.rexPropertyId && listedIds.has(String(ma.rexPropertyId)));

  const facts: AppraisalFacts = {
    preDeck: Boolean(pre),
    visitPassed,
    valued: ma.valuation != null,
    termsSigned: Boolean(signedDoc),
    landlordDocs: kinds.has("id") && kinds.has("ownership"),
    listed,
  };

  const ticks: AppraisalTick[] = [];
  const tick = (stage: MaStage, id: string, label: string, done: boolean, at: string | null = null, detail?: string) => ticks.push({ id, stage, label, done, at, ...(detail ? { detail } : {}) });

  /* booked */
  const video = sends.find((s) => s.kind === "video-chase");
  tick("booked", "video", SEND_LABEL["video-chase"], Boolean(video?.sent_at), iso(video?.sent_at), video && !video.sent_at ? (video.state === "queued" ? `queued for ${dayWords(iso(video.send_at))}` : video.state) : undefined);
  for (const s of sends.filter((x) => x.kind !== "video-chase" && x.kind !== "pre-appraisal")) {
    tick("booked", `send-${s.kind}`, SEND_LABEL[s.kind] ?? s.kind.replace(/[-_]/g, " "), Boolean(s.sent_at), iso(s.sent_at), !s.sent_at && s.state === "queued" ? `queued for ${dayWords(iso(s.send_at))}` : undefined);
  }

  /* pre-appraisal */
  const preMail = sends.find((s) => s.kind === "pre-appraisal");
  tick("pre_appraisal", "pre-made", "Pre-appraisal deck made", Boolean(pre), iso(pre?.createdAt ?? null));
  tick("pre_appraisal", "pre-sent", "Sent to the landlord", Boolean(pre) || Boolean(preMail?.sent_at), iso(preMail?.sent_at ?? pre?.createdAt ?? null), preMail && !preMail.sent_at && preMail.state === "queued" ? `queued for ${dayWords(iso(preMail.send_at))}` : undefined);
  tick("pre_appraisal", "pre-opened", "Opened by the landlord", Boolean(pre && pre.opens > 0), iso(pre?.firstOpenedAt ?? null), pre && pre.opens > 1 ? `opened ${pre.opens} times` : undefined);

  /* appraisal */
  tick("appraisal", "visit", "Visit happened", visitPassed, visitPassed ? ma.appointmentAt : null, !ma.appointmentAt ? "no date on the booking" : !visitPassed ? dayWords(ma.appointmentAt) : undefined);
  tick("appraisal", "figure", "Figure recorded", ma.valuation != null, ma.valuedAt ?? null, ma.valuation != null ? `£${ma.valuation.toLocaleString("en-GB")} pcm` : undefined);

  /* post-appraisal */
  tick("post_appraisal", "post-sent", "Post-appraisal deck sent", Boolean(post), iso(post?.createdAt ?? null));
  tick("post_appraisal", "post-opened", "Opened by the landlord", Boolean(post && post.opens > 0), iso(post?.firstOpenedAt ?? null), post && post.opens > 1 ? `opened ${post.opens} times` : undefined);
  tick("post_appraisal", "terms-sent", "Terms sent for signature", Boolean(termsSentAt), termsSentAt);
  tick("post_appraisal", "terms-signed", "Terms signed", Boolean(signedDoc), iso(signedDoc?.completed_at ?? null), signedDoc ? `by ${signedDoc.signer_name}` : undefined);

  /* aml */
  tick("aml", "id", "ID on the landlord portal", kinds.has("id"), iso(docs.find((d) => d.kind === "id")?.uploadedAt ?? null));
  tick("aml", "ownership", "Proof of ownership on the portal", kinds.has("ownership"), iso(docs.find((d) => d.kind === "ownership")?.uploadedAt ?? null));
  for (const c of certs) tick("aml", `cert-${c.key}`, `${c.label} on file`, c.held, c.at, c.detail);

  /* won */
  tick("won", "listed", "Listed in REX", listed, null);

  return { facts, ticks };
}

/** Gas, EICR and EPC: in REX on the picked property, or held against the address. */
async function certificatesFor(ma: MarketAppraisal): Promise<{ key: string; label: string; held: boolean; at: string | null; detail?: string }[]> {
  const want: { key: string; type: string; vault: string; label: string }[] = [
    { key: "gas", type: "gas_safety", vault: "gas", label: "Gas safety" },
    { key: "eicr", type: "eicr", vault: "eicr", label: "EICR" },
    { key: "epc", type: "epc", vault: "epc", label: "EPC" },
  ];
  const [rex, held] = await Promise.all([
    ma.rexPropertyId ? getComplianceItemsFor(ma.rexPropertyId).catch(() => ({ items: [], checked: false })) : Promise.resolve({ items: [], checked: false }),
    listVault(pendingKeyFor(`${ma.address}${ma.postcode && !ma.address.includes(ma.postcode) ? `, ${ma.postcode}` : ""}`)).catch(() => []),
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

/** One record, its live stage, why, and the ticks; the stored stage brought up to match. */
export async function withLiveStage(ma: MarketAppraisal, listedIds: Set<string>, now = new Date()): Promise<MarketAppraisal> {
  try {
    const { facts, ticks } = await signalsFor(ma, listedIds, now);
    const { stage, why } = deriveAppraisalStage(ma, facts);
    if (stage !== ma.stage && ma.stage !== "won" && ma.stage !== "lost") void persistStage(ma.id, stage);
    return { ...ma, liveStage: stage, stageWhy: why, ticks };
  } catch {
    return ma;
  }
}

/** The list, each record carrying its live stage, the reason and the ticks. */
export async function withLiveStages(list: MarketAppraisal[], now = new Date()): Promise<MarketAppraisal[]> {
  let listedIds = new Set<string>();
  try {
    const book = await bookFor(null);
    listedIds = new Set(book.listings.filter((l) => l.propertyId).map((l) => String(l.propertyId)));
  } catch {
    /* no book: nothing reads as won on that evidence; nothing else changes */
  }
  return Promise.all(list.map((ma) => withLiveStage(ma, listedIds, now)));
}
