/**
 * Portals — every customer-facing and new-starter surface, in one place you
 * can click into.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * James demos this product constantly, and the things worth showing were
 * scattered: the tenant portal was two links on a tab inside his profile, the
 * landlord deck needed a token he had to mint, the emails could only be seen
 * through an overlay on a different admin page, and the onboarding preview
 * lived behind a rail entry called something else. Finding them meant
 * remembering them.
 *
 * So: three folders, and everything under them opens in one click.
 *
 * ── Everything here is REAL ───────────────────────────────────────────────
 *
 * No route in this file is aspirational. Each one was checked to resolve
 * before it was written down, because a hub whose links 404 is worse than no
 * hub - it fails in front of exactly the audience it was built to impress.
 * If a surface does not exist yet, it belongs in `missing` below, which is
 * rendered as an honest gap rather than a link.
 *
 * ── Two kinds of thing ────────────────────────────────────────────────────
 *
 * `open`  - a page you go and look at. Customer-facing ones carry ?from=admin
 *           so they can offer a way back; see components/PreviewReturnBar.
 * `email` - rendered inline from the catalogue, because an email is a picture
 *           of a thing that arrives elsewhere and there is nowhere to "go".
 */

export type PortalItem =
  | {
      kind: "open";
      id: string;
      name: string;
      blurb: string;
      href: string;
      /** Said plainly when the thing is a wireframe or carries sample data. */
      caveat?: string;
    }
  | {
      kind: "email";
      id: string;
      name: string;
      blurb: string;
      /** An id in lib/email/tle-emails.ts. Rendered via /api/admin/emails. */
      emailId: string;
      caveat?: string;
    };

export type PortalFolder = {
  slug: string;
  name: string;
  icon: string;
  blurb: string;
  items: PortalItem[];
  /** Named gaps. Better on the screen than discovered during a demo. */
  missing?: string[];
};

/* The customer portals run on sample people - Sophie the tenant, Raj the
   landlord - and neither has a sign-in yet: os_portal_accounts is declared and
   used by nothing, so the link is the credential exactly as the pre-appraisal
   deck already works. Saying so on each card stops a demo implying a login
   that is not there. */
const SAMPLE_TENANT = "Runs on a sample tenant, Sophie. There is no tenant sign-in yet, so the password screen is a wireframe.";
const SAMPLE_LANDLORD = "The sample landlord, Raj, kept for walking people through. The live portal at /landlord shows a real landlord their real properties once they have signed in.";

export const PORTAL_FOLDERS: PortalFolder[] = [
  {
    slug: "tenant",
    name: "Tenant",
    icon: "user",
    blurb:
      "What a tenant meets: the email after they book a viewing, the passport they fill in, and the portal they land in.",
    items: [
      {
        kind: "email",
        id: "tenant-invite",
        name: "The email they get",
        blurb:
          "Goes out when a viewing is booked, and asks them to start their passport. This is the front door to everything else on this page.",
        emailId: "tenant-passport-invite",
        caveat: "Written and rendering, but no send path is wired yet.",
      },
      {
        kind: "open",
        id: "tenant-welcome",
        name: "Setting up their account",
        blurb: "Where the link in that email lands them: choose a password, and the GDPR notice.",
        href: "/tenant/welcome?from=admin",
        caveat: SAMPLE_TENANT,
      },
      {
        kind: "open",
        id: "tenant-portal",
        name: "The portal itself",
        blurb:
          "Their home: viewings they can move, homes picked for them, offers, and the parts that unlock as they get further along.",
        href: "/tenant?from=admin",
        caveat: SAMPLE_TENANT,
      },
      {
        kind: "open",
        id: "tenant-passport",
        name: "The tenant passport",
        blurb:
          "The form they fill in once and reuse. Make a throwaway to open, type in, or send to somebody.",
        href: "/admin/tenant-passport",
      },
      {
        kind: "open",
        id: "tenant-apply",
        name: "Applying for a property",
        blurb: "The application form, brought in-house off Howard's JotForm. Every adult asked Right to Rent.",
        href: "/tenant/apply?from=admin",
        caveat: "Sample property. Live, the property arrives with the link's token.",
      },
      {
        kind: "open",
        id: "tenant-feedback",
        name: "After a viewing",
        blurb: "Howard's four questions, and an offer capped at the asking rent.",
        href: "/tenant/feedback?from=admin",
        caveat: "Sample viewing.",
      },
      {
        kind: "open",
        id: "tenant-feedback-email",
        name: "The feedback email",
        blurb: "How that request arrives in their inbox.",
        href: "/tenant/feedback/email?from=admin",
      },
    ],
    missing: [
      "No tenant sign-in. The link in the email is the credential, and os_portal_accounts is declared but unused.",
      "The passport invite has no send path, so nobody receives one automatically yet.",
    ],
  },
  {
    slug: "landlord",
    name: "Landlord",
    icon: "home",
    blurb:
      "What a landlord meets around an appraisal: the emails before and after, the presentation itself, and their property file.",
    items: [
      {
        kind: "email",
        id: "landlord-pre",
        name: "Before the visit",
        blurb: "Sent the day before an appraisal, from the pre-appraisal step.",
        emailId: "appraisal-pre",
      },
      {
        kind: "email",
        id: "landlord-confirm",
        name: "Appointment confirmed",
        blurb:
          "Goes when the agent presses Send the confirmation. This is the one carrying the link to their presentation.",
        emailId: "appraisal-confirm",
      },
      {
        kind: "open",
        id: "landlord-deck",
        name: "The presentation",
        blurb:
          "The deck they open from that link. Three of them: before the visit, the appraisal itself, and the follow-up.",
        href: "/present/sample?from=admin",
        caveat: "The sample deck. Real ones are minted per appraisal and carry that property's figures.",
      },
      {
        kind: "email",
        id: "landlord-post",
        name: "After the visit",
        blurb: "The follow-up, sent from the post-appraisal step.",
        emailId: "appraisal-post",
      },
      {
        kind: "email",
        id: "landlord-invite",
        name: "Opening their property file",
        blurb: "The invitation into the landlord portal, sent once terms of business come back signed.",
        emailId: "landlord-deck-invite",
        caveat: "Written and rendering, but no send path is wired yet.",
      },
      {
        kind: "open",
        id: "landlord-sign-in",
        name: "Signing in",
        blurb: "They type the email REX holds for them and get a link. No password.",
        href: "/landlord/sign-in?from=admin",
        caveat: "Only an address that is the owner contact on a managed listing gets a link. Anyone else sees the same message and no email.",
      },
      {
        kind: "email",
        id: "landlord-sign-in-email",
        name: "The link they get",
        blurb: "Single use, lasts a day, sent on the public Lettings Experts sender.",
        emailId: "landlord-sign-in",
      },
      {
        kind: "open",
        id: "landlord-portal",
        name: "The portal, as a sample",
        blurb:
          "The letting in flight, offers to accept or negotiate, compliance certificates, upkeep approvals, and documents both ways.",
        href: "/landlord/demo?from=admin",
        caveat: SAMPLE_LANDLORD,
      },
    ],
    missing: [
      "The live home shows a landlord their managed properties. Offers, certificates, upkeep and documents are still the sample.",
      "A landlord whose only property is still on the market, not yet let, is not found by the sign-in yet.",
      "The property-file invitation has no send path yet.",
    ],
  },
  {
    slug: "agent",
    name: "Agent",
    icon: "suitcase",
    blurb:
      "What a partner agent meets: the invitation, setting their account up, being shown round, the handover to compliance, and the nudges that reach them once they are working.",
    items: [
      {
        kind: "email",
        id: "agent-invite",
        name: "Their invitation",
        blurb: "The email that brings somebody onto the pre-launch, with the link that becomes their account.",
        emailId: "pilot-invite",
      },
      {
        kind: "open",
        id: "agent-onboarding",
        name: "Joining and being shown round",
        blurb:
          "The five setup screens and the walkthrough, plus the links you can send somebody who has no account.",
        href: "/admin/onboarding",
      },
      {
        kind: "open",
        id: "agent-plc",
        name: "The compliance handover",
        blurb:
          "Both halves of a PLC pack: what the agent does, and what Kirstie sees when it lands.",
        href: "/admin/plc-demo",
      },
      {
        /* The only email in the OS addressed to an agent about their own work,
           which is why it sits here rather than in the landlord folder with the
           rest of the appraisal run. Placed after the joining steps because it
           reaches somebody who is already working, not somebody arriving. */
        kind: "email",
        id: "agent-video-nudge",
        name: "The video reminder nudge",
        blurb:
          "Two days before an appraisal, when they have not recorded a personalised video for it. The landlord's pre-appraisal email goes the day after this one, carrying the deck the video sits on.",
        emailId: "appraisal-video-chase",
        caveat:
          "Written and rendering, but nothing schedules it, and Flow is not switched on either - so the button reaches the appraisal screen rather than a recorder. On the to-do list.",
      },
      {
        kind: "open",
        id: "agent-prelaunch",
        name: "Who is on the pre-launch",
        blurb: "The roster, invitations, what people actually use, and what they have reported.",
        href: "/admin/pre-launch",
      },
      {
        kind: "email",
        id: "agent-verify",
        name: "Confirming their address",
        blurb: "The one-time link that turns an invitation into an account.",
        emailId: "account-verify",
      },
    ],
  },
];

export function folderBySlug(slug: string): PortalFolder | undefined {
  return PORTAL_FOLDERS.find((f) => f.slug === slug);
}
