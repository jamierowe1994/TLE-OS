import type { Notice } from "@/lib/notices";

/**
 * What can buzz a phone, one line per kind (5 Oct 2026).
 *
 * James: "I need to be able to control what notifications come through, and
 * I think we should also allow them to control what notifications come
 * through on the app." So every alert belongs to one of these, and two
 * people get a say on each:
 *
 *   James (Admin > Phone Alerts)   off for everyone / on, each person may turn
 *                                  it off / always on, nobody may
 *   each person (app > Profile)    on or off for their own phone, where James
 *                                  has left it theirs to choose
 *
 * The bell is not filtered. It is the record of what happened; this decides
 * only what is worth a buzz in somebody's pocket.
 *
 * Client-safe: the app's Profile and the Admin page both draw from it.
 */

export type AlertType =
  | "tenant_enquiry"
  | "viewing_request"
  | "viewing_booked"
  | "landlord_lead"
  | "customer_message"
  | "deal"
  | "money"
  | "plc"
  | "appraisal"
  | "reminder"
  | "compliance"
  | "steve"
  | "campaign"
  | "handover";

/** James's say, per type. "on" leaves it to each person. */
export type AlertRule = "off" | "on" | "always";

export interface AlertTypeDef {
  key: AlertType;
  label: string;
  /** One line under the label: what arrives and whose it is. */
  what: string;
  /** Who it can ever reach, for the Admin page. */
  who: string;
  /** Only shown to people who can receive it (see alertTypesFor). */
  only?: "marketing" | "ops";
}

export const ALERT_TYPES: AlertTypeDef[] = [
  { key: "tenant_enquiry", label: "Tenant Enquiries", what: "Someone asks about one of your homes on Rightmove, Zoopla, OnTheMarket, the website or the tenant area.", who: "The agent the enquiry is for." },
  { key: "viewing_request", label: "Viewing Requests", what: "A tenant asks to view one of your homes.", who: "The agent the enquiry is for." },
  { key: "viewing_booked", label: "Viewings Booked", what: "Someone else books a viewing into your diary.", who: "The agent whose diary it is in. Owners hear about every one." },
  { key: "landlord_lead", label: "New Landlord Leads", what: "A landlord asks for a valuation, or one is added to the leads.", who: "The agent it is for. Owners hear about every one." },
  { key: "customer_message", label: "Landlord and Tenant Messages", what: "A landlord or tenant writes to you from their portal.", who: "The agent they wrote to." },
  { key: "deal", label: "Applications and Deals", what: "An application moves on, is accepted or falls through.", who: "The deal's agent, and pre-tenancy." },
  { key: "money", label: "Money In", what: "A holding deposit, deposit or first rent arrives.", who: "The deal's agent, and pre-tenancy." },
  { key: "plc", label: "Pre-tenancy Checks", what: "A PLC pack is sent, checked or decided, and a move-in is ready.", who: "The deal's agent, and pre-tenancy." },
  { key: "appraisal", label: "Appraisals Booked for You", what: "Someone books an appraisal in your diary.", who: "The agent it is booked for." },
  { key: "reminder", label: "Tasks and Reminders", what: "Your tasks, leads nobody has rung, and anything due.", who: "The person whose task it is." },
  { key: "compliance", label: "Compliance", what: "A document is queried, or waiting to be verified.", who: "The agent, and the office." },
  { key: "steve", label: "Steve's Reports", what: "What Steve's standing jobs found.", who: "The person who set the job." },
  { key: "campaign", label: "Campaign Steps", what: "A landlord campaign needs a person to step in.", who: "Marketing and owners.", only: "marketing" },
  { key: "handover", label: "Handovers", what: "A tenancy handover finishes or gets stuck.", who: "Owners and pre-tenancy.", only: "ops" },
];

const KEYS = new Set<string>(ALERT_TYPES.map((t) => t.key));
export const isAlertType = (k: unknown): k is AlertType => typeof k === "string" && KEYS.has(k);
export const isAlertRule = (r: unknown): r is AlertRule => r === "off" || r === "on" || r === "always";

/** Which kind of alert a bell notice is. Lead notices name theirs in the id. */
export function alertTypeOf(n: Pick<Notice, "id" | "kind">): AlertType {
  if (n.id.startsWith("booked:")) return "viewing_booked";
  if (n.id.startsWith("lead:viewing:")) return "viewing_request";
  if (n.id.startsWith("lead:landlord:")) return "landlord_lead";
  if (n.id.startsWith("lead:")) return "tenant_enquiry";
  if (n.id.startsWith("pre:")) return "appraisal";
  switch (n.kind) {
    case "deal":
    case "money":
    case "plc":
    case "reminder":
    case "compliance":
    case "steve":
    case "campaign":
    case "handover":
      return n.kind;
    default:
      return "reminder";
  }
}

/**
 * Whether one person's phone gets one kind, given James's rules and their own
 * choices. Nothing chosen means on: a new kind arrives switched on.
 */
export function wantsAlert(type: AlertType, rules: Partial<Record<AlertType, AlertRule>>, mine: Partial<Record<AlertType, boolean>>): boolean {
  const rule = rules[type] ?? "on";
  if (rule === "off") return false;
  if (rule === "always") return true;
  return mine[type] !== false;
}
