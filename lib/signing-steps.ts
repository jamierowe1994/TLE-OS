/**
 * What a landlord is actually being asked to do, in their words.
 *
 * DocuSeal walks a signer field by field and shows them the field's NAME -
 * "Landlord Signed Name", "Cooling-Off Waiver Signature". Those names are
 * written for the person building the template, not the person signing, and
 * a landlord meeting "Cooling-Off Waiver Signature" has been handed homework.
 *
 * So the right-hand column says what each step is for. James, 15 Sep 2026:
 * "you'll see the full list of the things that you need to sign based on the
 * contract", beside the document rather than on top of it.
 *
 * ── The order is the template's, and it was read off the live form ────────
 *
 * Not guessed: the September England terms were opened and every step walked
 * (scripts/build-tob-template.mjs builds them in this order, DocuSeal presents
 * them in it). If the contract is ever rebuilt with the fields in a different
 * order this list goes stale silently, which is why the surface CHECKS - it
 * compares the number of steps DocuSeal is showing against this list and, when
 * they disagree, falls back to DocuSeal's own labels rather than mislabelling
 * somebody's signature.
 */

export type SigningStep = {
  /** The template's field name, so a drift can be spotted. */
  field: string;
  /** What the landlord reads. */
  label: string;
  /** One line under it. Empty for the obvious ones. */
  sub?: string;
  /** Not required to complete the contract. Said out loud, never hidden. */
  optional?: boolean;
};

/** The landlord's five, in the order DocuSeal presents them. */
export const LANDLORD_SIGNING: SigningStep[] = [
  { field: "Landlord Signature", label: "Your signature", sub: "Draw it once - we place it on the agreement" },
  { field: "Landlord Signed Name", label: "Your name", sub: "Printed under the signature" },
  { field: "Landlord Signed Date", label: "Today's date" },
  {
    field: "Cooling-Off Waiver Signature",
    label: "Start straight away",
    sub: "Only if you want us to begin before the 14 day cancellation period ends",
    optional: true,
  },
  { field: "Cooling-Off Waiver Date", label: "The date you agreed to that", optional: true },
];

/**
 * The agent's five. They sign first, and they fill the two boxes the OS
 * cannot know: the landlord's own address, and anything agreed at the table.
 */
export const AGENT_SIGNING: SigningStep[] = [
  { field: "Landlord Address", label: "Their home address", sub: "Not the property - the address the landlord lives at" },
  { field: "Additional Fees Agreed", label: "Anything else agreed", sub: "Leave as None if nothing was" },
  { field: "Agent Signature", label: "Your signature" },
  { field: "Agent Signed Name", label: "Your name" },
  { field: "Agent Signed Date", label: "Today's date" },
];
