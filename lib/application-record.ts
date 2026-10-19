import type { AppRecord, Check } from "@/components/ApplicationDrawer";
import type { Application } from "@/lib/applications";

/**
 * An application from the book, as its page reads it. Lifted out of the
 * Applications board (12 Oct 2026) when the file became its own page,
 * /applications/<id>, so the board and the page build it the same way.
 */

const gbp = (n: number | null) => (n == null ? "—" : `£${n.toLocaleString("en-GB")}`);

/** A let in progress: accepted in REX, or by the agent in the OS (lib/offer-decisions). */
export const isLet = (a: Application) => a.status === "accepted" || (a.status !== "unsuccessful" && a.osDecision?.decision === "accepted");

/** The four checks, read off the live record rather than counted. */
export function checksFor(a: Application): Check[] {
  const lead = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
  const k = lead?.keyInfo;
  const everyone = a.applicants.length;
  const answered = a.applicants.filter((p) => p.keyInfo?.rightToRent === true).length;
  return [
    {
      label: `Right to rent - ${answered} of ${everyone} applicant${everyone === 1 ? "" : "s"}`,
      done: everyone > 0 && answered === everyone,
      note:
        answered < everyone
          ? "The form only ever asks the lead applicant. The others were never asked."
          : undefined,
    },
    {
      label: "Landlord reference, last 2 years",
      done: k?.landlordRef === true,
      note: k?.landlordRef === false ? "None available. Worth a guarantor conversation." : undefined,
    },
    {
      label: "Guarantor available if needed",
      done: k?.guarantor === true,
      note:
        k?.guarantor === true && lead?.guarantorCount === 0
          ? "Offered, but the form doesn't ask who, so nobody is named yet."
          : undefined,
    },
    {
      label: "No adverse credit",
      done: k?.adverseCredit === false,
      note: k?.adverseCredit === true ? k.adverseCreditNote?.slice(0, 180) ?? "Disclosed." : undefined,
    },
  ];
}

export function toAppRecord(a: Application): AppRecord {
  return {
    id: a.id,
    tenant: (a.applicants.find((p) => p.isPrimary) ?? a.applicants[0])?.name ?? "—",
    applicants: a.applicants.map((p) => ({
      name: p.name,
      contactId: p.contactId,
      email: p.email,
      phone: p.phone,
      isPrimary: p.isPrimary,
      income: p.incomePerYear,
      employment: p.keyInfo?.employment ?? p.employmentRex,
      job: p.keyInfo?.job ?? null,
      company: p.keyInfo?.company ?? null,
      rightToRent: p.keyInfo?.rightToRent ?? null,
      landlordRef: p.keyInfo?.landlordRef ?? null,
      guarantor: p.keyInfo?.guarantor ?? null,
      adverseCredit: p.keyInfo?.adverseCredit ?? null,
    })),
    property: a.property,
    swapPortion: a.swap?.rentPortion != null ? gbp(a.swap.rentPortion) : null,
    swapKind: a.swap ? a.swap.kind ?? "swap" : null,
    propertyId: a.propertyId,
    listingId: a.listingId != null ? String(a.listingId) : null,
    locality: a.locality,
    image: a.image,
    rent: a.offerAmount ? `${gbp(a.offerAmount)} pcm` : "—",
    moveIn: a.startDate ?? "—",
    /* Accepted in the OS is accepted on the page too (Sean, 15 Oct 2026): the PLC tile sat greyed "once the offer is accepted" on a let he had accepted. */
    stageKey: isLet(a) ? "accepted" : a.status,
    ticked: 0,
    agent: a.agent ?? "—",
    flag: a.affordabilityPct != null && a.affordabilityPct > 40 ? `Rent is ${a.affordabilityPct.toFixed(0)}% of income` : undefined,
    activity: [
      a.dateReceived ? { when: a.dateReceived, what: "Application received.", by: a.createdBy ?? "—" } : null,
      a.dateAccepted ? { when: a.dateAccepted, what: "Landlord accepted.", by: a.agent ?? "—" } : null,
      /* "N/A" is what the form writes when nothing was said - not a comment. */
      a.conditions && !/^\s*(n\/?a|none|-)\s*\.?$/i.test(a.conditions)
        ? { when: "with the application", what: a.conditions, by: "Applicant", note: true }
        : null,
    ].filter((x): x is NonNullable<typeof x> => x !== null),
  };
}
