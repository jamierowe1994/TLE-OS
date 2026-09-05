/**
 * The landlord lead spine, derived from what was actually logged.
 *
 * James, 23 Aug 2026: "lead → appraisal" was one enormous jump, so break it
 * into ticks an agent can answer yes or no to - have I sent this, have I done
 * this, have I made this. The ticks come from a LOG, not from a stored stage:
 * every call, text, visit and email an agent logs is a row, and the spine is
 * a fold over those rows. Nothing has to be remembered to move the rail; the
 * rail is a reading of what was written down.
 *
 * Client-safe: no database, no server-only imports. The server half that
 * reads and writes the rows is lib/lead-touches.ts.
 */

/** What an agent can log against a lead. */
export type TouchKind = "call" | "text" | "email" | "visit" | "note" | "nurture" | "rejoin";

/** How a contact attempt went. Only the contact kinds carry one. */
export type TouchOutcome = "spoke" | "no_answer" | "voicemail" | "replied" | "sent";

export interface LeadTouch {
  id: string;
  leadId: string;
  kind: TouchKind;
  outcome: TouchOutcome | null;
  body: string;
  byName: string;
  /** ISO. */
  at: string;
}

export const TOUCH_KINDS: { id: TouchKind; label: string; icon: string }[] = [
  { id: "call", label: "Call", icon: "call" },
  { id: "text", label: "Text / WhatsApp", icon: "message" },
  { id: "visit", label: "Visit", icon: "home" },
  { id: "email", label: "Email", icon: "mail" },
];

/** The contact kinds - the ones that count as an attempt on the spine. */
export const ATTEMPT_KINDS: TouchKind[] = ["call", "text", "visit"];

export const OUTCOMES: { id: TouchOutcome; label: string; for: TouchKind[] }[] = [
  { id: "spoke", label: "Spoke to them", for: ["call", "visit"] },
  { id: "no_answer", label: "No answer", for: ["call", "visit"] },
  { id: "voicemail", label: "Left a voicemail", for: ["call"] },
  { id: "sent", label: "Sent", for: ["text", "email"] },
  { id: "replied", label: "They replied", for: ["text", "email"] },
];

export const NURTURE_REASONS = [
  "Not answering",
  "Not ready yet - wants to wait",
  "Using another agent for now",
  "Selling instead, might let later",
];

/** Landlord spine ids, in order. Mirrors LANDLORD_TRACK in lib/journey. */
export const SPINE_IDS = ["lead", "contacted", "email", "contact2", "contact3", "appraisal_booked"] as const;
export type SpineId = (typeof SPINE_IDS)[number];

export const SPINE_LABEL: Record<SpineId, string> = {
  lead: "Lead",
  contacted: "Contacted",
  email: "Email sent",
  contact2: "2nd contact",
  contact3: "3rd contact",
  appraisal_booked: "Appraisal booked",
};

export interface Spine {
  /** The step to work next - what the Next-action card shows. */
  stepIndex: number;
  stepId: SpineId;
  /** Which steps are ticked. Skipped ones stay hollow: a landlord who books
   *  on the first call was never emailed, and the rail should not say so. */
  done: Record<SpineId, boolean>;
  attempts: number;
  emailSentAt: string | null;
  booked: boolean;
  /** Set while the lead sits on the nurture branch. */
  nurture: { at: string; reason: string; byName: string } | null;
  lastTouch: LeadTouch | null;
  /** One or two words for the list's Stage column, or null to keep REX's. */
  label: string | null;
}

/** Newest first, as the log reads. */
export function sortTouches(touches: LeadTouch[]): LeadTouch[] {
  return [...touches].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/**
 * Fold the log into a spine.
 *
 * @param booked  whether an appraisal exists for this lead (os_market_appraisals)
 */
export function foldSpine(touches: LeadTouch[], booked: boolean): Spine {
  const log = sortTouches(touches).reverse(); // oldest first for the fold
  let attempts = 0;
  let emailSentAt: string | null = null;
  let nurture: Spine["nurture"] = null;
  for (const t of log) {
    if (ATTEMPT_KINDS.includes(t.kind)) attempts++;
    if (t.kind === "email" && !emailSentAt) emailSentAt = t.at;
    if (t.kind === "nurture") nurture = { at: t.at, reason: t.body, byName: t.byName };
    /* Back on the spine: an explicit rejoin, or the landlord actually
       engaging - spoke or replied - which is the same thing said by events. */
    if (t.kind === "rejoin" || t.outcome === "spoke" || t.outcome === "replied") nurture = null;
  }

  const done: Record<SpineId, boolean> = {
    lead: attempts > 0 || emailSentAt != null || booked,
    contacted: attempts >= 1,
    email: emailSentAt != null,
    contact2: attempts >= 2,
    contact3: attempts >= 3,
    appraisal_booked: booked,
  };

  /* The step to work next is the first thing not yet done. Nobody is ever
     "at" Contacted - it is a milestone, done or not - so with nothing logged
     the record sits on Lead, whose action is the first attempt. */
  let stepId: SpineId = "lead";
  if (booked) stepId = "appraisal_booked";
  else if (attempts === 0) stepId = "lead";
  else if (!done.email) stepId = "email";
  else if (!done.contact2) stepId = "contact2";
  else if (!done.contact3) stepId = "contact3";
  else stepId = "appraisal_booked";

  const lastTouch = log.length ? log[log.length - 1] : null;

  let label: string | null = null;
  if (booked) label = SPINE_LABEL.appraisal_booked;
  else if (nurture) label = "Nurture";
  else if (attempts >= 3) label = SPINE_LABEL.contact3;
  else if (attempts >= 2) label = SPINE_LABEL.contact2;
  else if (emailSentAt) label = SPINE_LABEL.email;
  else if (attempts >= 1) label = SPINE_LABEL.contacted;

  return {
    stepIndex: SPINE_IDS.indexOf(stepId),
    stepId,
    done,
    attempts,
    emailSentAt,
    booked,
    nurture,
    lastTouch,
    label,
  };
}

/** One line for the log: "Call - no answer", "Email sent", "Added to nurture". */
export function touchSentence(t: LeadTouch): string {
  const outcome = OUTCOMES.find((o) => o.id === t.outcome)?.label;
  switch (t.kind) {
    case "call":
      return outcome ? `Call - ${outcome.toLowerCase()}` : "Call";
    case "text":
      return outcome === "They replied" ? "Text - they replied" : "Text sent";
    case "visit":
      return outcome ? `Visit - ${outcome.toLowerCase()}` : "Visit";
    case "email":
      return outcome === "They replied" ? "Email - they replied" : "Email sent";
    case "note":
      return "Note";
    case "nurture":
      return `Added to nurture${t.body ? ` - ${t.body}` : ""}`;
    case "rejoin":
      return "Back on the spine";
  }
}

export function touchIcon(t: LeadTouch): string {
  switch (t.kind) {
    case "call": return "call";
    case "text": return "message";
    case "visit": return "home";
    case "email": return "mail";
    case "note": return "doc";
    case "nurture": return "clock";
    case "rejoin": return "target";
  }
}

/** "just now", "12m ago", "yesterday", "3 Sep". */
export function whenAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
