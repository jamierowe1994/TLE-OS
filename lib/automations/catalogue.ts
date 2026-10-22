/**
 * AGENT AUTOMATIONS - the parts an automation is built from (James, 22 Oct
 * 2026: "allow the guys some custom automations... it should look a bit like
 * Zapier").
 *
 * An automation is ONE trigger, any number of conditions, an optional wait,
 * and one or more actions:
 *
 *   When   a new enquiry comes in on one of my listings
 *   Wait   2 days
 *   Only if they still haven't booked a viewing
 *   Then   email them my other homes nearby
 *          and make me a task to ring them
 *
 * This file is the menu, and it is shared: the editor draws its pickers from
 * it, the chat builder is told about nothing else, and the runner refuses
 * anything not listed here. So a part that is not in this file cannot be
 * built, by a person or by the AI.
 *
 * ── What is deliberately missing ──────────────────────────────────────────
 *
 * Nothing here writes to REX, PayProp or Propoly. Every action is something
 * the OS already does on its own: an email or a text through the customer
 * switch, a passport, a task, a line in the bell or a Huddle, a tag on the
 * OS's own record. A trigger only ever READS.
 *
 * No server imports: the editor in the browser uses this file too.
 */

/* ── Who the automation is about ─────────────────────────────────────────── */

/** The customer a trigger hands to its actions, if any. */
export type Person = "tenant" | "landlord" | "none";

/* ── Triggers ────────────────────────────────────────────────────────────── */

export type TriggerKey =
  | "lead.new"
  | "viewing.booked"
  | "viewing.done"
  | "offer.made"
  | "offer.accepted"
  | "passport.sent"
  | "passport.started"
  | "passport.finished"
  | "let.agreed"
  | "listing.live"
  | "listing.offline"
  | "cert.verified"
  | "cert.expiring"
  | "tenancy.move_in"
  | "tenancy.anniversary"
  | "schedule";

export type FieldKind = "number" | "text" | "choice" | "time" | "weekday" | "template" | "textarea" | "person";

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  /** For "choice". */
  options?: { value: string; label: string }[];
  /** Shown as the placeholder; also the default when the field is left alone. */
  default?: string | number;
  min?: number;
  max?: number;
  help?: string;
}

export interface TriggerDef {
  key: TriggerKey;
  group: "Leads and viewings" | "Offers and lets" | "Passports" | "Listings" | "Compliance" | "Tenancies" | "Time";
  label: string;
  /** "When ..." - lower case, reads after "When". */
  when: string;
  person: Person;
  icon: string;
  fields: Field[];
  /** One line for the picker. */
  help: string;
}

const LEAD_KIND: Field = {
  key: "kind",
  label: "Which leads",
  kind: "choice",
  default: "tenant",
  options: [
    { value: "tenant", label: "Tenant enquiries" },
    { value: "landlord", label: "Landlord leads" },
    { value: "any", label: "Any lead" },
  ],
};

export const TRIGGERS: TriggerDef[] = [
  { key: "lead.new", group: "Leads and viewings", label: "New enquiry or lead", when: "a new enquiry or lead comes in", person: "tenant", icon: "user", fields: [LEAD_KIND], help: "A tenant enquiry on one of your listings, or a landlord lead assigned to you." },
  { key: "viewing.booked", group: "Leads and viewings", label: "Viewing booked", when: "a viewing is booked", person: "tenant", icon: "calendar", fields: [], help: "A viewing goes into your diary on one of your homes." },
  { key: "viewing.done", group: "Leads and viewings", label: "Viewing done", when: "a viewing has happened", person: "tenant", icon: "calendar", fields: [], help: "The viewing's time has passed and it was not cancelled." },
  { key: "offer.made", group: "Offers and lets", label: "Offer made", when: "an offer is made", person: "tenant", icon: "coin", fields: [], help: "Somebody puts an offer in on one of your listings." },
  { key: "offer.accepted", group: "Offers and lets", label: "Offer accepted", when: "an offer is accepted", person: "tenant", icon: "coin", fields: [], help: "An offer on one of your listings is accepted." },
  { key: "passport.sent", group: "Passports", label: "Passport sent", when: "a tenant passport is sent", person: "tenant", icon: "file-contract", fields: [], help: "You (or Automate passport) send a tenant their passport." },
  { key: "passport.started", group: "Passports", label: "Passport started", when: "a tenant starts their passport", person: "tenant", icon: "file-contract", fields: [], help: "They open it and fill in the first answers." },
  { key: "passport.finished", group: "Passports", label: "Passport finished", when: "a tenant finishes their passport", person: "tenant", icon: "file-contract", fields: [], help: "They press finish on their passport." },
  { key: "let.agreed", group: "Offers and lets", label: "Let agreed", when: "a let is agreed", person: "tenant", icon: "key", fields: [], help: "A let on one of your homes is accepted and moves to Applications." },
  { key: "listing.live", group: "Listings", label: "Listing goes live", when: "one of my listings goes live", person: "none", icon: "home", fields: [], help: "A listing of yours is published to the portals." },
  { key: "listing.offline", group: "Listings", label: "Listing comes off", when: "one of my listings comes off the market", person: "none", icon: "home", fields: [], help: "A listing of yours is let, withdrawn or taken down." },
  { key: "cert.verified", group: "Compliance", label: "Certificate verified", when: "a certificate is verified", person: "landlord", icon: "shield", fields: [], help: "Compliance checks a new certificate on one of your homes and marks it verified." },
  {
    key: "cert.expiring",
    group: "Compliance",
    label: "Certificate expiring",
    when: "a certificate is about to expire",
    person: "landlord",
    icon: "shield",
    fields: [{ key: "days", label: "Days before it expires", kind: "number", default: 30, min: 1, max: 120 }],
    help: "A gas, EICR, EPC or other certificate on one of your homes is close to its expiry.",
  },
  { key: "tenancy.move_in", group: "Tenancies", label: "Move-in day", when: "a tenant's move-in day arrives", person: "tenant", icon: "key", fields: [], help: "The morning of the move-in date on a let of yours." },
  { key: "tenancy.anniversary", group: "Tenancies", label: "Tenancy anniversary", when: "a tenancy reaches a year", person: "tenant", icon: "calendar", fields: [], help: "One year (and each year after) from the move-in date on a let of yours." },
  {
    key: "schedule",
    group: "Time",
    label: "On a schedule",
    when: "it is time",
    person: "none",
    icon: "clock",
    fields: [
      {
        key: "every",
        label: "How often",
        kind: "choice",
        default: "week",
        options: [
          { value: "day", label: "Every day" },
          { value: "weekday", label: "Every weekday" },
          { value: "week", label: "Every week" },
          { value: "month", label: "Every month" },
        ],
      },
      { key: "on", label: "On", kind: "weekday", default: 1, help: "The day of the week, or the day of the month." },
      { key: "at", label: "At", kind: "time", default: "09:00" },
    ],
    help: "A reminder to yourself or the team at a set time. It has nobody to email.",
  },
];

/* ── Conditions ──────────────────────────────────────────────────────────── */

export type ConditionKey =
  | "no_viewing_booked"
  | "passport_not_finished"
  | "listing_still_available"
  | "has_email"
  | "has_mobile"
  | "source_is"
  | "postcode_starts"
  | "cert_type";

export interface ConditionDef {
  key: ConditionKey;
  label: string;
  /** "Only if ..." - lower case. */
  words: string;
  /** Which triggers it makes sense on. */
  on: TriggerKey[];
  fields: Field[];
}

const PERSON_TRIGGERS: TriggerKey[] = [
  "lead.new", "viewing.booked", "viewing.done", "offer.made", "offer.accepted", "passport.sent", "passport.started",
  "passport.finished", "let.agreed", "cert.verified", "cert.expiring", "tenancy.move_in", "tenancy.anniversary",
];

export const CONDITIONS: ConditionDef[] = [
  { key: "no_viewing_booked", label: "They haven't booked a viewing", words: "they still haven't booked a viewing", on: ["lead.new", "passport.sent", "passport.started", "passport.finished"], fields: [] },
  { key: "passport_not_finished", label: "Their passport isn't finished", words: "their passport still isn't finished", on: ["lead.new", "viewing.booked", "viewing.done", "passport.sent", "passport.started", "offer.made"], fields: [] },
  { key: "listing_still_available", label: "The home is still available", words: "the home is still on the market", on: ["lead.new", "viewing.booked", "viewing.done", "passport.sent", "passport.started", "passport.finished", "listing.live"], fields: [] },
  { key: "has_email", label: "They have an email address", words: "they have an email address", on: PERSON_TRIGGERS, fields: [] },
  { key: "has_mobile", label: "They have a mobile number", words: "they have a mobile number", on: PERSON_TRIGGERS, fields: [] },
  {
    key: "source_is",
    label: "The lead came from",
    words: "the lead came from {source}",
    on: ["lead.new"],
    fields: [{ key: "source", label: "Source contains", kind: "text", default: "Rightmove", help: "Rightmove, Zoopla, OnTheMarket, website..." }],
  },
  {
    key: "postcode_starts",
    label: "The home's postcode starts with",
    words: "the home's postcode starts with {prefix}",
    on: ["lead.new", "viewing.booked", "viewing.done", "offer.made", "offer.accepted", "let.agreed", "listing.live", "listing.offline", "cert.verified", "cert.expiring", "tenancy.move_in", "tenancy.anniversary"],
    fields: [{ key: "prefix", label: "Postcode starts with", kind: "text", default: "NN1" }],
  },
  {
    key: "cert_type",
    label: "The certificate is",
    words: "the certificate is a {type}",
    on: ["cert.verified", "cert.expiring"],
    fields: [
      {
        key: "type",
        label: "Certificate",
        kind: "choice",
        default: "gas",
        options: [
          { value: "gas", label: "Gas safety" },
          { value: "eicr", label: "EICR" },
          { value: "epc", label: "EPC" },
          { value: "other", label: "Anything else" },
        ],
      },
    ],
  },
];

/* ── Actions ─────────────────────────────────────────────────────────────── */

export type ActionKey = "email" | "text" | "passport" | "task" | "notify" | "huddle" | "tag";

export interface ActionDef {
  key: ActionKey;
  label: string;
  /** "Then ..." - lower case. */
  words: string;
  icon: string;
  /** Reaches a customer: through the customer switch, the caps and the first-send preview. */
  customer: boolean;
  /** Needs the trigger to hand over a person. */
  needsPerson: boolean;
  fields: Field[];
}

export const ACTIONS: ActionDef[] = [
  {
    key: "email",
    label: "Send an email",
    words: "email them",
    icon: "mail",
    customer: true,
    needsPerson: true,
    fields: [
      { key: "template", label: "Email", kind: "template", default: "custom" },
      { key: "subject", label: "Subject", kind: "text" },
      { key: "body", label: "Message", kind: "textarea", help: "Use {{firstName}}, {{address}} and {{agent}}. It goes from your own Outlook where that's connected." },
    ],
  },
  {
    key: "text",
    label: "Send a text",
    words: "text them",
    icon: "message",
    customer: true,
    needsPerson: true,
    fields: [{ key: "body", label: "Text", kind: "textarea", help: "Keep it under 160 characters for one text. {{firstName}}, {{address}}, {{agent}} work here too." }],
  },
  { key: "passport", label: "Send their passport", words: "send them their tenant passport", icon: "file-contract", customer: true, needsPerson: true, fields: [] },
  {
    key: "task",
    label: "Make a task",
    words: "make me a task",
    icon: "checklist",
    customer: false,
    needsPerson: false,
    fields: [
      { key: "title", label: "Task", kind: "text", default: "Ring {{name}}" },
      { key: "dueDays", label: "Due in (days)", kind: "number", default: 0, min: 0, max: 60 },
    ],
  },
  {
    key: "notify",
    label: "Tell someone in the bell",
    words: "tell {who} in the bell",
    icon: "bell",
    customer: false,
    needsPerson: false,
    fields: [
      { key: "who", label: "Who", kind: "person", default: "me" },
      { key: "message", label: "Message", kind: "text", default: "{{name}} - {{address}}" },
    ],
  },
  {
    key: "huddle",
    label: "Post in a Huddle",
    words: "post in a Huddle",
    icon: "message",
    customer: false,
    needsPerson: false,
    fields: [
      { key: "room", label: "Huddle", kind: "text", help: "The Huddle's name, as it shows on Huddles." },
      { key: "message", label: "Message", kind: "text", default: "{{name}} - {{address}}" },
    ],
  },
  {
    key: "tag",
    label: "Add a tag",
    words: "tag them {tag}",
    icon: "pencil",
    customer: false,
    needsPerson: true,
    fields: [{ key: "tag", label: "Tag", kind: "text", default: "Chased" }],
  },
];

/* ── The automation itself ───────────────────────────────────────────────── */

export type Params = Record<string, string | number>;

export interface Step<K extends string> {
  key: K;
  params: Params;
}

export interface AutomationDef {
  trigger: Step<TriggerKey>;
  conditions: Step<ConditionKey>[];
  /** Hours after the trigger before the conditions are checked and the actions run. 0 = straight away. */
  waitHours: number;
  actions: Step<ActionKey>[];
}

/** Per automation, per day: how many customers it may write to. */
export const DEFAULT_DAILY_CAP = 20;
export const MAX_DAILY_CAP = 50;
/** Per agent, per day, across all their automations. */
export const PERSON_DAILY_CAP = 60;
/** Per customer, per day, across everybody's automations. */
export const CUSTOMER_DAILY_CAP = 2;
/** How many automations one person may keep. */
export const MAX_AUTOMATIONS_EACH = 25;
/** The longest wait. Beyond a month the moment has gone. */
export const MAX_WAIT_HOURS = 24 * 30;

export const triggerDef = (k: string) => TRIGGERS.find((t) => t.key === k) ?? null;
export const conditionDef = (k: string) => CONDITIONS.find((c) => c.key === k) ?? null;
export const actionDef = (k: string) => ACTIONS.find((a) => a.key === k) ?? null;

/** A field's value, or its default. */
export function param(p: Params | undefined, f: Field): string | number {
  const v = p?.[f.key];
  return v === undefined || v === "" ? (f.default ?? "") : v;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function fill(words: string, def: { fields: Field[] }, p: Params): string {
  return words.replace(/\{(\w+)\}/g, (_, k: string) => {
    const f = def.fields.find((x) => x.key === k);
    if (!f) return k;
    const v = String(param(p, f));
    if (f.kind === "choice") return f.options?.find((o) => o.value === v)?.label.toLowerCase() ?? v;
    if (f.kind === "person") return v === "me" ? "me" : v;
    return v;
  });
}

export function triggerWords(t: Step<TriggerKey>): string {
  const d = triggerDef(t.key);
  if (!d) return "something happens";
  if (t.key === "lead.new") {
    const kind = String(param(t.params, LEAD_KIND));
    return kind === "landlord" ? "a new landlord lead comes in" : kind === "any" ? "a new lead comes in" : "a new tenant enquiry comes in on one of my listings";
  }
  if (t.key === "cert.expiring") return `a certificate on one of my homes is ${param(t.params, d.fields[0])} days from expiring`;
  if (t.key === "schedule") return scheduleWords(t.params);
  return d.when;
}

export function scheduleWords(p: Params): string {
  const every = String(p.every ?? "week");
  const at = String(p.at ?? "09:00");
  const on = Number(p.on ?? 1);
  if (every === "day") return `every day at ${at}`;
  if (every === "weekday") return `every weekday at ${at}`;
  if (every === "month") return `on day ${Math.min(Math.max(on, 1), 31)} of every month at ${at}`;
  return `every ${DAYS[((on % 7) + 7) % 7]} at ${at}`;
}

export function waitWords(h: number): string {
  if (!h) return "";
  if (h % 24 === 0) return h === 24 ? "1 day" : `${h / 24} days`;
  return h === 1 ? "1 hour" : `${h} hours`;
}

export function conditionWords(c: Step<ConditionKey>): string {
  const d = conditionDef(c.key);
  return d ? fill(d.words, d, c.params) : "something is true";
}

export function actionWords(a: Step<ActionKey>): string {
  const d = actionDef(a.key);
  if (!d) return "do something";
  if (a.key === "email") {
    const t = String(a.params.template ?? "custom");
    if (t === "homes-nearby") return "email them my other homes nearby";
    const starter = AUTOMATION_STARTERS.find((x) => x.id === t);
    const subject = String(a.params.subject ?? "").trim();
    return starter ? `email them "${starter.name}"` : subject ? `email them "${readable(subject)}"` : "email them";
  }
  if (a.key === "task") return `make me a task: "${readable(String(a.params.title ?? "").trim()) || "follow up"}"`;
  return readable(fill(d.words, d, a.params));
}

/** Merge fields in a sentence about the automation, said the way a person would: {{name}} -> [name]. */
function readable(s: string): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => `[${k === "firstName" ? "first name" : k}]`);
}

/** The whole automation as one plain sentence, for the list and the chat. */
export function describe(def: AutomationDef): string {
  const start = triggerWords(def.trigger);
  const parts = [def.trigger.key === "schedule" ? start.charAt(0).toUpperCase() + start.slice(1) : `When ${start}`];
  if (def.waitHours) parts.push(`wait ${waitWords(def.waitHours)}`);
  if (def.conditions.length) parts.push(`and if ${def.conditions.map(conditionWords).join(" and ")}`);
  const acts = def.actions.map(actionWords);
  const then = def.trigger.key === "schedule" && parts.length === 1 ? "" : "then ";
  parts.push(acts.length ? `${then}${acts.length > 1 ? `${acts.slice(0, -1).join(", ")} and ${acts[acts.length - 1]}` : acts[0]}` : `${then}do nothing yet`);
  return `${parts.join(", ")}.`;
}

/** Does this automation reach a customer at all? Decides the preview and the caps. */
export function reachesCustomer(def: AutomationDef): boolean {
  return def.actions.some((a) => actionDef(a.key)?.customer);
}

/**
 * Everything wrong with it, in sentences for the agent. Empty means it may be
 * saved. The server runs the same check before saving and before switching on,
 * so a hand-made request cannot sneak past the editor.
 */
export function problems(def: AutomationDef): string[] {
  const out: string[] = [];
  const t = triggerDef(def?.trigger?.key);
  if (!t) return ["Pick what starts it."];
  if (!Array.isArray(def.actions) || def.actions.length === 0) out.push("Add at least one thing for it to do.");
  if (def.actions.length > 5) out.push("Five actions at most.");
  if (def.conditions.length > 5) out.push("Five conditions at most.");
  if (!Number.isFinite(def.waitHours) || def.waitHours < 0 || def.waitHours > MAX_WAIT_HOURS) out.push("The wait has to be between none and 30 days.");
  for (const c of def.conditions) {
    const d = conditionDef(c.key);
    if (!d) out.push("One of the conditions isn't one the OS knows.");
    else if (!d.on.includes(t.key)) out.push(`"${d.label}" doesn't work with "${t.label}".`);
  }
  for (const a of def.actions) {
    const d = actionDef(a.key);
    if (!d) {
      out.push("One of the actions isn't one the OS can do.");
      continue;
    }
    if (d.needsPerson && t.person === "none") out.push(`"${t.label}" has nobody to ${d.label.toLowerCase().replace(/^send /, "send ")}: pick an action for you or the team instead.`);
    if (a.key === "passport" && t.person !== "tenant") out.push("Passports only go to tenants.");
    if (a.key === "email") {
      const tpl = String(a.params.template ?? "custom");
      if (tpl === "homes-nearby" && t.person !== "tenant") out.push("Homes nearby only goes to tenants.");
      if (tpl === "custom" && (!String(a.params.subject ?? "").trim() || !String(a.params.body ?? "").trim())) out.push("The email needs a subject and a message.");
    }
    if (a.key === "text") {
      const body = String(a.params.body ?? "").trim();
      if (!body) out.push("The text needs some words.");
      if (body.length > 480) out.push("Texts are kept to 480 characters (three texts).");
    }
    if (a.key === "huddle" && !String(a.params.room ?? "").trim()) out.push("Say which Huddle to post in.");
    if (a.key === "tag" && !String(a.params.tag ?? "").trim()) out.push("Say what the tag is.");
  }
  if (/[—]/.test(JSON.stringify(def.actions))) out.push("No long dashes in customer messages - use a short one (-).");
  return out;
}

const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with", "from", "into", "if"]);

/** Title Case with the small words lower case (James's rule for titles). */
export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** A blank automation to start the editor from. */
export function blank(): AutomationDef {
  return { trigger: { key: "lead.new", params: { kind: "tenant" } }, conditions: [], waitHours: 0, actions: [] };
}

/** Make whatever came in (the editor, the AI) into the shape, dropping anything unknown. */
export function clean(raw: unknown): AutomationDef {
  const r = (raw ?? {}) as Partial<AutomationDef>;
  const p = (x: unknown): Params => {
    const o: Params = {};
    if (x && typeof x === "object") {
      for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
        if (typeof v === "string") o[k] = v.slice(0, 4000);
        else if (typeof v === "number" && Number.isFinite(v)) o[k] = v;
      }
    }
    return o;
  };
  const trig = triggerDef(String(r.trigger?.key ?? "")) ? (String(r.trigger?.key) as TriggerKey) : "lead.new";
  return {
    trigger: { key: trig, params: p(r.trigger?.params) },
    conditions: (Array.isArray(r.conditions) ? r.conditions : [])
      .filter((c) => conditionDef(String(c?.key)))
      .slice(0, 5)
      .map((c) => ({ key: c.key as ConditionKey, params: p(c.params) })),
    waitHours: Math.max(0, Math.min(MAX_WAIT_HOURS, Math.round(Number(r.waitHours) || 0))),
    actions: (Array.isArray(r.actions) ? r.actions : [])
      .filter((a) => actionDef(String(a?.key)))
      .slice(0, 5)
      .map((a) => ({ key: a.key as ActionKey, params: p(a.params) })),
  };
}

/* ── The OS email starters for automations ───────────────────────────────── */

/**
 * Words written for automations, beside the agent's own message templates
 * (lib/message-templates). Same merge fields, same branded prose shell. Copy
 * rules: UK English, no long dashes, nothing that reads as a robot.
 */
export const AUTOMATION_STARTERS: { id: string; name: string; person: Person; subject: string; body: string }[] = [
  {
    id: "auto-enquiry-thanks",
    name: "Thanks for your enquiry",
    person: "tenant",
    subject: "{{address}} - thanks for getting in touch",
    body: `Hi {{firstName}},

Thanks for your enquiry about {{address}}. I look after this one, so I'm the best person to ask about anything.

If you'd like to see it, reply with a couple of times that suit you and I'll get it booked in.

Best,
{{agent}}
The Letting Experts`,
  },
  {
    id: "auto-still-looking",
    name: "Still looking?",
    person: "tenant",
    subject: "Still looking for somewhere?",
    body: `Hi {{firstName}},

You were in touch about {{address}} a couple of days ago and I didn't want you to slip through the net.

If it's still of interest I'd be happy to show you round. And if it isn't quite right, tell me what you're after and I'll keep an eye out for you.

Best,
{{agent}}
The Letting Experts`,
  },
  {
    id: "auto-after-viewing",
    name: "After the viewing",
    person: "tenant",
    subject: "How did you find {{address}}?",
    body: `Hi {{firstName}},

Thanks for coming to see {{address}}. I'd love to know what you thought.

If you'd like to go ahead, reply and I'll talk you through the next steps. If it wasn't for you, no problem at all - tell me what was missing and I'll look out for something closer.

Best,
{{agent}}
The Letting Experts`,
  },
  {
    id: "auto-welcome-home",
    name: "Welcome to your new home",
    person: "tenant",
    subject: "Welcome to {{address}}",
    body: `Hi {{firstName}},

Today's the day - welcome to {{address}}.

I hope the move goes smoothly. If anything isn't right when you get in, tell me straight away and I'll get it sorted.

Best,
{{agent}}
The Letting Experts`,
  },
  {
    id: "auto-anniversary",
    name: "A year in",
    person: "tenant",
    subject: "A year at {{address}}",
    body: `Hi {{firstName}},

It's a year since you moved into {{address}}, so I wanted to check in.

Is everything in the home working as it should? If there's anything you've been meaning to mention, now's a good time.

Best,
{{agent}}
The Letting Experts`,
  },
  {
    id: "auto-cert-due-landlord",
    name: "Certificate coming up - landlord",
    person: "landlord",
    subject: "A certificate on {{address}} is due soon",
    body: `Hi {{firstName}},

A heads up that one of the safety certificates on {{address}} is coming up for renewal.

I'll be in touch to get it booked, but if you'd rather arrange it yourself, just let me know and send me the new certificate when it's done.

Best,
{{agent}}
The Letting Experts`,
  },
];

/** Every email an action can pick, for the editor's dropdown. Message templates join these on the server. */
export const SPECIAL_EMAILS = [
  { id: "custom", name: "Write my own" },
  { id: "homes-nearby", name: "My other homes nearby (with photos)" },
] as const;
