/**
 * THE KINDS OF LANDLORD A HOME CAN CHANGE TO (Dan Richards, 17 Oct 2026,
 * ticket 083d7752). Client-safe: the Change landlord steps show these, the
 * server checks them (lib/landlord-change).
 *
 * "I have 2 properties that are actually in company names so I need to change
 * the landlord record from a private person to a company ... the 'landlord
 * type' selection process [should] have at least: Company Ownership,
 * Executor/Probate, New Private Owner."
 *
 * Each kind brings its own papers for the PLC check. A company's are Dan's
 * list: ID and AML for each of at least two directors, up to three files from
 * Companies House (he takes two screenshots, People and the overview) and the
 * Certificate of Incorporation. They are filed as the home's documents
 * (os_file_documents), the same place the PLC check already reads a
 * landlord's ID and AML from.
 */

export type LandlordKind = "company" | "executor" | "private";

export const LANDLORD_KINDS: { kind: LandlordKind; label: string; sub: string; icon: string }[] = [
  { kind: "company", label: "Company ownership", sub: "A limited company owns the home", icon: "pack/building" },
  { kind: "executor", label: "Executor or probate", sub: "The owner has died and an executor acts for the estate", icon: "file-contract" },
  { kind: "private", label: "New private owner", sub: "Sold or passed to another person", icon: "user" },
];

export const KIND_LABEL: Record<LandlordKind, string> = {
  company: "Company",
  executor: "Executor / probate",
  private: "Private owner",
};

export const isLandlordKind = (k: unknown): k is LandlordKind => k === "company" || k === "executor" || k === "private";

export type Director = { name: string; email: string | null; phone: string | null };

/** One paper the PLC check needs for this kind of landlord. `who` names the person on it. */
export type PaperSlot = { key: string; type: string; label: string; who?: string; many?: number };

export function papersFor(kind: LandlordKind, p: { name: string; contactName?: string | null; directors?: Director[] }): PaperSlot[] {
  if (kind === "company") {
    const directors = (p.directors ?? []).filter((d) => d.name.trim());
    const two = directors.length >= 2 ? directors : [...directors, ...[{ name: "" }, { name: "" }].slice(directors.length)];
    const slots: PaperSlot[] = [];
    two.forEach((d, i) => {
      const who = `Director ${i + 1}${d.name ? ` - ${d.name}` : ""}`;
      slots.push({ key: `d${i}-id`, type: "landlord_id", label: `${who}: ID`, who });
      slots.push({ key: `d${i}-aml`, type: "landlord_aml", label: `${who}: AML check`, who });
    });
    slots.push({ key: "ch", type: "company_registration", label: "Companies House registration", who: p.name, many: 3 });
    slots.push({ key: "inc", type: "incorporation_certificate", label: "Certificate of Incorporation", who: p.name });
    return slots;
  }
  if (kind === "executor") {
    const who = `Executor${p.contactName ? ` - ${p.contactName}` : ""}`;
    return [
      { key: "ex-id", type: "landlord_id", label: `${who}: ID`, who },
      { key: "ex-aml", type: "landlord_aml", label: `${who}: AML check`, who },
      { key: "probate", type: "grant_of_probate", label: "Grant of probate or letters of administration", who: p.name },
    ];
  }
  return [
    { key: "pr-id", type: "landlord_id", label: `${p.name}: ID`, who: p.name },
    { key: "pr-aml", type: "landlord_aml", label: `${p.name}: AML check`, who: p.name },
    { key: "pr-own", type: "landlord_proof_of_ownership", label: "Proof of ownership", who: p.name },
  ];
}

/** What the screens are given for a changed landlord. */
export type ChangedLandlord = {
  id: string;
  kind: LandlordKind;
  name: string;
  companyNumber: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  directors: Director[];
  lateOwner: string | null;
  previous: { name: string; email: string | null; phone: string | null } | null;
  changedBy: string;
  changedAt: string;
};
