/**
 * WHAT WE ASK A LANDLORD ONCE THEY HAVE SIGNED.
 *
 * James, 15 Sep 2026: "once they've signed this, we'll say, Brilliant, signed.
 * Now we just need you to answer some questions about your property ... we're
 * going to need to make sure that we're taking as much data as possible
 * without it being overwhelming."
 *
 * Those two pull against each other, so the rules below decide it rather than
 * taste:
 *
 *   1. EVERY QUESTION IS SOMETHING SOMEBODY LATER NEEDS. The compliance module
 *      chases certificates, the works orders need a stopcock and an authority
 *      limit, the listing needs furnishing and parking, check-in needs meters.
 *      Nothing is here because it would be nice to have.
 *   2. NOTHING WE ALREADY HOLD. Not the address, the rent, the fee or the
 *      service level - they are on the contract they have just signed, and
 *      asking again says we were not paying attention.
 *   3. ONE SUBJECT A SCREEN. Seven short screens beats one long form; a form
 *      that fits on a phone without scrolling gets finished on a phone.
 *
 * ── Two things are deliberately NOT asked ─────────────────────────────────
 *
 * ALARM CODES AND BANK DETAILS. An alarm code typed into a web form is a
 * written-down alarm code, and rent goes through PayProp, which collects its
 * own. The code is taken at the take-on visit, in person, by the agent.
 *
 * AND NOTHING THAT FILTERS A TENANT UNLAWFULLY. No "no benefits", no "no
 * children", no nationality. Those are unlawful under the Equality Act and the
 * Renters' Rights Act 2025 that this very contract is written to, and a
 * dropdown offering one makes the agency the author of the discrimination
 * rather than the landlord. Pets are asked as the Act frames them - the tenant
 * has a statutory right to REQUEST, and the landlord may not unreasonably
 * refuse - so the question is how they would like requests handled, not
 * whether pets are banned.
 */

export type QuestionKind = "choice" | "multi" | "text" | "long";

export interface Question {
  /** Stable key in the stored payload. Renaming one orphans its answer. */
  id: string;
  label: string;
  kind: QuestionKind;
  /** One line under the label, for the ones that need saying. */
  help?: string;
  options?: Array<{ id: string; label: string }>;
  placeholder?: string;
  /**
   * The common answers, as tap-to-fill chips under a free-text box (James,
   * 17 Sep 2026: "the free-form boxes will give the most common answers").
   * The box stays editable - a chip is a start, not a choice.
   */
  suggestions?: string[];
  /** Chips ADD to what is there (several meters) rather than replacing it. */
  addsUp?: boolean;
  /** Not counted towards the step being done. */
  optional?: boolean;
  /**
   * Only asked when an earlier answer says it matters - "when will it be
   * free?" means nothing on an empty house (James, 17 Sep 2026). A hidden
   * question is not required either.
   */
  showIf?: { id: string; is: string[] };
}

export interface QuestionStep {
  id: string;
  title: string;
  blurb: string;
  icon: string;
  questions: Question[];
}

export type Answers = Record<string, string | string[] | undefined>;

export const PROPERTY_QUESTIONS: QuestionStep[] = [
  {
    id: "access",
    title: "Getting in",
    blurb: "So we can show it, and so a contractor is never left on the doorstep.",
    icon: "key",
    questions: [
      {
        /* WHO IS IN IT. Everything about access follows from this - and the
           take-on visit's own line on the agent's side does too (James,
           17 Sep 2026: "confirm via tenant, confirm via landlord, vacant"). */
        id: "occupancy",
        label: "Who is in the property at the moment?",
        kind: "choice",
        options: [
          { id: "empty", label: "It's empty" },
          { id: "tenant", label: "A tenant is living there" },
          { id: "owner", label: "I live there, or family do" },
        ],
      },
      {
        id: "available-from",
        label: "When will it be free?",
        kind: "text",
        help: "Roughly is fine. It sets the date we advertise from, so a tenant is not asking to move in before you have moved out.",
        placeholder: "The end of October",
        showIf: { id: "occupancy", is: ["tenant", "owner"] },
        suggestions: ["Straight away", "In two weeks", "Next month", "The end of next month", "Not sure yet"],
      },
      {
        id: "keys",
        label: "How do we get in?",
        kind: "choice",
        options: [
          { id: "you-hold", label: "You hold the keys - we'll collect them" },
          { id: "we-hold", label: "We already have a set" },
          { id: "keysafe", label: "There's a key safe at the property" },
          { id: "tenant", label: "The current tenant has them" },
        ],
      },
      {
        id: "key-sets",
        label: "How many full sets will we have?",
        kind: "choice",
        help: "One for viewings, one for the tenant, and a spare is the comfortable number.",
        options: [
          { id: "1", label: "One" },
          { id: "2", label: "Two" },
          { id: "3+", label: "Three or more" },
          { id: "unsure", label: "Not sure yet" },
        ],
      },
      {
        id: "alarm",
        label: "Is there an alarm?",
        kind: "choice",
        help: "Don't send us the code - we'll take that in person at the visit.",
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      },
    ],
  },
  {
    id: "safety",
    title: "Safety certificates",
    blurb: "It can't be marketed without these, so knowing what you have saves a fortnight.",
    icon: "shield",
    questions: [
      {
        id: "gas",
        label: "Gas safety certificate (CP12)",
        kind: "choice",
        options: [
          { id: "have", label: "I have a current one" },
          { id: "expired", label: "I have one, but it's out of date" },
          { id: "none", label: "I don't have one" },
          { id: "no-gas", label: "There's no gas at the property" },
        ],
      },
      {
        id: "eicr",
        label: "Electrical safety report (EICR)",
        kind: "choice",
        options: [
          { id: "have", label: "I have a current one" },
          { id: "expired", label: "I have one, but it's out of date" },
          { id: "none", label: "I don't have one" },
          { id: "unsure", label: "Not sure" },
        ],
      },
      {
        id: "epc",
        label: "Energy Performance Certificate",
        kind: "choice",
        options: [
          { id: "have", label: "I have a current one" },
          { id: "none", label: "I don't have one" },
          { id: "unsure", label: "Not sure" },
        ],
      },
      {
        id: "certs-held-by",
        label: "Who has the paperwork?",
        kind: "choice",
        options: [
          { id: "me", label: "Me" },
          { id: "old-agent", label: "My previous agent" },
          { id: "you", label: "You already have it" },
          { id: "nobody", label: "Nobody - it needs doing" },
        ],
      },
    ],
  },
  {
    id: "heating",
    title: "Heating and water",
    blurb: "The first thing a plumber asks, usually at nine on a Sunday night.",
    icon: "setting",
    questions: [
      {
        id: "heating-type",
        label: "How is it heated?",
        kind: "choice",
        options: [
          { id: "gas-combi", label: "Gas combi boiler" },
          { id: "gas-system", label: "Gas boiler with a hot water tank" },
          { id: "electric", label: "Electric heating" },
          { id: "heat-pump", label: "Heat pump" },
          { id: "other", label: "Something else" },
        ],
      },
      {
        id: "boiler-serviced",
        label: "When was the boiler last serviced?",
        kind: "choice",
        options: [
          { id: "12m", label: "In the last year" },
          { id: "older", label: "Longer ago than that" },
          { id: "never", label: "Never, as far as I know" },
          { id: "na", label: "There isn't one" },
        ],
      },
      {
        id: "stopcock",
        label: "Where is the stopcock?",
        kind: "text",
        placeholder: "Under the kitchen sink, left-hand cupboard",
        suggestions: ["Under the kitchen sink", "In the downstairs toilet", "Under the stairs", "In the airing cupboard", "In the utility room", "Outside, by the front path"],
        help: "A burst pipe is minutes, not hours. This is the single most useful line on this page.",
      },
      {
        id: "consumer-unit",
        label: "Where is the fuse box?",
        kind: "text",
        placeholder: "Hallway, above the front door",
        suggestions: ["Under the stairs", "In the hallway, above the front door", "In a kitchen cupboard", "In the garage", "In the porch", "In the cupboard by the front door"],
      },
    ],
  },
  {
    id: "meters",
    title: "Meters and suppliers",
    blurb: "So the tenant's accounts open on day one and yours close on the same day.",
    icon: "analytics",
    questions: [
      {
        id: "meter-location",
        label: "Where are the meters?",
        kind: "text",
        placeholder: "Electric in the hall cupboard, gas outside by the gate",
        addsUp: true,
        suggestions: ["Electric under the stairs", "Electric in a box outside", "Gas in a box outside", "Gas under the stairs", "Both in a box outside", "In the communal meter cupboard", "Water meter in the pavement outside"],
      },
      {
        id: "electric-supplier",
        label: "Electricity supplier",
        kind: "text",
        placeholder: "Octopus",
        optional: true,
        suggestions: ["British Gas", "Octopus Energy", "EDF", "E.ON Next", "OVO", "Scottish Power", "Not sure"],
      },
      {
        id: "gas-supplier",
        label: "Gas supplier",
        kind: "text",
        placeholder: "British Gas",
        optional: true,
        suggestions: ["British Gas", "Octopus Energy", "EDF", "E.ON Next", "OVO", "Scottish Power", "No gas at the property", "Not sure"],
      },
      {
        id: "water-supplier",
        label: "Water company",
        kind: "text",
        placeholder: "Severn Trent",
        optional: true,
        suggestions: ["Anglian Water", "Severn Trent", "Thames Water", "United Utilities", "Yorkshire Water", "South West Water", "Welsh Water", "Not sure"],
      },
      {
        id: "council-tax-band",
        label: "Council tax band",
        kind: "text",
        placeholder: "C",
        optional: true,
        suggestions: ["A", "B", "C", "D", "E", "F", "Not sure"],
      },
    ],
  },
  {
    id: "outside",
    title: "Outside and around",
    blurb: "The things that end up in the listing, and the things neighbours ring about.",
    icon: "home",
    questions: [
      {
        id: "parking",
        label: "Parking",
        kind: "choice",
        options: [
          { id: "driveway", label: "Driveway" },
          { id: "garage", label: "Garage" },
          { id: "allocated", label: "An allocated space" },
          { id: "street", label: "On the street" },
          { id: "permit", label: "On the street, permit only" },
          { id: "none", label: "None" },
        ],
      },
      {
        id: "garden",
        label: "Who looks after the garden?",
        kind: "choice",
        options: [
          { id: "tenant", label: "The tenant" },
          { id: "me", label: "I do" },
          { id: "arrange", label: "Please arrange a gardener" },
          { id: "none", label: "There isn't one" },
        ],
      },
      {
        id: "bin-day",
        label: "Bin collection day",
        kind: "text",
        placeholder: "Tuesday, black and green alternating",
        optional: true,
        addsUp: true,
        suggestions: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "every week", "alternate weeks"],
      },
      {
        id: "shared",
        label: "Anything shared with the neighbours?",
        kind: "long",
        placeholder: "A shared drive, a shared side gate, a communal bin store…",
        addsUp: true,
        suggestions: ["A shared driveway", "A shared side gate or path", "A communal bin store", "A shared garden", "Nothing shared"],
        optional: true,
      },
    ],
  },
  {
    id: "tenants",
    title: "Your tenants",
    blurb: "How you'd like us to handle the questions that always come up.",
    icon: "message",
    questions: [
      {
        id: "furnishing",
        label: "How is it let?",
        kind: "choice",
        options: [
          { id: "unfurnished", label: "Unfurnished" },
          { id: "part", label: "Part furnished" },
          { id: "furnished", label: "Furnished" },
        ],
      },
      {
        id: "pets",
        label: "If a tenant asks to keep a pet",
        kind: "choice",
        help: "Tenants have a legal right to ask, and a refusal has to be reasonable - so this is how you'd like requests handled, not a yes or no.",
        options: [
          { id: "open", label: "Happy to consider it" },
          { id: "ask", label: "Ask me each time" },
          { id: "reluctant", label: "I'd rather not, but ask me anyway" },
        ],
      },
      {
        id: "smoking",
        label: "Smoking inside",
        kind: "choice",
        options: [
          { id: "no", label: "Not allowed" },
          { id: "ask", label: "Ask me" },
        ],
      },
    ],
  },
  {
    id: "looking-after",
    title: "Looking after it",
    blurb: "What we can get on with, and who to ring when we can't reach you.",
    icon: "pack/photo",
    questions: [
      {
        id: "repair-authority",
        label: "Repairs we can just get on with",
        kind: "choice",
        help: "Your terms allow up to £500 including VAT without asking. You can lower it here.",
        options: [
          { id: "500", label: "Up to £500 - as the terms say" },
          { id: "250", label: "Up to £250" },
          { id: "100", label: "Up to £100" },
          { id: "always-ask", label: "Ask me every time" },
        ],
      },
      {
        id: "contact-pref",
        label: "Best way to reach you",
        kind: "choice",
        options: [
          { id: "phone", label: "Phone" },
          { id: "email", label: "Email" },
          { id: "whatsapp", label: "WhatsApp" },
          { id: "portal", label: "Messages in this portal" },
        ],
      },
      {
        id: "backup-contact",
        label: "Someone else we can call if we can't reach you",
        kind: "text",
        placeholder: "Name and number",
        optional: true,
      },
      {
        id: "anything-else",
        label: "Anything else we should know?",
        kind: "long",
        placeholder: "A quirk of the boiler, a neighbour to avoid, the window that sticks…",
        optional: true,
      },
    ],
  },
];

/** Every question that has to be answered before a step counts as done. */
export function required(step: QuestionStep, answers: Answers = {}): Question[] {
  return step.questions.filter((q) => !q.optional && asked(q, answers));
}

/** Is this question on screen, given what they have answered so far? */
export function asked(q: Question, answers: Answers): boolean {
  if (!q.showIf) return true;
  const v = answers[q.showIf.id];
  return typeof v === "string" && q.showIf.is.includes(v);
}

const filled = (v: Answers[string]) =>
  Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;

export function stepDone(step: QuestionStep, answers: Answers): boolean {
  return required(step, answers).every((q) => filled(answers[q.id]));
}

/** How far through they are, counted in STEPS - the unit they experience. */
export function progress(answers: Answers): { done: number; of: number; pct: number } {
  const of = PROPERTY_QUESTIONS.length;
  const done = PROPERTY_QUESTIONS.filter((s) => stepDone(s, answers)).length;
  return { done, of, pct: Math.round((done / of) * 100) };
}

export function allDone(answers: Answers): boolean {
  return PROPERTY_QUESTIONS.every((s) => stepDone(s, answers));
}

/** The first step still wanting something, so they resume where they stopped. */
export function firstUnfinished(answers: Answers): number {
  const i = PROPERTY_QUESTIONS.findIndex((s) => !stepDone(s, answers));
  return i < 0 ? 0 : i;
}
