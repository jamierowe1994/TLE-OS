/**
 * The words of Admin > Deposits (lib/deposit-audit): where a deposit is, what
 * is missing, what to do. Pure, so the screen and the server say the same.
 */

export type Position =
  | "tle_tds"          // TLE holds it, TDS custodial (England)
  | "tle_mds"          // TLE holds it, mydeposits Scotland
  | "flatfair_plan"    // Flatfair no-deposit plan
  | "landlord_scheme"  // the landlord protected it in their own scheme
  | "landlord_holds"   // let only: the landlord holds it, not ours
  | "transfer"         // management taken over, deposit not moved yet
  | "no_deposit"       // none taken, vacant, fell through, sold
  | "not_found"        // nobody can show where it is
  | "check"            // a status we can't place: someone needs to look
  | "archived";        // not ours any more: PayProp housekeeping

export const POSITION_LABEL: Record<Position, string> = {
  tle_tds: "Held by TLE - TDS",
  tle_mds: "Held by TLE - mydeposits Scotland",
  flatfair_plan: "Flatfair no-deposit plan",
  landlord_scheme: "Landlord's own scheme",
  landlord_holds: "Let only - landlord holds it",
  transfer: "Transfer pending",
  no_deposit: "No deposit",
  not_found: "Not found",
  check: "Needs a look",
  archived: "No longer managed",
};

export type Gap =
  | "ref" | "ref_label" | "amount" | "date" | "cert" | "late" | "unfunded" | "conflict" | "ref_differs" | "no_record"
  | "duplicate" | "wrong_plan" | "flat_live" | "two_live" | "dup_ref" | "not_let_now" | "plan_live" | "ref_elsewhere";

export const GAP_LABEL: Record<Gap, string> = {
  ref: "No scheme reference",
  ref_label: "Reference is a label, not a number",
  amount: "No amount",
  date: "No date protected",
  cert: "No certificate or prescribed information",
  late: "Protected late",
  unfunded: "Registered but not paid in",
  conflict: "A deposit and a no-deposit plan are both live",
  ref_differs: "Flatfair holds a different reference",
  no_record: "Nothing recorded",
  duplicate: "On the OS twice, the records disagree",
  wrong_plan: "Names another home's Flatfair plan",
  flat_live: "Flatfair holds a live TLE deposit here",
  two_live: "Previous tenant's deposit still live",
  dup_ref: "Same reference as another home",
  not_let_now: "Not let now, deposit still recorded",
  plan_live: "Flatfair has a live no-deposit plan here",
  ref_elsewhere: "Reference is another home's deposit",
};

export type ActionKey =
  | "urgent" | "check" | "late" | "released" | "conflict" | "old_live" | "transfer" | "landlord_ref" | "landlord_cert" | "held_details" | "housekeeping";

export const ACTIONS: { key: ActionKey; title: string; says: string }[] = [
  { key: "urgent", title: "Urgent - Not Protected or Can't Be Found", says: "Find the deposit and protect it now, or record where it is." },
  { key: "check", title: "Needs a Look", says: "The record doesn't say where the deposit is, or names a Flatfair plan at another address. Check the scheme and set where it is." },
  { key: "late", title: "Protected Late", says: "More than 30 days (England) or 30 working days (Scotland) between the tenancy start and the date protected. Check both dates against the certificate." },
  { key: "released", title: "Not Let Now - Confirm the Deposit Was Released", says: "The home has nobody in it on the OS, but a deposit is still recorded. Confirm it was released and set the status, or correct the tenants." },
  { key: "conflict", title: "Two Records - Confirm Which Stands", says: "Two records disagree: the OS and Flatfair, two Flatfair deposits, or one home held twice. Confirm which is right and release or correct the other." },
  { key: "old_live", title: "Previous Tenant's Deposit Still Live", says: "The home has been re-let with a new deposit, but the previous tenancy's deposit is still live in Flatfair. Release it to the tenant and landlord, or close it in Flatfair if it was already paid out." },
  { key: "transfer", title: "Deposit Transfer Pending", says: "Management taken over. Confirm with the previous agent or landlord whether each deposit moves to TLE or stays in its scheme." },
  { key: "landlord_ref", title: "Landlord's Own Scheme - Scheme and Reference Needed", says: "Get the scheme and the reference from the landlord." },
  { key: "landlord_cert", title: "Landlord's Own Scheme - Certificate Needed", says: "Upload the landlord's certificate." },
  { key: "held_details", title: "Held by TLE - Details Missing", says: "Fill in what's missing from the scheme's certificate and upload it." },
  { key: "housekeeping", title: "PayProp Housekeeping", says: "Marked as no longer managed. Archive them in PayProp." },
];
