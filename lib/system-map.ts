import "server-only";
import {
  LANDLORD_TRACK,
  TENANT_TRACK,
  VIEWING_TRACK,
  LISTING_TRACK,
  type JourneyStep,
} from "@/lib/journey";
import { MA_STAGES } from "@/lib/market-appraisal";
import { PORTAL_STAGES } from "@/lib/business/propoly-stages";
import { rexConfigured } from "@/lib/rex";
import { payPropConfigured } from "@/lib/payprop";
import { propolyConfigured } from "@/lib/business/propoly";
import { docusealConfigured } from "@/lib/docuseal";
import { resendConfigured } from "@/lib/resend";
import { ghlConfigured } from "@/lib/business/ghl";
import { tegHubConfigured } from "@/lib/business/teg-hub";

/**
 * How the OS works, written for an agent — DERIVED, never authored.
 *
 * James, 29 Aug: "give it all of the context of the system, and that should
 * persist… as the system changes, automatically update it so that if I change
 * a process, it will automatically understand how it works."
 *
 * ── Why this is generated instead of written down ────────────────────────
 *
 * The obvious build is to type a long description of the system into the
 * knowledge base. That is a SNAPSHOT: correct the day it is written and
 * quietly wrong a fortnight later, with nothing on screen to say so. This
 * codebase has just spent two days removing exactly that failure, and putting
 * it back in the assistant's mouth would be worse than having it on a tile —
 * a tile shows a stale number, an assistant states it with confidence.
 *
 * So every line below is read from the same constants the product renders
 * from. The stage names, their order, and the plain-English blurbs are the
 * business's own words, already written next to the code that uses them:
 *
 *   · LANDLORD_TRACK / TENANT_TRACK / VIEWING_TRACK / LISTING_TRACK — the
 *     process spine, from James's own breakdown of Susan's 19-step list
 *   · MA_STAGES — the appraisal pipeline
 *   · PORTAL_STAGES — Propoly's deal stages
 *   · the *Configured() helpers — which systems are actually connected RIGHT
 *     NOW, so he never describes a route that is switched off
 *
 * Change a stage, rename a step, connect a system: the next question he
 * answers already knows. Nobody has to remember to update a document, which is
 * the only version of "keeps itself current" that survives contact with a
 * working week.
 *
 * ── What this deliberately does NOT contain ──────────────────────────────
 *
 * Figures. Not one. The map explains where a number comes from and which
 * screen shows it; it never states the number, because a number in a cached
 * prompt is stale the moment it is written. Ask him what August GCI was and he
 * should say which tab to look at.
 */

/** Rendered once per process, then reused — the constants cannot change under
 *  a running server, so rebuilding it per question is pure waste. */
let cached: string | null = null;

const steps = (track: JourneyStep[]) =>
  track.map((s, i) => `   ${i + 1}. ${s.label} — ${s.detail ?? s.title}`).join("\n");

export function systemMap(): string {
  if (cached) return cached;

  const connected: string[] = [];
  const off: string[] = [];
  const note = (on: boolean, name: string, what: string) =>
    (on ? connected : off).push(`   · ${name} — ${what}`);

  note(rexConfigured(), "REX", "the CRM. Listings, appraisals, leads, viewings, compliance certificates, and the agent roster. Read-only from here.");
  note(propolyConfigured(), "Propoly", "where a deal lives once terms are agreed. It generates the contracts, so it is the source of truth for the pipeline.");
  note(payPropConfigured(), "PayProp", "rent, fees and arrears. Two agencies: Scotland and England & Wales.");
  note(tegHubConfigured(), "TEG Team Hub", "the group's register of people — partner package, bio, headshot.");
  note(docusealConfigured(), "DocuSeal", "e-signature for terms and paperwork.");
  note(resendConfigured(), "Resend", "sending email. Internal addresses only for now.");
  note(ghlConfigured(), "GHL", "nurture campaigns for leads that go quiet.");

  cached = `# How TLE OS works

This is generated from the system itself, so it is current. It describes where
things live and what happens in what order. It does NOT contain any figures —
if someone asks for a number, tell them which screen shows it.

## What an agent has

Dashboard, Leads (tenant and landlord), Market Appraisals, Listings, Viewings,
Applications, Compliance, Emails, Portfolio and Finances. Admin is separate and
only owners and Susan see it.

## The order things happen in

A landlord lead becomes an appraisal, an appraisal becomes a listing, a listing
gets viewings, a viewing produces an application, and an application becomes a
deal in Propoly. Those are five different screens and each has its own steps.

### A landlord lead
${steps(LANDLORD_TRACK)}

   Skipping ahead is normal, not an error. A landlord who books on the first
   call jumps straight to Booked and the steps between are never marked.

### A market appraisal
${MA_STAGES.map((s, i) => `   ${i + 1}. ${s.label} — ${s.blurb}`).join("\n")}

### A listing
${steps(LISTING_TRACK)}

### A tenant lead
${steps(TENANT_TRACK)}

### A viewing
${steps(VIEWING_TRACK)}

### A deal, once terms are agreed (Propoly's own stages)
${PORTAL_STAGES.map((s) => `   · ${s.label} — ${s.blurb}`).join("\n")}

## The systems behind it

Connected right now:
${connected.join("\n") || "   · none"}

${off.length ? `Not connected at the moment, so do not send anyone down these routes:\n${off.join("\n")}` : "Everything is connected."}

## Things that are true about the business

   · Propoly is the source of truth for a deal. REX supplements it.
   · TLE has a maximum spend cap of £100. Every other brand in the group has a
     set payment amount.
   · The referral fee is £150, which is 25% of the setup fee.
   · Prefer the last rental price over the last sale price.
   · Nothing in the OS writes back to REX. It is read-only.

## What you cannot do

You answer questions. You cannot open a page, change a record, send anything,
or look up a specific property, tenant or figure. If someone needs that, say
which screen does it.`;

  return cached;
}
