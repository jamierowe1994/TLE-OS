/**
 * The maintenance vocabulary, on BOTH sides of the server line.
 *
 * No "server-only" here, and that is the entire point. `lib/works-orders.ts`
 * is server-only because it talks to the database, so every screen that needs
 * to draw an urgency or a trade has had to keep its own copy - the Maintenance
 * page carries one under a comment that says "Keep them in step", which is a
 * standing invitation to drift and a job nothing can check.
 *
 * The same trap caught the inspection report sheet on 14 Sep 2026: it imported
 * a VALUE from a server-only module into a client component and broke the
 * build. The answer both times is the same - the words live in a plain module
 * either side can import, and the server module re-exports them so nothing
 * that already reads them has to change.
 */

export const KINDS = ["repair", "planned"] as const;
export type Kind = (typeof KINDS)[number];

export const URGENCIES = [
  { id: "emergency", label: "Emergency", within: "24 hours", hours: 24, blurb: "No heating in winter, a burst pipe, no power, a security risk." },
  { id: "urgent", label: "Urgent", within: "3 days", hours: 72, blurb: "Something broken that makes the home hard to live in." },
  { id: "routine", label: "Routine", within: "14 days", hours: 24 * 14, blurb: "Everything else." },
] as const;
export type Urgency = (typeof URGENCIES)[number]["id"];

export const REPAIR_CATEGORIES = [
  "Plumbing", "Heating & boiler", "Electrical", "Gas", "Appliance", "Roof & gutters", "Windows & doors", "Locks & security", "Damp & mould",
  "Decoration", "Flooring", "Garden & fences", "Pests", "Cleaning", "Structural", "Other",
] as const;

export const PLANNED_CATEGORIES = [
  "Gas safety (CP12)", "EICR", "EPC", "Boiler service", "Legionella risk assessment", "PAT test", "Smoke & CO alarms", "Fire risk assessment",
  "HMO licence inspection", "Property inspection", "Inventory & check-in", "Check-out", "Other",
] as const;
