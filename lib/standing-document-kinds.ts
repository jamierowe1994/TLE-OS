/**
 * THE DOCUMENTS KEPT ONCE, FOR EVERY HOME THEY APPLY TO (29 Oct 2026).
 *
 * Client-safe: the Admin page and the Documents tab show the words, the
 * server (lib/standing-documents) keeps the files. A new Scotland-only
 * document is one more line here with `where: "scotland"`, plus its type in
 * lib/doc-types marked `standing`.
 */

export type StandingKind = "easy_read_notes";

export interface StandingKindInfo {
  kind: StandingKind;
  label: string;
  /** Which homes carry it. */
  where: "scotland";
  whereLabel: string;
  says: string;
}

export const STANDING_KINDS: StandingKindInfo[] = [
  {
    /* Michael Healy and Lianna Denholm, 29 Oct 2026: "It's the same document
       for every single property" and "it has to be sent before the lease is
       done". James: "any Scottish property needs that". */
    kind: "easy_read_notes",
    label: "Easy Read Notes",
    where: "scotland",
    whereLabel: "Every Scottish let",
    says: "The statutory Easy Read Notes for a Scottish private residential tenancy. Every Scottish tenant must have them before the lease is signed.",
  },
];

export const isStandingKind = (k: string): k is StandingKind => STANDING_KINDS.some((s) => s.kind === k);

export const standingInfo = (k: StandingKind): StandingKindInfo => STANDING_KINDS.find((s) => s.kind === k)!;

/** The files on which a let's standing documents are shown: the let itself, not a listing, an appraisal or a viewing. */
export const LET_KINDS = new Set(["application", "deal", "property"]);
