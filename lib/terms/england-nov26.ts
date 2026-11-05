/**
 * THE ENGLAND TERMS OF BUSINESS, NOVEMBER 2026 (TLE_TOB_England_Nov26.pdf,
 * Susan Liles, 4 Nov 2026).
 *
 * The October wording (lib/terms/england-oct26) with a new page 2, so it is
 * built from it rather than copied: every clause from the Core Definitions on
 * is October's, word for word, except the PRS Database definition, which now
 * names the Landlord Number and Rental Property Number. Page 2 gains:
 *
 *   Registration          the PRS Database landlord number (each landlord's
 *                         own) and the rental property number (the home's);
 *                         neither required yet, as the Database opens region
 *                         by region from 15 December 2026.
 *   Bank Details          the account the rent goes to: the first landlord's
 *                         to give, printed once (James, 5 Nov 2026: "add bank
 *                         details to the bottom of the section").
 *   Landlord Declarations no gas at the property, a non-UK resident
 *                         landlord (each landlord for themselves) and
 *                         licensing, which the PLC check reads (Susan, 4 Nov
 *                         2026: "Check TOB, Page 2 Declaration").
 *
 * And the questions about the home are asked before the contract, not after
 * it (asksFirst; James, 5 Nov 2026).
 */

import type { Section, TermsDoc } from "@/lib/terms/types";
import { ENGLAND_OCT26 } from "@/lib/terms/england-oct26";

const PRS_NOV26 =
  "<strong>PRS Database</strong> - From 15 December 2026, all private landlords in England will be required to register themselves and each rental property on the government’s national Private Rented Sector Database (the “PRS Database”) through the government’s Register Your Rental Property service before marketing or letting. Registration is rolling out region by region, with landlords having three months to register once their region opens. The annual registration fee is £65 per property, renewed each year. Landlords and property advertisements must include the Landlord Number and Rental Property Number once registration is in force for their region. Registration is the Landlord’s sole responsibility. Current regional registration dates and guidance are available at www.gov.uk/guidance/register-your-rental-property.";

/** October's clauses from the Core Definitions on, with the new PRS definition. */
const clauses: Section[] = ENGLAND_OCT26.sections
  .slice(ENGLAND_OCT26.sections.findIndex((s) => s.title === "Core Definitions"))
  .map((s) =>
    s.title !== "Core Definitions"
      ? s
      : { ...s, blocks: s.blocks.map((b) => (b.kind === "list" ? { ...b, items: b.items.map((t) => (t.startsWith("<strong>PRS Database</strong>") ? PRS_NOV26 : t)) } : b)) }
  );

export const ENGLAND_NOV26: TermsDoc = {
  ...ENGLAND_OCT26,
  id: "england-nov26",
  edition: "November 2026",
  asksFirst: true,
  details: [
    ...ENGLAND_OCT26.details,
    { key: "registrationNumber", label: "PRS Database landlord number", hint: "Once your region's PRS Database is open. Leave it blank if you haven't registered yet.", required: false, step: "registration" },
    { key: "rentalPropertyNumber", label: "PRS Database rental property number", hint: "The number the PRS Database gives this home. Leave it blank if it isn't registered yet.", required: false, step: "registration", firstOnly: true },
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
      label: "Licensing / HMO",
      ask: "Is the property subject to selective, additional or mandatory licensing, or is it an HMO?",
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
        { kind: "landlords", fields: ["registrationNumber"] },
        { kind: "landlords", fields: ["rentalPropertyNumber"], first: true },
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
    ...clauses,
  ],
};
