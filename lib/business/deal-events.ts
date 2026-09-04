/**
 * The vocabulary of a deal moving. Client-safe: the feed renders these and
 * the watcher writes them, so the words live in one place.
 *
 * Propoly's seven statuses become sentences a person would say. "References
 * back" is the one everybody waits for - Kirstie said on the 4 Sep call that
 * today nobody is told, she finds out by checking or when an agent sends a
 * PLC request. That is the moment this feed exists for.
 */

export type DealEventKind =
  | "deal_started"
  | "appeared"
  | "holding_fee_requested"
  | "referencing_started"
  | "references_back"
  | "agreement_out"
  | "complete"
  | "cancelled"
  | "moved_back"
  | "gone";

export interface DealEvent {
  id: number;
  dealId: string;
  property: string;
  agentEmail: string | null;
  agentName: string | null;
  event: DealEventKind;
  fromStatus: string | null;
  toStatus: string | null;
  at: string;
  toldTo: string | null;
  toldAt: string | null;
  toldNote: string | null;
}

export const STATUS_WORDS: Record<string, string> = {
  start_deal: "Deal started",
  holding_fee: "Holding fee",
  references: "Referencing",
  tenancy_generation: "References back",
  signing_and_move_in_monies: "Out for signing",
  complete: "Complete",
  cancelled: "Cancelled",
};

/** What a status change is called, by where it landed. */
export function kindFor(from: string | null, to: string): DealEventKind {
  if (from == null) return to === "start_deal" ? "deal_started" : "appeared";
  switch (to) {
    case "holding_fee":
      return "holding_fee_requested";
    case "references":
      return "referencing_started";
    case "tenancy_generation":
      return "references_back";
    case "signing_and_move_in_monies":
      return "agreement_out";
    case "complete":
      return "complete";
    case "cancelled":
      return "cancelled";
    default:
      return "moved_back";
  }
}

/** One line for the feed. Property first: that is how Kirstie scans a list. */
export function eventSentence(e: Pick<DealEvent, "event" | "toStatus" | "fromStatus">): string {
  switch (e.event) {
    case "deal_started":
      return "Deal started in Propoly";
    case "appeared":
      return `Now on the board at ${(STATUS_WORDS[e.toStatus ?? ""] ?? e.toStatus ?? "").toLowerCase()}`;
    case "holding_fee_requested":
      return "Holding fee requested";
    case "referencing_started":
      return "Holding fee in, referencing started";
    case "references_back":
      return "References are back - ready for the PLC check";
    case "agreement_out":
      return "Tenancy agreement generated and out for signing";
    case "complete":
      return "Signed and monies in - complete";
    case "cancelled":
      return "Cancelled";
    case "moved_back":
      return `Moved back to ${(STATUS_WORDS[e.toStatus ?? ""] ?? e.toStatus ?? "").toLowerCase()}`;
    case "gone":
      return "No longer in Propoly";
  }
}

/** The moves worth an email to the agent. The rest are feed-only. */
export const TELL_AGENT: ReadonlySet<DealEventKind> = new Set([
  "references_back",
  "agreement_out",
  "complete",
  "cancelled",
]);

export function eventTone(kind: DealEventKind): "ok" | "warn" | "none" {
  if (kind === "references_back" || kind === "agreement_out" || kind === "complete") return "ok";
  if (kind === "cancelled" || kind === "moved_back" || kind === "gone") return "warn";
  return "none";
}
