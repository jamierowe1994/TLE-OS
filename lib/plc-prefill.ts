import "server-only";
import { getApplications, type Application } from "@/lib/applications";

/**
 * Everything the handover already knows before anybody types.
 *
 * ── Why the agent is never asked for this ──────────────────────────────────
 *
 * By the time a pack goes to compliance the property, the people and the
 * move-in date have all been agreed and recorded - on the listing, on the
 * application, in the offer that was accepted. Asking an agent to type them
 * again is not just slow, it is how the address on the pack ends up spelled
 * differently from the address on the certificate, and how a move-in date
 * that moved last week goes to compliance as the date it used to be.
 *
 * So the wizard opens by reading, and the agent's job on the first screen is
 * to CHECK rather than to fill in. That is a different task and a much faster
 * one.
 *
 * ── Where each field genuinely comes from ──────────────────────────────────
 *
 * The application, not the listing. A listing knows the property; only the
 * application knows who is moving in, and the tenant is half of what
 * compliance is checking. Starting from a listing therefore means finding the
 * application ON that listing first, which is what byListing does.
 *
 * `startDate` is REX's own field for the tenancy start, so it IS the move-in
 * date. Where it is missing the wizard asks, rather than guessing from the
 * date the offer was accepted.
 *
 * ── What it does NOT invent ────────────────────────────────────────────────
 *
 * A missing landlord name comes back as null and the screen says so. The
 * temptation is to fall back to the agent, or to the first contact on the
 * property, and both produce a confident wrong name on a compliance record.
 * An empty field an agent fills in is recoverable; a plausible wrong one is
 * not.
 */

export interface Prefill {
  applicationRef: string;
  applicationId: string;
  listingId: number | null;
  address: string;
  /** As printed on the offer, for the "does this match the certificate" check. */
  locality: string;
  tenants: { name: string; email: string | null; isPrimary: boolean }[];
  moveInDate: string | null;
  agentName: string | null;
  rentPcm: number | null;
  /** Things the agent should look at, in the words they would use. */
  warnings: string[];
}

/** REX gives a date as a stamp, a string, or nothing. Only YYYY-MM-DD survives. */
function asYmd(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function shape(a: Application): Prefill {
  const warnings: string[] = [];
  const moveInDate = asYmd(a.startDate);

  if (!moveInDate) {
    warnings.push("No tenancy start date on the application, so you will need to add the move-in date.");
  }
  if (!a.applicants.length) {
    warnings.push("No applicants are recorded on this application.");
  }
  /* Already computed by lib/applications against every adult applicant, not
     just the primary - which is the gap the applications book exists to show.
     Surfacing it HERE means it is seen before the pack is assembled rather
     than after compliance sends it back. */
  if (a.rightToRentIncomplete) {
    warnings.push("Right to Rent is not recorded for every adult applicant. Compliance will ask.");
  }
  if (a.status !== "accepted" && a.status !== "communicated") {
    warnings.push(`This application is "${a.statusLabel}", not accepted. Check before you hand it over.`);
  }

  return {
    applicationRef: a.id,
    applicationId: a.id,
    listingId: a.listingId,
    address: a.property,
    locality: a.locality,
    tenants: a.applicants.map((p) => ({
      name: p.name,
      email: p.email,
      isPrimary: p.isPrimary,
    })),
    moveInDate,
    agentName: a.agent,
    rentPcm: a.offerAmount,
    warnings,
  };
}

/**
 * Find the application to hand over.
 *
 * `getApplications` reads the live book from REX; there is no fetch-one
 * endpoint on it, so this pulls a page and picks. That is fine at 300 rows and
 * would not be at 3,000 - if this ever gets slow, the fix is a by-id read in
 * lib/applications rather than a bigger limit here.
 */
export async function prefillFor(opts: {
  applicationId?: string;
  listingId?: string;
}): Promise<Prefill | null> {
  const book = await getApplications(300);

  if (opts.applicationId) {
    const found = book.find((a) => String(a.id) === String(opts.applicationId));
    return found ? shape(found) : null;
  }

  if (opts.listingId) {
    const on = book.filter((a) => String(a.listingId ?? "") === String(opts.listingId));
    if (!on.length) return null;
    /* Newest first. A property that has been let before carries old
       applications, and the one being handed over is always the latest. */
    const latest = [...on].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
    const shaped = shape(latest);
    if (on.length > 1) {
      shaped.warnings.push(
        `There are ${on.length} applications on this listing. This is the most recent one — check it is the right one.`
      );
    }
    return shaped;
  }

  return null;
}
