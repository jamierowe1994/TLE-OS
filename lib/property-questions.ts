/**
 * WHAT WE ASK A LANDLORD ABOUT THEIR HOME, BEFORE THEY SIGN.
 *
 * James, 15 Sep 2026: "we're going to need to make sure that we're taking as
 * much data as possible without it being overwhelming." Asked after the
 * contract until 5 Nov 2026, when it moved in front of it (James: "these
 * pre-populated questions should always go before the contract because they
 * need to answer them before the contract"), with Susan Liles's additions of
 * 4 Nov 2026: the gas appliances, the boiler and any cover on it, the alarm
 * and its code, building and gate codes and parking, the stopcock, fuse box
 * and each meter (and whether it is a card meter), and the freeholder or
 * managing agent of a leasehold home.
 *
 * Those two pull against each other, so the rules below decide it rather than
 * taste:
 *
 *   1. EVERY QUESTION IS SOMETHING SOMEBODY LATER NEEDS. The compliance module
 *      chases certificates, the works orders need a stopcock and an authority
 *      limit, the listing needs furnishing and parking, check-in needs meters,
 *      the gas safety certificate needs the appliances.
 *   2. NOTHING WE ALREADY HOLD. Not the address, the rent, the fee or the
 *      service level - they are on the contract itself. And whatever the
 *      agent answered when they sent it (components/terms/TermsSendScreen)
 *      is not asked again.
 *   3. ONE SUBJECT A SCREEN. Short screens beat one long form; a form that
 *      fits on a phone without scrolling gets finished on a phone.
 *   4. GAS IS THE LANDLORD'S. Whether there is gas at all is their
 *      declaration on the contract (no gas at the property), so nobody else
 *      answers anything on the Gas screen (James, 5 Nov 2026: "always has to
 *      be the landlord").
 *
 * ── Codes are kept locked away ────────────────────────────────────────────
 *
 * The alarm code and the building or gate code (Susan asked for both) are
 * `secret`: sealed at rest (lib/bank-vault), never sent back to the form that
 * took them, and shown only to staff on the home's file. Bank details are not
 * here at all: they go on the contract (lib/terms) and are sealed there.
 *
 * ── Nothing that filters a tenant unlawfully ──────────────────────────────
 *
 * No "no benefits", no "no children", no nationality. Those are unlawful under
 * the Equality Act and the Renters' Rights Act 2025 that this very contract is
 * written to, and a dropdown offering one makes the agency the author of the
 * discrimination rather than the landlord. Pets are asked as the Act frames
 * them - the tenant has a statutory right to REQUEST, and the landlord may not
 * unreasonably refuse - so pets are welcome by default and the only other
 * answer is a genuine reason, written down for the agent to check.
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
  /**
   * They said they have it, so let them send it there and then (Howard,
   * 1 Oct 2026) rather than finding the Documents page later. `kind` is the
   * landlord document kind (lib/landlord-account DOC_KINDS); shown when the
   * answer is one of `when`.
   */
  upload?: { kind: string; title: string; when: string[] };
  /** Only the landlord answers it: the agent's screen shows it as theirs and never fills it in. */
  who?: "landlord";
  /** A code: sealed at rest, never sent back to a form, shown only to staff on the home's file. */
  secret?: boolean;
  /**
   * A meter: where it is, and whether it is a card or key meter (Susan, 4 Nov
   * 2026), kept as `<id>-card`, "yes" or "no". Not asked when the answer is
   * one of `noMeter` ("There isn't a water meter").
   */
  card?: boolean;
  noMeter?: string[];
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
    title: "Who's There and Keys",
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
    ],
  },
  {
    id: "getting-in",
    title: "Codes and Alarm",
    blurb: "The things that stop a viewing at the front door. Codes are kept locked away.",
    icon: "lock",
    questions: [
      {
        id: "entry-code",
        label: "Is there a building or gate code?",
        kind: "choice",
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      },
      {
        id: "entry-code-detail",
        label: "The code, and where the keypad is",
        kind: "text",
        secret: true,
        placeholder: "1234, keypad on the left of the main door",
        help: "Kept locked away, and only shown to the team looking after your home.",
        showIf: { id: "entry-code", is: ["yes"] },
      },
      {
        id: "alarm",
        label: "Is there an alarm?",
        kind: "choice",
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      },
      {
        id: "alarm-model",
        label: "Alarm make and model",
        kind: "text",
        placeholder: "Yale Sync",
        showIf: { id: "alarm", is: ["yes"] },
        suggestions: ["Yale", "Honeywell", "Texecom", "Pyronix", "Ring", "ADT", "Not sure"],
      },
      {
        id: "alarm-code",
        label: "The alarm code",
        kind: "text",
        secret: true,
        help: "Kept locked away, and only shown to the team looking after your home.",
        showIf: { id: "alarm", is: ["yes"] },
        suggestions: ["I'll give it to my agent in person"],
      },
    ],
  },
  {
    id: "gas",
    title: "Gas",
    blurb: "Only you can answer this one. If there's no gas, you confirm it on your contract.",
    icon: "shield",
    questions: [
      {
        id: "gas-supply",
        label: "Is there gas at the property?",
        kind: "choice",
        who: "landlord",
        options: [
          { id: "yes", label: "Yes, it has gas" },
          { id: "no", label: "No gas at the property" },
        ],
      },
      {
        id: "gas-appliances",
        label: "Which gas appliances are there?",
        kind: "text",
        who: "landlord",
        addsUp: true,
        help: "They all go on the gas safety certificate.",
        placeholder: "Boiler and gas hob",
        showIf: { id: "gas-supply", is: ["yes"] },
        suggestions: ["Boiler", "Gas hob", "Gas oven", "Gas fire", "Range cooker", "Water heater", "Gas tumble dryer", "Not sure"],
      },
      {
        id: "gas",
        label: "Gas safety certificate (CP12)",
        kind: "choice",
        who: "landlord",
        showIf: { id: "gas-supply", is: ["yes"] },
        options: [
          { id: "have", label: "I have a current one" },
          { id: "expired", label: "I have one, but it's out of date" },
          { id: "none", label: "I don't have one" },
        ],
        upload: { kind: "gas", title: "Gas safety certificate (CP12)", when: ["have", "expired"] },
      },
      {
        id: "gas-meter",
        label: "Where is the gas meter?",
        kind: "text",
        who: "landlord",
        card: true,
        noMeter: ["Not sure"],
        placeholder: "In a box outside, by the front door",
        showIf: { id: "gas-supply", is: ["yes"] },
        suggestions: ["In a box outside", "Under the stairs", "In the kitchen", "In the communal meter cupboard", "Not sure"],
      },
      {
        id: "gas-supplier",
        label: "Gas supplier",
        kind: "text",
        who: "landlord",
        optional: true,
        placeholder: "British Gas",
        showIf: { id: "gas-supply", is: ["yes"] },
        suggestions: ["British Gas", "Octopus Energy", "EDF", "E.ON Next", "OVO", "Scottish Power", "Not sure"],
      },
    ],
  },
  {
    id: "safety",
    title: "Certificates",
    blurb: "It can't be marketed without these, so knowing what you have saves a fortnight.",
    icon: "checklist",
    questions: [
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
        upload: { kind: "eicr", title: "Electrical safety report (EICR)", when: ["have", "expired"] },
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
        upload: { kind: "epc", title: "Energy Performance Certificate (EPC)", when: ["have"] },
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
        upload: { kind: "other", title: "Property paperwork", when: ["me"] },
      },
    ],
  },
  {
    id: "heating",
    title: "Heating and Boiler",
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
        id: "boiler-model",
        label: "Boiler make and model",
        kind: "text",
        placeholder: "Worcester Bosch Greenstar 30i",
        showIf: { id: "heating-type", is: ["gas-combi", "gas-system", "other"] },
        suggestions: ["Worcester Bosch", "Vaillant", "Baxi", "Ideal", "Viessmann", "Glow-worm", "Potterton", "Not sure"],
      },
      {
        id: "boiler-location",
        label: "Where is the boiler?",
        kind: "text",
        placeholder: "Kitchen, in the corner cupboard",
        showIf: { id: "heating-type", is: ["gas-combi", "gas-system", "other"] },
        suggestions: ["In the kitchen", "In the utility room", "In the airing cupboard", "In the loft", "In the garage", "In a bedroom cupboard", "Not sure"],
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
        id: "boiler-cover",
        label: "Any cover or maintenance plans?",
        kind: "text",
        addsUp: true,
        help: "Boiler, gas, electrics or home emergency cover: who it's with, and the policy number if you have it.",
        placeholder: "British Gas HomeCare 200, policy 123456",
        suggestions: ["None", "British Gas HomeCare", "Boiler manufacturer's warranty", "Home emergency cover", "Electrical cover", "Plumbing and drains cover"],
      },
    ],
  },
  {
    id: "water-power",
    title: "Water, Power and Meters",
    blurb: "A burst pipe is minutes, not hours. And the tenant's accounts open on day one.",
    icon: "analytics",
    questions: [
      {
        id: "stopcock",
        label: "Where is the stopcock?",
        kind: "text",
        placeholder: "Under the kitchen sink, left-hand cupboard",
        suggestions: ["Under the kitchen sink", "In the downstairs toilet", "Under the stairs", "In the airing cupboard", "In the utility room", "Outside, by the front path", "Not sure"],
        help: "This is the single most useful line on this page.",
      },
      {
        id: "consumer-unit",
        label: "Where is the fuse box?",
        kind: "text",
        placeholder: "Hallway, above the front door",
        suggestions: ["Under the stairs", "In the hallway, above the front door", "In a kitchen cupboard", "In the garage", "In the porch", "In the cupboard by the front door", "Not sure"],
      },
      {
        id: "electric-meter",
        label: "Where is the electricity meter?",
        kind: "text",
        card: true,
        noMeter: ["Not sure"],
        placeholder: "Under the stairs",
        suggestions: ["Under the stairs", "In a box outside", "In the hallway cupboard", "In the communal meter cupboard", "In the garage", "Not sure"],
      },
      {
        id: "water-meter",
        label: "Where is the water meter?",
        kind: "text",
        card: true,
        noMeter: ["There isn't a water meter", "Not sure"],
        placeholder: "In the pavement outside",
        suggestions: ["There isn't a water meter", "In the pavement outside", "Under the kitchen sink", "In the communal meter cupboard", "Not sure"],
      },
    ],
  },
  {
    id: "suppliers",
    title: "Suppliers and Council Tax",
    blurb: "So the tenant's accounts open on day one and yours close on the same day. All optional.",
    icon: "coin",
    questions: [
      {
        id: "electric-supplier",
        label: "Electricity supplier",
        kind: "text",
        placeholder: "Octopus",
        optional: true,
        suggestions: ["British Gas", "Octopus Energy", "EDF", "E.ON Next", "OVO", "Scottish Power", "Not sure"],
      },
      {
        id: "water-supplier",
        label: "Water company",
        kind: "text",
        placeholder: "Severn Trent",
        optional: true,
        suggestions: ["Anglian Water", "Severn Trent", "Thames Water", "United Utilities", "Yorkshire Water", "Scottish Water", "Welsh Water", "Not sure"],
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
    id: "leasehold",
    title: "Freehold or Leasehold",
    blurb: "A leasehold home's tenancy has to follow the lease, so we need to be able to reach the freeholder or managing agent.",
    icon: "pack/building",
    questions: [
      {
        id: "tenure",
        label: "Is the property freehold or leasehold?",
        kind: "choice",
        options: [
          { id: "freehold", label: "Freehold" },
          { id: "leasehold", label: "Leasehold" },
          { id: "share", label: "Share of freehold" },
          { id: "unsure", label: "Not sure" },
        ],
      },
      { id: "freeholder-name", label: "Freeholder or managing agent's name", kind: "text", placeholder: "Anytown Estates Ltd", showIf: { id: "tenure", is: ["leasehold", "share"] } },
      { id: "freeholder-address", label: "Their address", kind: "text", placeholder: "12 High Street, Anytown", showIf: { id: "tenure", is: ["leasehold", "share"] } },
      { id: "freeholder-postcode", label: "Their postcode", kind: "text", placeholder: "AB1 2CD", showIf: { id: "tenure", is: ["leasehold", "share"] } },
      { id: "freeholder-phone", label: "Their telephone", kind: "text", optional: true, placeholder: "01234 567890", showIf: { id: "tenure", is: ["leasehold", "share"] } },
      { id: "freeholder-email", label: "Their email", kind: "text", optional: true, placeholder: "block@anytownestates.co.uk", showIf: { id: "tenure", is: ["leasehold", "share"] } },
    ],
  },
  {
    id: "outside",
    title: "Outside and Around",
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
        id: "parking-detail",
        label: "The space, fob or permit",
        kind: "text",
        placeholder: "Space 14, fob for the car park gate",
        showIf: { id: "parking", is: ["garage", "allocated", "permit"] },
        suggestions: ["The space number is on the deeds", "A fob for the car park", "A garage key on the bunch", "A permit from the council"],
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
    title: "Your Tenants",
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
      /* Susan, 19 Sep 2026: under the Renters' Rights Act a landlord cannot
         refuse a pet without a genuine reason - a severe allergy, a head-lease
         that forbids it. So nothing here offers "no". The old "I'd rather not"
         answer (reluctant) is gone; a landlord who chose it answers again. */
      {
        id: "pets",
        label: "Pets",
        kind: "choice",
        help: "Under the Renters' Rights Act a tenant can keep a pet unless there is a genuine reason they can't, such as a severe allergy or a lease that forbids it. You can ask for pet insurance.",
        options: [
          { id: "open", label: "Pets are welcome" },
          { id: "ask", label: "Welcome - tell me about the pet first" },
          { id: "reason", label: "There's a genuine reason a pet can't live here" },
        ],
      },
      {
        id: "pets-reason",
        label: "What's the reason?",
        kind: "long",
        help: "We'll check it counts as a reasonable refusal before we rely on it.",
        suggestions: ["Severe allergy in the household", "The head-lease doesn't allow pets", "Building rules don't allow pets"],
        showIf: { id: "pets", is: ["reason"] },
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
    title: "Looking After It",
    blurb: "What we can get on with, and who to ring when we can't reach you.",
    icon: "pack/photo",
    questions: [
      {
        id: "repair-authority",
        label: "Repairs we can just get on with",
        kind: "choice",
        help: "The terms let us spend up to £500 including VAT without asking. You can lower it here.",
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

export const filled = (v: Answers[string]) =>
  Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;

/** A meter question with a place given also wants to know if it is a card meter. */
export const cardKey = (id: string) => `${id}-card`;
export function cardAsked(q: Question, answers: Answers): boolean {
  const v = answers[q.id];
  return Boolean(q.card) && typeof v === "string" && v.trim() !== "" && !(q.noMeter ?? []).includes(v.trim());
}

/** This question still wants something: the answer itself, or whether its meter takes a card. */
export function wants(q: Question, answers: Answers): boolean {
  if (!asked(q, answers)) return false;
  if (!q.optional && !filled(answers[q.id])) return true;
  return cardAsked(q, answers) && !filled(answers[cardKey(q.id)]);
}

export function stepDone(step: QuestionStep, answers: Answers): boolean {
  return !step.questions.some((q) => wants(q, answers));
}

/** Every key an answer can be stored under: each question, and each meter's card answer. */
export const ANSWER_KEYS: Set<string> = new Set(
  PROPERTY_QUESTIONS.flatMap((s) => s.questions.flatMap((q) => (q.card ? [q.id, cardKey(q.id)] : [q.id])))
);

/** The codes: sealed at rest, never sent back to a form. */
export const SECRET_KEYS: Set<string> = new Set(PROPERTY_QUESTIONS.flatMap((s) => s.questions.filter((q) => q.secret).map((q) => q.id)));

/** What only the landlord answers (the Gas screen): the agent can never set these. */
export const LANDLORD_KEYS: Set<string> = new Set(
  PROPERTY_QUESTIONS.flatMap((s) => s.questions.filter((q) => q.who === "landlord").flatMap((q) => (q.card ? [q.id, cardKey(q.id)] : [q.id])))
);

/** A code that is saved, as a form is told it: there, but not what it is. */
export const KEPT = "__kept__";

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
