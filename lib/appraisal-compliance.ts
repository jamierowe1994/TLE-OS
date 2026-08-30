import type { MaterialInfo } from "@/lib/matinfo";

/**
 * WHAT WE ALREADY KNOW ABOUT THIS PROPERTY'S COMPLIANCE, AND WHAT WE DON'T.
 *
 * At appraisal time the property is not on our book, so REX holds no
 * certificates for it — see the note in lib/compliance on where certificates
 * live. What Homesearch's `matinfo/basic` DOES carry is the EPC, straight from
 * the national register, and that is worth more than it looks: an EPC lasts
 * ten years, and an expired one is a live problem the landlord probably does
 * not know they have.
 *
 * Measured on the test record, 12 Dover Close: assessed 10 August 2015, so it
 * expired 10 August 2025. That is a real finding on a real property, produced
 * by arithmetic we were already holding the inputs for.
 *
 * ── The legal test, and what is NOT the legal test ────────────────────────
 *
 * MEES: a domestic property in England and Wales cannot lawfully be let at
 * EPC F or G without a registered exemption. That is the law today and it is
 * what this file tests.
 *
 * EPC C is NOT law. It is a government proposal — new tenancies from 2030, all
 * tenancies from 2033 — and it has not been legislated. It appears here as a
 * heads-up and is labelled as a proposal every time, because telling a landlord
 * they are breaking a rule that does not exist is worse than saying nothing.
 */

export type ComplianceState = "ok" | "warn" | "fail" | "unknown";

export interface ComplianceItem {
  label: string;
  state: ComplianceState;
  /** The finding, in a sentence an agent can read out. */
  detail: string;
  /** Where the fact came from. An agent will be asked. */
  source: string;
}

const RATING_ORDER = ["A", "B", "C", "D", "E", "F", "G"];

/** EPCs are valid for ten years from the assessment date. */
function expiryOf(assessed: string): Date | null {
  const d = new Date(assessed);
  if (Number.isNaN(d.getTime())) return null;
  const e = new Date(d);
  e.setFullYear(e.getFullYear() + 10);
  return e;
}

const fmt = (d: Date) =>
  d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * What Homesearch can tell us. Everything here is derived from the EPC
 * register — nothing is invented, and a missing input produces "unknown"
 * rather than a guess.
 */
export function knownCompliance(m: MaterialInfo | null, now = new Date()): ComplianceItem[] {
  const out: ComplianceItem[] = [];
  const c = m?.compliance ?? null;
  const rating = (c?.epcRating ?? "").trim().toUpperCase();
  const assessed = c?.epcAssessedOn ?? null;

  /* ── The certificate itself ─────────────────────────────────────────── */
  if (!assessed && !rating) {
    out.push({
      label: "EPC",
      state: "unknown",
      detail:
        "No EPC on the register for this address. One is needed before it can be marketed to let — and its absence may simply mean the address did not match, so check before telling the landlord they have none.",
      source: "Homesearch / EPC register",
    });
  } else {
    const exp = assessed ? expiryOf(assessed) : null;
    if (exp) {
      const days = Math.round((exp.getTime() - now.getTime()) / 86_400_000);
      out.push(
        days < 0
          ? {
              label: "EPC certificate",
              state: "fail",
              detail: `Expired ${fmt(exp)} — ${Math.abs(days)} days ago. A new assessment is needed before the property can be marketed to let.`,
              source: "EPC register, assessed " + fmt(new Date(assessed!)),
            }
          : days < 180
            ? {
                label: "EPC certificate",
                state: "warn",
                detail: `Expires ${fmt(exp)}, in ${days} days. Worth booking the reassessment now rather than at the point of letting.`,
                source: "EPC register, assessed " + fmt(new Date(assessed!)),
              }
            : {
                label: "EPC certificate",
                state: "ok",
                detail: `Valid until ${fmt(exp)}.`,
                source: "EPC register, assessed " + fmt(new Date(assessed!)),
              }
      );
    }

    /* ── MEES, which is the one that stops a letting ────────────────────── */
    if (rating && RATING_ORDER.includes(rating)) {
      const failsNow = rating === "F" || rating === "G";
      const belowC = RATING_ORDER.indexOf(rating) > RATING_ORDER.indexOf("C");
      out.push({
        label: "Minimum energy efficiency (MEES)",
        state: failsNow ? "fail" : belowC ? "warn" : "ok",
        detail: failsNow
          ? `Rated ${rating}. A domestic property cannot lawfully be let at F or G without a registered exemption — this needs work before it can go on the market.`
          : belowC
            ? `Rated ${rating}, which meets the current legal minimum of E. Government has PROPOSED raising it to C for new tenancies from 2030 and all tenancies from 2033; that is not law yet, but it is worth the landlord knowing.`
            : `Rated ${rating}, comfortably above the legal minimum of E and already at or above the proposed future C standard.`,
        source: "EPC register",
      });
      if (c?.potentialRating && failsNow) {
        out.push({
          label: "Potential after improvement",
          state: "ok",
          detail: `The assessor rated the potential at ${c.potentialRating}${
            c.potentialScore ? ` (${c.potentialScore})` : ""
          } — so the work needed to make this lettable is on the certificate already.`,
          source: "EPC register",
        });
      }
    }
  }

  /* ── Facts that are not certificates but change the conversation ────── */
  /* "Recorded as None" is not a finding, it is a row. Only a flood risk that
     is actually a risk earns space on a page an agent reads out loud. */
  if (c?.floodRisk && !/^(none|no risk|very low|negligible)$/i.test(c.floodRisk.trim())) {
    out.push({
      label: "Flood risk",
      state: /high|significant|medium/i.test(c.floodRisk) ? "warn" : "ok",
      detail: `Recorded as ${c.floodRisk}. This is a postcode-level indication, not a survey of the property, and must not be given as an answer to the material-information flood question.`,
      source: "Homesearch",
    });
  }
  if (c?.conservationArea) {
    out.push({
      label: "Conservation area",
      state: "warn",
      detail: `${c.conservationArea}. Consent may be needed for external work — including anything the EPC improvements would require, such as windows or external insulation.`,
      source: "Homesearch",
    });
  }
  if (typeof c?.leaseYearsRemaining === "number" && c.leaseYearsRemaining < 85) {
    out.push({
      label: "Lease remaining",
      state: c.leaseYearsRemaining < 70 ? "warn" : "ok",
      detail: `${c.leaseYearsRemaining} years left. Under 80 the lease starts costing money to extend, and a lender will notice before a tenant does.`,
      source: "Homesearch",
    });
  }

  return out;
}

/**
 * What we cannot know from any feed, and will have to ask the landlord for.
 *
 * These are deliberately NOT rendered as failures. The property is not on our
 * book; the landlord may hold every one of them. Showing an unknown as a red
 * cross would tell a landlord they are non-compliant on the strength of us not
 * having looked, which is exactly the confidently-wrong shape this project
 * keeps being bitten by.
 */
export const OUTSTANDING_AT_APPRAISAL: Array<{ label: string; why: string }> = [
  {
    label: "Gas safety certificate (CP12)",
    why: "Annual, if there is any gas appliance. Gas Safe registers engineers, not certificates — there is no public record to check, so this can only come from the landlord.",
  },
  {
    label: "Electrical safety report (EICR)",
    why: "Every five years, and required for all tenancies. No public register exists.",
  },
  {
    label: "Smoke and carbon monoxide alarms",
    why: "One smoke alarm per storey, and a CO alarm in any room with a fixed combustion appliance. Checked on the first day of the tenancy.",
  },
  {
    label: "Legionella risk assessment",
    why: "Expected of a landlord as part of the general duty of care. Not a certificate anybody issues centrally.",
  },
  {
    label: "Deposit protection",
    why: "Within 30 days, with prescribed information served. The schemes hold this but disclose nothing to third parties.",
  },
  {
    label: "Right to Rent checks",
    why: "England only, before the tenancy starts.",
  },
  {
    label: "How to Rent guide",
    why: "The current edition, served at the start — the version matters, and serving a superseded one can invalidate a section 21.",
  },
  {
    label: "Licensing",
    why: "Mandatory HMO licensing is nationwide; selective and additional schemes are per-council and change often. Worth checking the council's register for this address before quoting a fee.",
  },
];
