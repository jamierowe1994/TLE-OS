import "server-only";
import type { MarketAppraisal, MaStage } from "@/lib/market-appraisal";
import { presentationsFor } from "@/lib/present-store";
import { signedFor } from "@/lib/signed-documents";
import { landlordAccountByEmail, landlordDocuments } from "@/lib/landlord-account";
import { bookFor } from "@/lib/listings-cache";

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
 * ── Why the API attaches it rather than the page computing it ────────────
 *
 * Four of these reads are the database or a cached book; none belongs in a
 * client bundle. The list API attaches `liveStage` and a one-line `stageWhy`
 * to every record, and effectiveStage (client-safe) honours liveStage when
 * it is there. Every screen that already called effectiveStage moved
 * without knowing.
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

async function factsFor(ma: MarketAppraisal, listedIds: Set<string>, now: Date): Promise<AppraisalFacts> {
  const refs = [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))];
  const [decks, signed, account] = await Promise.all([
    Promise.all(refs.map((r) => presentationsFor(r).catch(() => []))).then((d) => d.flat()),
    signedFor(ma.id).catch(() => []),
    ma.landlordEmail ? landlordAccountByEmail(ma.landlordEmail).catch(() => null) : Promise.resolve(null),
  ]);
  const docs = account ? await landlordDocuments(account.id).catch(() => []) : [];
  const kinds = new Set(docs.map((d) => d.kind));
  return {
    preDeck: decks.some((d) => d.kind === "pre-appraisal"),
    visitPassed: Boolean(ma.appointmentAt && new Date(ma.appointmentAt) < now),
    valued: ma.valuation != null,
    termsSigned: signed.length > 0,
    landlordDocs: kinds.has("id") && kinds.has("ownership"),
    listed: Boolean(ma.rexPropertyId && listedIds.has(String(ma.rexPropertyId))),
  };
}

/** The list, each record carrying its live stage and the reason. */
export async function withLiveStages(list: MarketAppraisal[], now = new Date()): Promise<MarketAppraisal[]> {
  let listedIds = new Set<string>();
  try {
    const book = await bookFor(null);
    listedIds = new Set(book.listings.filter((l) => l.propertyId).map((l) => String(l.propertyId)));
  } catch {
    /* no book: nothing reads as won on that evidence; nothing else changes */
  }
  return Promise.all(
    list.map(async (ma) => {
      try {
        const { stage, why } = deriveAppraisalStage(ma, await factsFor(ma, listedIds, now));
        return { ...ma, liveStage: stage, stageWhy: why };
      } catch {
        return ma;
      }
    })
  );
}
