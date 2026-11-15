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
import { screensSection } from "@/lib/screens";
import { rexConfigured } from "@/lib/rex";
import { payPropConfigured } from "@/lib/payprop";
import { propolyConfigured } from "@/lib/business/propoly";
import { docusealConfigured } from "@/lib/docuseal";
import { resendConfigured } from "@/lib/resend";
import { ghlConfigured } from "@/lib/business/ghl";
import { tegHubConfigured } from "@/lib/business/teg-hub";
import { AGENT_GUIDES } from "@/lib/agent-guides";
import { GUIDES as OFFICE_GUIDES } from "@/lib/pretenancy-guides";
import type { Guide } from "@/lib/guide-types";

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

/**
 * A track, with the button that moves each step on.
 *
 * `cta` is the literal label rendered on the next-action button in the lead
 * drawer, so quoting it here is the difference between "move it to the next
 * stage" and "press Book the appraisal". It is derived like everything else:
 * change the wording in lib/journey.ts and the assistant says the new words.
 *
 * Steps whose action is "none" are ticks — something an agent did off-system
 * and is recording — so their button is a confirmation and not worth quoting.
 */
const steps = (track: JourneyStep[]) =>
  track
    .map((s, i) => {
      const how = s.action === "none" ? "" : ` Button: "${s.cta}".`;
      return `   ${i + 1}. ${s.label} — ${s.detail ?? s.title}${how}`;
    })
    .join("\n");

/**
 * The guides as plain text for the prompt (14 Nov 2026). Steve was never given
 * them, so he told Joe "there's no training section", learned a wrong answer
 * on how to start a PLC from the team, and repeated it to four agents; the
 * guide had the right one all along. Pictures are left out; the words carry
 * the process.
 */
function guidesText(guides: Guide[], heading: string): string {
  const body = guides.map((g) => {
    const lines = [`### ${g.title} (${g.href})`, g.blurb];
    if (g.intro) lines.push(g.intro);
    g.steps.forEach((st, i) => {
      lines.push(`${i + 1}. ${st.title}. ${st.body}`);
      if (st.how) lines.push(`   How it works: ${st.how}`);
      if (st.why) lines.push(`   Why: ${st.why}`);
      if (st.sends) lines.push(`   What it sends: ${st.sends}`);
    });
    return lines.join("\n");
  });
  return `### ${heading}\n\n${body.join("\n\n")}`;
}

export function systemMap(): string {
  if (cached) return cached;

  const connected: string[] = [];
  const off: string[] = [];
  const note = (on: boolean, name: string, what: string) =>
    (on ? connected : off).push(`   · ${name} — ${what}`);

  /* "Read-only from here", and "Nothing in the OS writes back to REX" below,
     stood until 4 Nov 2026, long after listings, notes and contacts began
     saving back, and Steve sent a how-do-I about taking a home off the market
     to REX (see the Listings entry in lib/screens). */
  note(rexConfigured(), "REX", "the CRM. Listings, appraisals, leads, viewings, compliance certificates, and the agent roster. The OS reads all of it and saves some of it back: each screen's entry above says what.");
  note(propolyConfigured(), "Propoly", "where a deal lives once terms are agreed. It generates the contracts, so it is the source of truth for the pipeline.");
  note(payPropConfigured(), "PayProp", "rent, fees and arrears. Two agencies: Scotland and England & Wales.");
  note(tegHubConfigured(), "TEG Team Hub", "the group's register of people — partner package, bio, headshot.");
  note(docusealConfigured(), "DocuSeal", "e-signature for terms and paperwork.");
  /* 14 Nov 2026: "internal addresses only" had not been true since customer
     email went live behind its Admin switch. */
  note(resendConfigured(), "Resend", "the OS's own sender for automatic emails to landlords and tenants, as far as the Admin switches allow. An email an agent writes goes from their own Outlook.");
  note(ghlConfigured(), "GHL", "nurture campaigns for leads that go quiet.");

  cached = `# How TLE OS works

This is generated from the system itself, so it is current. It describes where
things live and what happens in what order. It does NOT contain any figures —
if someone asks for a number, tell them which screen shows it.

## Answer with the process FIRST, then what the OS does today

These are two different things and you must not run them together.

TLE's PROCESS is real — it is how the business actually works, whether or not
the software does that bit yet. Teach it. It is the section below.

What the OS currently DOES is narrower in places. It went live on 14 October
2026 and is still being added to every week, so a few named buttons are behind
an Admin switch or not built yet. That is recorded per
screen further down, and it is not a failure to mention — an agent who is told
plainly to do this one in REX for now gets on with their day. An agent who is
sent to press a button that does nothing loses ten minutes and stops trusting
you about anything.

So the shape of a good answer to "how do I do X" is: here is how it works, here
is the screen, and here is the part you still do by hand. Never leave the last
one out, and never invent it either — if the screen notes below do not mention
a limitation, do not warn about one.

${screensSection()}

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
   · Fees, referral amounts and spend caps are in the knowledge base. Quote
     them from there, never from memory, and say where the figure comes from.
   · Prefer the last rental price over the last sale price.
   · Plenty of the OS saves back to REX, and each screen's entry above says
     what. Never say the OS cannot do something, or send anybody to REX to do
     it, without checking that screen's entry first.

## The office's own workspaces (not on an agent's menu)

Only the people named can open these. When an agent asks about one, say who
handles it rather than sending them there.

   · [Pre-tenancy](/pre-tenancy) - Kirstie's desk: Dashboard, Board, PLC
     queue, Move-ins and Pipeline, ID checks, Right to rent, Knowledge and
     Clean sweep. Every let from accepted to moved in, and the PLC packs the
     agents send.
   · [Compliance desk](/compliance-desk) - Michael and Josel: Overview,
     Property Compliance, Agent Chases, the gas and electric check, Section 8
     and 13 notices, the PLC queue, ID checks, agent compliance, works orders
     and Clean sweep. Certificates uploaded by agents wait here as To Verify
     until they are checked.
   · [Company figures](/company-figures) - the owners and super admins: the
     business's own numbers, the portfolio split by region.
   · [Marketing hub](/marketing-hub) - Francesca: nurture campaigns, paid
     leads and social, emails and events, templates, the file store and your
     knowledge base.
   · [Guides](/guides) - everyone: the how-to guides below, with pictures.
   · [Profile](/profile) - everyone: their own details, photo, the questions
     on their pre-appraisal, their viewing reminder text, which alerts they
     get, and the light or dark look.
   · Admin - James and Susan only: people, permissions, switches and tickets.
     Never send anybody there.

## How-to guides, as the agents and the office read them

These are TLE's own step-by-step guides to the main processes, the same words
the team read under Tools, Learning, Guides. Where a guide covers what you are
asked - starting the PLC check, an appraisal, a listing, viewings, an
application, the pre-tenancy desk - answer from it, using its button names, and
it beats anything said in the knowledge base or remembered from the team.

${guidesText(AGENT_GUIDES, "For agents")}

${guidesText(OFFICE_GUIDES, "For the pre-tenancy and compliance office")}

## What you can and cannot do

You can look things up with your tools (a home, its people, certificates,
viewings, applications, jobs, their diary, their own inbox), propose a change
as a card the person presses, fill in or point at things on their screen, and
open a file for them. You cannot press anything yourself, publish, invite,
delete, or change Admin. You cannot read pictures, screenshots or PDFs: when
one is sent, say it has reached the office with their question and answer from
what they typed.`;

  return cached;
}
