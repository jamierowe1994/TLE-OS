/**
 * THE SCOTLAND TERMS OF BUSINESS, NOVEMBER 2026 (TLE_TOB_Scotland_Nov26.pdf,
 * Susan Liles, 4 Nov 2026).
 *
 * The October wording (lib/terms/scotland-oct26) with a new page 2, so it is
 * built from it: every clause from the Core Definitions on is October's, word
 * for word. Page 2 gains the Bank Details of Landlord (the first landlord's
 * to give, printed once) and the Landlord Declarations (no gas at the
 * property, a non-UK resident landlord for each landlord, and HMO
 * licensing), and the two LARNs share a line as the PDF prints them.
 *
 * The questions about the home are asked before the contract (asksFirst;
 * James, 5 Nov 2026).
 */

import type { TermsDoc } from "@/lib/terms/types";
import { SCOTLAND_OCT26 } from "@/lib/terms/scotland-oct26";

export const SCOTLAND_NOV26: TermsDoc = {
  ...SCOTLAND_OCT26,
  id: "scotland-nov26",
  edition: "November 2026",
  asksFirst: true,
  details: [
    ...SCOTLAND_OCT26.details,
    {
      key: "noGas",
      label: "No gas at the property",
      kind: "yesno",
      fromAnswer: { id: "gas-supply", yes: ["no"] },
      required: true,
      step: "declarations",
      firstOnly: true,
      landlordOnly: true,
      printYes: "Ticked - no gas at the property",
      printNo: "Not ticked - the property has gas",
    },
    {
      key: "nonUk",
      label: "Non-UK resident landlord",
      ask: "Is your usual home outside the UK?",
      hint: "If it is, we deduct tax from the rent until HMRC approves you to be paid it in full (clause 17).",
      kind: "yesno",
      required: true,
      step: "declarations",
      landlordOnly: true,
      printYes: "Yes - see clause 17",
      printNo: "No",
    },
    {
      key: "licensing",
      label: "HMO licensing",
      ask: "Is the property an HMO that needs an HMO licence?",
      hint: "If it is, we'll need a copy of the licence (clause 18).",
      kind: "yesno",
      required: true,
      step: "declarations",
      firstOnly: true,
      /* The landlord's own declaration, never the agent's (James, 5 Nov 2026). */
      landlordOnly: true,
      printYes: "Yes - see clause 18",
      printNo: "No",
    },
    { key: "bankName", label: "Name of bank", required: true, step: "bank", firstOnly: true, landlordOnly: true },
    { key: "bankAccountName", label: "Account name", hint: "As the bank has it", required: true, step: "bank", firstOnly: true, landlordOnly: true },
    { key: "sortCode", label: "Sort code", required: true, kind: "sortcode", step: "bank", firstOnly: true, landlordOnly: true },
    { key: "accountNumber", label: "Account number", required: true, kind: "account", step: "bank", firstOnly: true, landlordOnly: true },
  ],
  sections: [
    {
      title: "Agreement Details",
      blocks: [
        { kind: "p", text: "The following information provided by the Landlord will be used in the preparation of the tenancy agreement and any other legal documents relating to the Property. Any additional information required will be requested via the Landlord Portal prior to the tenancy. By signing, the Landlord also gives the confirmations in Clause 2 (Agreement & Declaration)." },
        {
          kind: "facts",
          rows: [
            { label: "Partner Agent", value: "{{agentName}}" },
            { label: "Property Address", value: "{{propertyAddress}}" },
          ],
        },
        { kind: "p", text: "<em>Together with any common ways or shared facilities of which the Property forms a part, and fixtures, fittings and furniture belonging to the Landlord.</em>" },
        { kind: "landlords", fields: ["name", "address", "phone", "email"] },
      ],
    },
    { title: "Service and Fees", blocks: [{ kind: "fees" }] },
    {
      title: "Registration",
      blocks: [
        { kind: "facts", rows: [{ label: "LARN - The Letting Experts / Partner Agent", value: "LARN2411003 | {{agentLarn}}" }] },
        { kind: "landlords", fields: ["registrationNumber", "registrationExpiry"] },
      ],
    },
    {
      title: "Bank Details of Landlord",
      blocks: [{ kind: "landlords", fields: ["bankName", "bankAccountName", "sortCode", "accountNumber"], first: true }],
    },
    {
      title: "Landlord Declarations",
      blocks: [
        { kind: "landlords", fields: ["noGas"], first: true },
        { kind: "landlords", fields: ["nonUk"] },
        { kind: "landlords", fields: ["licensing"], first: true },
      ],
    },
    ...SCOTLAND_OCT26.sections.slice(SCOTLAND_OCT26.sections.findIndex((s) => s.title === "Core Definitions")),
  ],
};
