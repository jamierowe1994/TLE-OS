import type { ProcessMap, ProcessNode } from "@/lib/process/types";

/**
 * The tenant process as it stands on 12 Sep 2026: what is built and live,
 * what is written but not yet sent, and what is only meant. The spine is
 * the happy path from a booked viewing to move-in day. Two nurture
 * branches hang off it: the passport not started, and no application
 * after the passport. Nothing here is invented as working: a step that
 * does not exist yet says "planned".
 *
 * Positions are a first layout; the editor moves them and saves.
 */
const X = 300;
const n = (p: Omit<ProcessNode, "x" | "y"> & { col: number; row?: number }): ProcessNode => {
  const { col, row = 0, ...rest } = p;
  /* Row 0 is the spine; -1 sits above it, 1 and 2 hang beneath. */
  return { ...rest, x: 60 + col * X, y: 270 + row * 190 };
};

export const TENANT_PROCESS: ProcessMap = {
  audience: "tenant",
  title: "The tenant process",
  blurb: "From a booked viewing to move-in day: every screen a tenant meets, every email that goes to them, and what happens when they stall.",
  version: 1,
  nodes: [
    n({ id: "viewing-booked", kind: "trigger", lane: "spine", col: 0, status: "live", title: "Viewing booked", blurb: "A viewing is booked in REX for a listing.", trigger: { on: "viewing.booked" } }),
    n({ id: "invite", kind: "email", lane: "spine", col: 1, status: "draft", title: "Start your passport", blurb: "The invite: thanks for booking, here is your passport to fill in once.", emailId: "tenant-passport-invite", trigger: { on: "viewing.booked", after: "straight away" } }),
    n({ id: "passport", kind: "screen", lane: "spine", col: 2, status: "live", title: "The passport", blurb: "One question at a time; the card fills in as they type.", href: "/preview/{token}/passport" }),
    n({ id: "account", kind: "screen", lane: "spine", col: 3, status: "live", title: "Create the account", blurb: "The card is made, their email is the username, they choose a password.", href: "/preview/{token}/passport" }),
    n({ id: "portal", kind: "screen", lane: "spine", col: 4, status: "live", title: "The tenant area", blurb: "Home, my tenancy, documents, maintenance, payments, messages.", href: "/tenant/demo?from=admin" }),
    n({ id: "apply", kind: "screen", lane: "spine", col: 5, status: "live", title: "Apply for a property", blurb: "One tap with the passport; rent and property on the application.", href: "/tenant/apply?from=admin" }),
    n({ id: "offer", kind: "trigger", lane: "spine", col: 6, status: "live", title: "Offer accepted", blurb: "The deal starts in Propoly; the portal follows its eight stages.", trigger: { on: "propoly.deal.started" } }),
    n({ id: "referencing", kind: "screen", lane: "spine", col: 7, status: "live", title: "Referencing", blurb: "Employer, previous landlord and credit. The portal says what is needed.", href: "/tenant/demo/tenancy?from=admin" }),
    n({ id: "agreement", kind: "screen", lane: "spine", col: 8, status: "planned", title: "Sign the agreement", blurb: "The tenancy agreement, signed in the portal through DocuSeal.", href: "/tenant/demo/documents?from=admin" }),
    n({ id: "move-in", kind: "trigger", lane: "spine", col: 9, status: "planned", title: "Move-in day", blurb: "Keys, inventory and check-in. The portal becomes the tenancy.", trigger: { on: "propoly.deal.move_day" } }),

    n({ id: "sign-in", kind: "email", lane: "side", col: 4, row: -1, status: "live", title: "Sign-in link", blurb: "For a tenant who arrives from a Propoly deal without a password.", emailId: "tenant-sign-in", trigger: { on: "tenant.sign-in.requested" } }),

    n({ id: "not-started", kind: "decision", lane: "nurture", col: 2, row: 1, status: "planned", title: "Passport not started?", blurb: "Two days after the invite and nothing typed.", trigger: { on: "passport.invited", after: "2 days" } }),
    n({ id: "nudge-1", kind: "email", lane: "nurture", col: 3, row: 1, status: "planned", title: "Nudge: two days", blurb: "A short reminder with the same link. To write.", trigger: { on: "passport.not-started", after: "2 days" } }),
    n({ id: "nudge-2", kind: "email", lane: "nurture", col: 4, row: 1, status: "planned", title: "Nudge: a week", blurb: "Why the passport matters: one form for every property. To write.", trigger: { on: "passport.not-started", after: "7 days" } }),

    n({ id: "no-application", kind: "decision", lane: "nurture", col: 5, row: 2, status: "planned", title: "No application?", blurb: "Passport done, nothing applied for in two weeks.", trigger: { on: "passport.finished", after: "14 days" } }),
    n({ id: "listings", kind: "email", lane: "nurture", col: 6, row: 2, status: "planned", title: "New homes that fit", blurb: "Listings that match what their passport says. To write.", trigger: { on: "passport.finished", after: "14 days" } }),
  ],
  edges: [
    { from: "viewing-booked", to: "invite", kind: "main" },
    { from: "invite", to: "passport", kind: "main" },
    { from: "passport", to: "account", kind: "main" },
    { from: "account", to: "portal", kind: "main" },
    { from: "portal", to: "apply", kind: "main" },
    { from: "apply", to: "offer", kind: "main" },
    { from: "offer", to: "referencing", kind: "main" },
    { from: "referencing", to: "agreement", kind: "main" },
    { from: "agreement", to: "move-in", kind: "main" },
    { from: "sign-in", to: "portal", kind: "branch", label: "signs in" },
    { from: "invite", to: "not-started", kind: "branch", label: "no reply" },
    { from: "not-started", to: "nudge-1", kind: "main" },
    { from: "nudge-1", to: "nudge-2", kind: "main" },
    { from: "nudge-2", to: "passport", kind: "return", label: "back to the passport" },
    { from: "apply", to: "no-application", kind: "branch", label: "nothing applied for" },
    { from: "no-application", to: "listings", kind: "main" },
    { from: "listings", to: "apply", kind: "return", label: "back to applying" },
  ],
};
