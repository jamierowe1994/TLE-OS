/**
 * The practice runs: a process, written down as steps somebody walks.
 *
 * James, 14 Sep 2026, to Kirstie: "I could build a test script rig, which
 * basically means that you could practise what it would look like ... and
 * then you can get a feeling of if it works or not, and then obviously you
 * can give me any feedback."
 *
 * ── Why a script and not a guide ──────────────────────────────────────────
 *
 * The guides in Knowledge are for reading: here is the screen, here is what
 * each part is for. This is the other half, and it is the half that finds
 * bugs. A script says DO THIS, then tells you WHAT YOU SHOULD SEE, and the
 * person says whether they saw it. A guide can be right about a screen that
 * is broken. A script cannot.
 *
 * So every step carries three things:
 *
 *   `act`   what to press. One instruction, not a paragraph.
 *   `see`   what should happen. The assertion. This is the test.
 *   `why`   optional. What the step is protecting, when that is not obvious.
 *
 * ── Both sides of the handover ────────────────────────────────────────────
 *
 * The PLC is two jobs and two people: an agent assembles a pack and hands it
 * over, and compliance reads it and decides. Each gets its own script, run on
 * the same sandbox, because each needs to practise their own half without
 * having to understand the other. James, same call: "can you also build the
 * rig from the other side, which is the PLC process for the agent as well."
 *
 * ── What a failed step does ───────────────────────────────────────────────
 *
 * It goes straight to James, from the screen it happened on, with a picture
 * of it - the same pipe as the feedback button, so nothing new has to be
 * learned and nothing waits for a meeting.
 *
 * No em dashes: this copy is read by people.
 */

export type RigStep = {
  id: string;
  title: string;
  /** What to press. */
  act: string;
  /** What should happen. The assertion; this is the test. */
  see: string;
  /** What the step is protecting, when it is not obvious. */
  why?: string;
  /**
   * Which half of the handover this step happens on. The rig puts that side on
   * screen when the step is reached, so nobody is asked to press a button on a
   * panel they cannot see.
   */
  side: "agent" | "compliance";
};

export type RigScript = {
  id: "plc-agent" | "plc-compliance";
  title: string;
  /** Who this run is for, in their own words. */
  who: string;
  blurb: string;
  icon: string;
  minutes: number;
  /** Where this run lives. */
  href: string;
  /** The guide to read first, if there is one. */
  guide?: string;
  steps: RigStep[];
};

/* ─────────────────────────── compliance: Kirstie ────────────────────────── */

const COMPLIANCE: RigStep[] = [
  {
    id: "arrive",
    title: "A pack has landed",
    act: "Look at the top of the panel: the address, who handed it over, the move-in date and how long it has waited.",
    see: "14 Sample Street, handed over by Sam Partner, and a green wait. Green means inside the 48 hours agents are given.",
    why: "The wait is the only thing that orders your queue, so it has to be right before anything else matters.",
    side: "compliance",
  },
  {
    id: "agent-note",
    title: "Read what the agent told you",
    act: "Find the agent's note on the first card.",
    see: "A line about the landlord being abroad until the 20th.",
    why: "It is the one place an agent can tell you something the documents cannot, and it is easy to build a screen that quietly drops it.",
    side: "compliance",
  },
  {
    id: "scan",
    title: "Read the pack",
    act: "Press the button that reads the pack, and wait.",
    see: "A short wait, then a summary line and a list of findings. Nothing has been decided.",
    why: "The scan never decides. If this screen ever approves anything on its own, stop and tell James that day.",
    side: "compliance",
  },
  {
    id: "blocker",
    title: "Find the blocker",
    act: "Read the red finding.",
    see: "The gas safety certificate runs out eleven days AFTER the tenants move in. The date it names should be eleven days after the move-in date at the top.",
    why: "This is the whole reason the reader exists. It is the thing nobody catches at half past four on a Friday.",
    side: "compliance",
  },
  {
    id: "query",
    title: "And the query",
    act: "Read the amber finding.",
    see: "The EPC is band E: lettable, but one band off the minimum.",
    why: "Amber is worth raising and does not stop a let. If amber and red look the same to you on screen, that is a bug.",
    side: "compliance",
  },
  {
    id: "pack",
    title: "Check the pack itself",
    act: "Scroll to the list of checks and look at the dots.",
    see: "A dot per check: green where a document is filed, red where nothing is. Right to Rent may be blank, and that is allowed.",
    why: "The findings tell you about what IS there. This list is how you see what is not.",
    side: "compliance",
  },
  {
    id: "defer",
    title: "Send it back",
    act: "Write a reason and press Defer. Say the gas certificate needs redoing before the move-in date.",
    see: "The pack changes state, your name and the time go on it, and what you wrote is on the record.",
    why: "What you write goes to the agent exactly as written. It is the only thing they see, so practise writing it as if they are reading it, because they are.",
    side: "compliance",
  },
  {
    id: "approve",
    title: "Now try approving",
    act: "Press Start again at the top, read the pack, and this time approve it.",
    see: "Approved, with your name on it. In the real thing this is the moment the property is cleared to let, the documents go into Propoly and the certificates go to REX.",
    why: "Approval is terminal and it is a legal judgement with your name against it. Better the first time you press it is here.",
    side: "compliance",
  },
];

/* ───────────────────────────── agent: Sam Partner ───────────────────────── */

const AGENT: RigStep[] = [
  {
    id: "open",
    title: "The offer is accepted",
    act: "Watch the opening panel. In the real thing this is the moment you press Start the PLC check on an accepted application.",
    see: "The property, the tenants and the move-in date arrive already filled in from REX. You typed none of it.",
    why: "If any of this is ever blank or wrong on a real application, stop there and say so. Everything downstream is built on it.",
    side: "agent",
  },
  {
    id: "warnings",
    title: "Read the warnings",
    act: "Look for anything flagged before you start.",
    see: "A warning that Right to Rent is not recorded in REX for every adult applicant.",
    why: "These are the things REX already knows are thin. They are cheaper to fix now than after compliance sends the pack back.",
    side: "agent",
  },
  {
    id: "details",
    title: "Check the details",
    act: "Work through the details, the landlord and the tenants.",
    see: "Each screen asks for one thing, and the move-in date carries through all of them.",
    why: "Every date check compliance runs is 'in date ON the move-in date'. A wrong move-in date makes every answer wrong and nothing on the screen will look broken.",
    side: "agent",
  },
  {
    id: "attach",
    title: "Attach the pack",
    act: "Attach a document against a check, and leave one deliberately empty.",
    see: "The check you filled turns green. The one you left is still shown as missing, and it does not stop you moving on.",
    why: "You are allowed to hand over an incomplete pack with a reason. You are not allowed to hand one over and hope nobody notices.",
    side: "agent",
  },
  {
    id: "note",
    title: "Tell compliance what they need to know",
    act: "Write the note that goes with the pack.",
    see: "Your words, on the pack, going to a person.",
    why: "This is the only channel you have. Anything you do not write here, Kirstie has to come and ask you for, and that is a day.",
    side: "agent",
  },
  {
    id: "submit",
    title: "Hand it over",
    act: "Submit the pack.",
    see: "A confirmation, and the file is no longer yours to edit. The 48 hours starts now.",
    why: "Handing over LOCKS the pack. That is on purpose, so that what compliance reads is what you sent.",
    side: "agent",
  },
  {
    id: "other-side",
    title: "See where it went",
    act: "Switch to the compliance side and look at your pack in the queue.",
    see: "The pack you just sent, with your name on it, your note, and everything you attached.",
    why: "Worth seeing once. Most of what makes a pack slow is invisible from your side until you have looked at it from theirs.",
    side: "compliance",
  },
  {
    id: "deferred",
    title: "What coming back looks like",
    act: "On the compliance side, defer it with a reason. Then switch back to the agent.",
    see: "The pack returns to you with the reason written on it, and it is yours to edit again.",
    why: "A deferral is not an ending. It is the loop working. Knowing what it looks like means you fix it rather than ring somebody about it.",
    side: "agent",
  },
];

export const RIG_SCRIPTS: RigScript[] = [
  {
    id: "plc-compliance",
    title: "Practise the PLC check",
    who: "For pre-tenancy: reading a pack and deciding on it.",
    blurb:
      "Walk a real pack through, from the moment it lands to the moment you approve or send it back. Eight steps, on invented documents, changing nothing.",
    icon: "shield",
    minutes: 8,
    href: "/pre-tenancy/knowledge/practice",
    guide: "plc",
    steps: COMPLIANCE,
  },
  {
    id: "plc-agent",
    title: "Practise handing over a pack",
    who: "For agents: assembling the compliance pack and sending it.",
    blurb:
      "The other half of the same handover. Assemble a pack, hand it over, then look at it from compliance's side and see it come back.",
    icon: "key",
    minutes: 8,
    href: "/plc/practice",
    steps: AGENT,
  },
];

export const scriptById = (id: string | null | undefined) =>
  RIG_SCRIPTS.find((s) => s.id === id) ?? null;
