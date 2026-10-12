/**
 * THE OFFICE, CLICK BY CLICK - the walkthroughs the tour's Office monitor plays
 * on the real back office screens that are not in lib/showroom/back-office.
 *
 * James, 12 Oct 2026: "now do the same for the office walkthrough" - the
 * valuation's live, ringed replica (lib/showroom/appraisal-walk) for the
 * Office's guide tabs too, starting with the pre-tenancy team's daily work:
 * the board and the PLC queue (lib/showroom/demo-pretenancy).
 *
 * Same shape as the other walkthroughs, so the tour reads them the same way
 * (scripts/extract-customers.mjs in the tour). Each scene is one real screen at
 * one moment of Sophie's let; `try` names the control to ring and the press
 * that counts. Checked against the screens on 12 Oct 2026.
 */

import type { BackOfficeJourney } from "@/lib/showroom/back-office";
import { LARCH_PLC, SOPHIE_PLC } from "@/lib/showroom/demo-pretenancy";

export const OFFICE_WALK: BackOfficeJourney[] = [
  /* ─────────────────────────── the board ─────────────────────────── */
  {
    id: "pt-board",
    title: "The Board and a Deal",
    lead: "Every let from offer to move-in, one column per stage. Open Sophie's let at 8 Recreation Terrace and work it from the drawer.",
    sees: ["Eight stages, left to right", "The drawer: four tiles and the checklist", "Tick what you have done"],
    story: "pretenancy",
    who: ["pretenancy"],
    scenes: () => [
      {
        id: "board-glance", actor: "pretenancy", title: "The Board at a Glance",
        says: "One column per stage, in the order a deal moves: deal started, holding fee, referencing, PLC, deposit, agreement, rent and move day. The stages move on their own from the records; only Move day is moved by hand. Each card is a let: the address, the lead tenant, one status line, and the agent.",
        where: "Pre-tenancy > Board",
        screen: { kind: "office-pretenancy", at: "board" },
        try: { says: "Click Sophie's let, 8 Recreation Terrace, in the Referencing column.", hint: "8 Recreation Terrace", did: [] },
      },
      {
        id: "board-tick", actor: "pretenancy", title: "The Checklist",
        says: "The drawer has everything about the let. Four tiles across the top: the move-in date, the stage, how old the deal is, and what is outstanding. Outstanding opens the checklist. Anything a record already proves is ticked for you and locked; the rest is yours to tick as you do it, and every tick goes on the deal's activity with your name.",
        where: "Pre-tenancy > Board > the deal",
        screen: { kind: "office-pretenancy", at: "board", open: true },
        try: { says: "Press Outstanding to open the checklist, then tick Right to Rent verified.", hint: ["Outstanding", "Right to Rent verified"], did: ["ticked"] },
      },
    ],
    agent: { says: "Open Pre-tenancy and click a card on the board.", href: "/pre-tenancy" },
    notYet: [],
  },
  {
    id: "pt-chase",
    title: "Chasing and Messaging",
    lead: "Nothing on a let is chased from memory. Set a follow-up with a date, and message the agent on the deal so the whole conversation stays with it.",
    sees: ["Tasks: a follow-up with a date", "Activity: a message the agent sees", "Tasks today, every morning"],
    story: "pretenancy",
    who: ["pretenancy", "office"],
    scenes: () => [
      {
        id: "chase-task", actor: "pretenancy", title: "Set a Follow-up",
        says: "Sophie's references are still out. On the Tasks tab, say what to chase and pick a day. It lands in Tasks today on that morning, beside every other follow-up you have set, and it goes on the deal's activity.",
        where: "Pre-tenancy > Board > the deal > Tasks",
        screen: { kind: "office-pretenancy", at: "board", open: true },
        try: { says: "Press Tasks, type a follow-up such as Chase Sophie's references, then press Add.", hint: ["Tasks", "Add a follow-up", "Add"], did: ["task"] },
      },
      {
        id: "chase-message", actor: "pretenancy", title: "Message the Agent",
        says: "Activity is the conversation with the agent on this let. Sam sees your message straight away on his own screens, and his replies come back here. Notes is the same box, kept to yourself.",
        where: "Pre-tenancy > Board > the deal > Activity",
        screen: { kind: "office-pretenancy", at: "board", open: true },
        try: { says: "Type a message to Sam in the Activity box, then press Send.", hint: ["Message Sam", "Send"], did: ["note"] },
      },
    ],
    agent: { says: "Open a deal on the board: Tasks and Activity are along the bottom.", href: "/pre-tenancy" },
    notYet: [],
  },
  {
    id: "pt-moveday",
    title: "Ready to Move In",
    lead: "The pack is approved, the deposit registered, the agreement signed and the first rent in. One press signs the let off, and everybody is told.",
    sees: ["Tenancy progress, stage by stage", "The sign-off reads the records back", "The agent is told; the portals show Move day"],
    story: "pretenancy",
    who: ["pretenancy", "office"],
    scenes: () => [
      {
        id: "moveday-sign", actor: "pretenancy", title: "Sign It Off",
        says: "Tenancy progress shows every stage with what the records say about it. Seven move on their own; Move day is the one you move. Ready to move in reads the PLC, the deposit and the rent back to you, then Sign off puts your name on it.",
        where: "Pre-tenancy > Board > the deal > Tenancy progress",
        screen: { kind: "office-pretenancy", at: "ready", open: true },
        try: { says: "Press Ready to move in on the Move day row, check the three lines, then press Sign off.", hint: ["Ready to move in", "Sign off"], did: ["move_day"] },
        sends: ["deal-moved"],
      },
      {
        id: "moveday-board", actor: "pretenancy", title: "On to Move Day",
        says: "The let is in the Move day column. Sam has his email, and Sophie and Raj see Move-in day on their portals.",
        where: "Pre-tenancy > Board",
        screen: { kind: "office-pretenancy", at: "moved" },
      },
    ],
    agent: { says: "Open the deal: Ready to move in is on the Move day row.", href: "/pre-tenancy" },
    notYet: [],
  },

  /* ─────────────────────────── the PLC queue ─────────────────────────── */
  {
    id: "pt-plc-read",
    title: "Reading a Pack",
    lead: "The longest wait comes first. Open the pack, let the scan read it, and send it back with a reason if something is wrong.",
    sees: ["The queue, longest wait first", "The scan's findings", "Send back, with a note the agent reads"],
    story: "pretenancy",
    who: ["pretenancy", "office"],
    scenes: () => [
      {
        id: "plc-scan", actor: "pretenancy", title: "Open the Pack and Scan It",
        says: "The pill on each row is how long the pack has waited: green inside 48 hours, red past it. 27 Larch Close has waited longest. The scan reads dates and names out of every document and says what it found. It decides nothing.",
        where: "Pre-tenancy > PLC queue",
        screen: { kind: "office-plc", at: "board" },
        try: { says: "Click 27 Larch Close, then press Run AI scan.", hint: ["27 Larch Close", "Run AI scan"], did: ["plc_scanned"] },
      },
      {
        id: "plc-sendback", actor: "pretenancy", title: "Send It Back",
        says: "Red is a blocker: the gas certificate runs out eleven days after the tenants move in. Write what is missing; the agent reads exactly what you write, and the pack comes back to the queue when they have fixed it.",
        where: "Pre-tenancy > PLC queue > the pack",
        screen: { kind: "office-plc", at: "plc", section: LARCH_PLC },
        try: { says: "Read the red finding, type a note for Tom (a new gas certificate is needed before move-in), then press Send back.", hint: ["For the approver", "Send back"], did: ["plc_deferred"] },
      },
    ],
    agent: { says: "Open Pre-tenancy, then PLC queue.", href: "/pre-tenancy/plc" },
    notYet: [],
  },
  {
    id: "pt-plc-approve",
    title: "Check, Then Approve",
    lead: "Every pack is checked twice. A first check against every document, then the final approval by somebody else, and the board moves on by itself.",
    sees: ["First check: Checked, pass for approval", "Final approval: Approve", "The deal moves on, on the board"],
    story: "pretenancy",
    who: ["pretenancy"],
    scenes: () => [
      {
        id: "plc-first", actor: "pretenancy", title: "The First Check",
        says: "Sophie's pack for 8 Recreation Terrace came in this morning. Scan it, go through every document against the pack, and pass it on. The pack goes back into the queue as Final approval.",
        where: "Pre-tenancy > PLC queue > the pack",
        screen: { kind: "office-plc", at: "plc", section: SOPHIE_PLC },
        try: { says: "Press Run AI scan, read what it found, then press Checked, pass for approval.", hint: ["Run AI scan", "Checked, pass for approval"], did: ["plc_checked"] },
      },
      {
        id: "plc-final", actor: "pretenancy", title: "The Final Approval",
        says: "In the OS the person who did the first check can never approve the same pack, so a colleague opens it now. Approve needs no reason. In the OS, approving can file the documents into the deal and the certificates on the property.",
        where: "Pre-tenancy > PLC queue > the pack",
        screen: { kind: "office-plc", at: "checked", section: SOPHIE_PLC },
        try: { says: "Read the first check, then press Approve.", hint: "Approve", did: ["plc_approved"] },
      },
      {
        id: "plc-board", actor: "pretenancy", title: "The Board Moves On",
        says: "With the pack approved, Sophie's let leaves PLC by itself. The deposit is registered, the agreement signed and the first rent in, so it waits at Rent payment for you to sign it off.",
        where: "Pre-tenancy > Board",
        screen: { kind: "office-pretenancy", at: "ready" },
      },
    ],
    agent: { says: "Open Pre-tenancy, then PLC queue: Final approval packs are at the top.", href: "/pre-tenancy/plc" },
    notYet: [],
  },
];
