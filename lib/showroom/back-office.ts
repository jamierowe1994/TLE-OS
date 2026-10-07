/**
 * THE SHOWROOM'S BACK OFFICE - four walkthroughs of the work that keeps a
 * managed home safe and fixed, each one a guide to read and a live demo to
 * click through, seen from every side.
 *
 * James, 7 Oct 2026: "a back-office section ... walkthroughs on compliance,
 * logging a maintenance issue, sorting out their gas safety, a regular
 * maintenance part and inspection ... they can obviously read through it, but
 * they should also be able to click a live demo ... if a tenant is logging it,
 * they should log it in the portal. You should also give them the option of
 * logging it on the phone ... what they would look and feel like from the
 * landlord, agent, and tenant points of view."
 *
 * ── How a walkthrough is made ─────────────────────────────────────────────
 *
 * A walkthrough is a list of SCENES. Each scene is one person (the actor) at
 * one moment of the story, on their own screen: Sophie on her phone, the
 * office on the Maintenance board, Raj in his portal, Dan on the link in his
 * works order. The screen is the real one, running on the invented world at
 * that moment (lib/showroom/demo-world), so a scene can be clicked: `try`
 * names the control to press and the presses that count, and the player
 * notices when it is done.
 *
 * The guide IS the scenes, read top to bottom - one source, so the words you
 * read and the demo you click can never tell two different stories.
 *
 * Everything said here was checked against the code on 7 Oct 2026, including
 * what does NOT happen yet (`notYet`). When a screen changes, change its scene.
 */

import type { StoryId, WayId } from "@/lib/showroom/demo-world";

export type Actor = "tenant" | "office" | "landlord" | "contractor" | "compliance";

export const ACTORS: Record<Actor, { label: string; who: string; icon: string; tone: string }> = {
  tenant: { label: "Tenant", who: "Sophie, the tenant", icon: "user", tone: "bg-[#fdefec] text-[#a85a51]" },
  office: { label: "Office", who: "Sam, in the OS", icon: "dashboard", tone: "bg-ink text-page" },
  landlord: { label: "Landlord", who: "Raj, the landlord", icon: "home", tone: "bg-[#eef1e6] text-[#4d5a33]" },
  contractor: { label: "Contractor", who: "Dan, Mercer Heating & Gas", icon: "setting", tone: "bg-[#f2f0eb] text-[#5b5346]" },
  compliance: { label: "Compliance", who: "The compliance team", icon: "shield", tone: "bg-[#e9eef5] text-[#3c5675]" },
};

export type ScreenKind =
  | "tenant-repairs" | "landlord-repairs" | "office-maintenance" | "contractor" | "repair"
  | "office-compliance" | "office-verify" | "office-inspections" | "visit"
  | "landlord-documents" | "tenant-documents" | "email";

export interface DemoScreen {
  kind: ScreenKind;
  /** The moment of the story, by name (lib/showroom/demo-world MOMENTS). */
  at: string;
  /** Office screens: open the walkthrough's job, visit or home. */
  open?: boolean;
  /** Maintenance: "planned" for the planned jobs. */
  section?: string;
  /** Maintenance: open the raise form ("repair" | "planned"), as Book it does. */
  raise?: string;
  /** For an email scene: the catalogue id. */
  email?: string;
}

export interface DemoScene {
  id: string;
  actor: Actor;
  title: string;
  /** What happens, in two or three sentences. */
  says: string;
  /** Where it happens, for the guide: "Portfolio > Maintenance". */
  where?: string;
  screen: DemoScreen;
  /** The press that moves the story on: what to say, the words on the control, and which presses count. */
  try?: { says: string; hint: string | string[]; near?: string; did: string[] };
  /** The emails that go out at this moment, in order. */
  sends?: string[];
}

export interface BackOfficeJourney {
  id: string;
  title: string;
  lead: string;
  sees: string[];
  story: StoryId;
  who: Actor[];
  /** How it reaches us, when there is more than one door. */
  ways?: { id: WayId; label: string; says: string }[];
  scenes: (way: WayId) => DemoScene[];
  agent: { says: string; href: string };
  notYet: string[];
}

/* ─────────────────────────── the repair ─────────────────────────── */

const REPAIR_WAYS: BackOfficeJourney["ways"] = [
  { id: "portal", label: "In the tenant's portal", says: "Sophie reports it herself, from her phone." },
  { id: "phone", label: "On the phone", says: "Sophie rings the office and you log it while she is on the line." },
  { id: "landlord", label: "From the landlord", says: "Raj tells us from his own portal." },
  { id: "visit", label: "Found on a visit", says: "Spotted at a property visit and raised from the report." },
];

function repairWayIn(way: WayId): DemoScene[] {
  if (way === "phone") {
    return [
      {
        id: "phone-raise", actor: "office", title: "Sophie Rings: Log It While She Talks",
        says: "Press Report a repair on Maintenance. Pick the home and the OS fills in Sophie, Raj and the access notes. Set the trade and how urgent it is, and put what she says in her own words.",
        where: "Portfolio > Maintenance > Report a repair",
        screen: { kind: "office-maintenance", at: "before", raise: "repair" },
        try: { says: "Type what Sophie says is wrong at the top, then press Report it at the foot.", hint: "Report it", did: ["raised"] },
        sends: ["works-tenant-received"],
      },
      {
        id: "phone-email", actor: "tenant", title: "She Has It in Writing",
        says: "The moment you press Report it, Sophie gets \"We've got your repair\": what she told you, the reference, and what happens next.",
        screen: { kind: "email", at: "reported", email: "works-tenant-received" },
        sends: ["works-tenant-received"],
      },
    ];
  }
  if (way === "landlord") {
    return [
      {
        id: "landlord-report", actor: "landlord", title: "Raj Tells Us from His Portal",
        says: "Something he has noticed, or something Sophie has told him. He says what is wrong and how urgent, and it goes to his agent. Up to his limit we just get on with it.",
        where: "Landlord portal > Maintenance",
        screen: { kind: "landlord-repairs", at: "before" },
        try: { says: "Press Report a problem, type what is wrong, then press Send it to Sam.", hint: ["Report a problem", "Send it to"], did: ["landlord_report"] },
      },
      {
        id: "landlord-lands", actor: "office", title: "It Lands on the Board, and in Sam's Inbox",
        says: "The job is on Maintenance straight away as reported by the landlord, and Sam gets an email with a link to it. Read it, set the trade and the urgency, and work it like any other job.",
        where: "Portfolio > Maintenance",
        screen: { kind: "office-maintenance", at: "reported", open: true },
      },
    ];
  }
  if (way === "visit") {
    return [
      {
        id: "visit-finding", actor: "office", title: "Found on a Property Visit",
        says: "Recording a visit, the boiler pressure reads low and Sophie says she tops it up twice a week. On that room's finding, choose Raise a works order, pick the trade and urgency, and press Raise it.",
        where: "Portfolio > Inspections > the visit",
        screen: { kind: "office-inspections", at: "before", open: true },
        try: { says: "Press Raise the works order on the boiler finding, then Raise it.", hint: "Raise the works order", did: ["raise_works_order"] },
      },
      {
        id: "visit-lands", actor: "office", title: "A Job on the Board, Reported by Inspection",
        says: "It carries on Maintenance like any repair, with the room and the finding as its title. The visit links to it, so the report shows what was done about it.",
        where: "Portfolio > Maintenance",
        screen: { kind: "office-maintenance", at: "reported", open: true },
      },
    ];
  }
  return [
    {
      id: "portal-report", actor: "tenant", title: "Sophie Reports It in Her Portal",
      says: "In her tenant area, under Maintenance: where it is and what is wrong, in her own words. There is no urgency to pick. A real emergency, like a burst pipe or no heating in winter, is told to ring.",
      where: "Tenant portal > Maintenance",
      screen: { kind: "tenant-repairs", at: "before" },
      try: { says: "Choose where it is, say what is wrong, and press Report it.", hint: "Report it", did: ["report"] },
    },
    {
      id: "portal-lands", actor: "office", title: "It Lands on the Board as She Wrote It",
      says: "Straight onto Maintenance: routine, trade Other, her words as the title. Nothing is guessed from the words. Read it and grade it: under More, Edit details sets the trade and the urgency.",
      where: "Portfolio > Maintenance",
      screen: { kind: "office-maintenance", at: "reported", open: true },
      try: { says: "Under More, press Edit details and set the trade and urgency.", hint: "Edit details", did: ["edit"] },
    },
  ];
}

const repairRest: DemoScene[] = [
  {
    id: "tell-landlord", actor: "office", title: "One Thing at a Time: Tell the Landlord",
    says: "The Now card on the job only ever asks for the next thing. First, Raj: ring him, and email him the report if you can't get him or to put it in writing.",
    where: "Maintenance > the job > Now",
    screen: { kind: "office-maintenance", at: "reported", open: true },
    try: { says: "Press Rang and emailed.", hint: "Rang and emailed", did: ["tell_landlord"] },
    sends: ["works-landlord-report"],
  },
  {
    id: "landlord-sees", actor: "landlord", title: "Raj Sees It on His Page",
    says: "The report is in his inbox, and the job is on his Maintenance page in his words: what it is, who reported it and what is happening now.",
    where: "Landlord portal > Maintenance",
    screen: { kind: "landlord-repairs", at: "landlord_told" },
    sends: ["works-landlord-report"],
  },
  {
    id: "arranging", actor: "office", title: "Who's Arranging It?",
    says: "Raj can use his own contractor, and the OS follows up on a date until he says it is sorted. Most ask us.",
    where: "Maintenance > the job > Now",
    screen: { kind: "office-maintenance", at: "landlord_told", open: true },
    try: { says: "Press We're organising it.", hint: "We're organising it", did: ["arranging"] },
  },
  {
    id: "pick", actor: "office", title: "Pick a Contractor",
    says: "Your book and the company's, the right trade first and nearest first. Press Contacted on the one you rang and they are emailed the report.",
    where: "Maintenance > the job > Now",
    screen: { kind: "office-maintenance", at: "arranging", open: true },
    try: { says: "Press Contacted beside Mercer Heating & Gas.", hint: "Contacted", did: ["contact_contractor"] },
    sends: ["works-contractor-report"],
  },
  {
    id: "confirmed", actor: "office", title: "They Say Yes",
    says: "When Dan says he will take it, press They've confirmed. The works order goes to him and Sophie hears someone has been found, in the same breath.",
    where: "Maintenance > the job > Now",
    screen: { kind: "office-maintenance", at: "contacted", open: true },
    try: { says: "Press They've confirmed.", hint: "They've confirmed", did: ["contractor_confirmed"] },
    sends: ["works-contractor-order", "works-tenant-found"],
  },
  {
    id: "tenant-found", actor: "tenant", title: "Sophie Hears Someone Is Coming",
    says: "Who is coming and that they will ring her to agree a time. Her portal says it is being arranged.",
    screen: { kind: "email", at: "confirmed", email: "works-tenant-found" },
    sends: ["works-tenant-found"],
  },
  {
    id: "quote", actor: "office", title: "A Quote over Raj's Limit",
    says: "Dan quotes £185 for a new valve. Up to £150 we go ahead without asking. Over that, the quote goes to Raj first and the job waits on him.",
    where: "Maintenance > the job > More > Add a quote",
    screen: { kind: "office-maintenance", at: "confirmed", open: true },
    try: { says: "Under More, press Add a quote and put in 185.", hint: "Add a quote", did: ["quote"] },
    sends: ["works-landlord-approval"],
  },
  {
    id: "approve", actor: "landlord", title: "Raj Says Yes",
    says: "His page shows it waiting on him. He replies yes to the email, or Sam rings him, and Sam presses Landlord approved on the job.",
    where: "Landlord portal > Maintenance",
    screen: { kind: "landlord-repairs", at: "quote" },
    sends: ["works-landlord-approval"],
  },
  {
    id: "book", actor: "contractor", title: "Dan Books It with Sophie",
    says: "Dan rings Sophie, agrees a time, and sets it on his own page. No sign-in: the link in his works order is the key. Sophie, Raj and the office all hear the date.",
    where: "The contractor's link",
    screen: { kind: "contractor", at: "approved" },
    try: { says: "Pick a date and time, then press That's the date.", hint: "That's the date", did: ["date"] },
    sends: ["works-contractor-booked", "works-tenant-booked", "works-landlord-arranged"],
  },
  {
    id: "tenant-booked", actor: "tenant", title: "Booked In",
    says: "Sophie has the date by email, and her portal says it is booked in.",
    where: "Tenant portal > Maintenance",
    screen: { kind: "tenant-repairs", at: "booked" },
    sends: ["works-tenant-booked"],
  },
  {
    id: "done", actor: "contractor", title: "Done, with Photos and the Invoice",
    says: "After the visit Dan marks it done with a line on what he did, adds his photos and drops in his invoice. A certificate from the visit goes in its own box.",
    where: "The contractor's link",
    screen: { kind: "contractor", at: "booked" },
    try: { says: "Write what was done and press Mark it done.", hint: "Mark it done", did: ["done"] },
    sends: ["works-tenant-happy", "works-compliance-done"],
  },
  {
    id: "happy", actor: "tenant", title: "Was It Sorted?",
    says: "One email, one question. Yes closes it. No asks what is still wrong and goes straight back to the office.",
    where: "The link in her email",
    screen: { kind: "repair", at: "done" },
    try: { says: "Answer for Sophie.", hint: "Yes, all sorted", did: ["happy_yes", "happy_no"] },
  },
  {
    id: "paid", actor: "office", title: "Paid and Closed",
    says: "Say who is being paid: the contractor, or you if you paid out of your own pocket. The invoice is on the job and accounts are told. Compliance were told the moment it was done.",
    where: "Maintenance > the job > Now",
    screen: { kind: "office-maintenance", at: "happy", open: true },
    try: { says: "Press Mercer Heating & Gas is paid.", hint: "Mercer Heating & Gas is paid", did: ["payee"] },
    sends: ["works-accounts-invoice"],
  },
  {
    id: "landlord-done", actor: "landlord", title: "Raj Sees It Done",
    says: "Done, who did it and what it cost, in his spend for the year.",
    where: "Landlord portal > Maintenance",
    screen: { kind: "landlord-repairs", at: "invoiced" },
  },
];

const REPAIR: BackOfficeJourney = {
  id: "repair",
  title: "Logging a Repair",
  lead: "A repair can reach us four ways: the tenant's portal, a phone call, the landlord, or a property visit. However it comes in, it becomes one job on Maintenance and runs one step at a time, and everyone hears at the right moment.",
  sees: [
    "The tenant reports it in their portal, or you log it on the phone while they talk.",
    "The job asks for one thing at a time: tell the landlord, who is arranging it, pick a contractor, the date, done, happy, paid.",
    "Over the landlord's limit (£150 unless the job says otherwise), the quote goes to them first.",
    "The contractor books, finishes and invoices from their own link, with no account to set up.",
    "The tenant is asked if it is sorted. A no comes straight back to you.",
  ],
  story: "repair",
  who: ["tenant", "office", "landlord", "contractor"],
  ways: REPAIR_WAYS,
  scenes: (way) => [...repairWayIn(way), ...repairRest],
  agent: { says: "Raise and run jobs on Maintenance, under Portfolio.", href: "/maintenance" },
  notYet: [
    "A repair reported in the tenant's portal sends no email - not to the tenant, and not to the agent. It simply appears on the board. Only one logged in the OS sends \"We've got your repair\".",
    "The landlord cannot approve a quote with a button. They reply to the email, or the agent rings them and presses Landlord approved.",
    "The contractor has no button to accept the job. You press They've confirmed once they have said yes.",
    "There is no repair reporting by WhatsApp or by email yet. Those come in to a person, who logs them like a phone call.",
    "Maintenance is switched off for agents until the back office opens (pilot phase 4).",
  ],
};

/* ─────────────────────────── the gas safety ─────────────────────────── */

const GAS: BackOfficeJourney = {
  id: "gas",
  title: "Sorting the Gas Safety",
  lead: "Every home with gas needs a new gas safety certificate (a CP12) every 12 months, and the tenant must have a copy within 28 days. The OS sees it coming, the office books the engineer as a planned job, the engineer files the certificate from their link, compliance check it, and it goes to the landlord and the tenant.",
  sees: [
    "Compliance shows it due 30 days out, and the agent gets a morning email at 30, 14 and 7 days, and once if it runs out.",
    "Book it on the certificate opens a planned Gas safety job with the due date already filled in.",
    "The engineer books with the tenant, does the check and files the certificate with its expiry date, from the link in their works order.",
    "Compliance check it - the engineer's Gas Safe number is read off the certificate for them - and press Verified.",
    "Verified, it goes to the landlord and the tenant with the certificate attached, and the home is green for another year.",
  ],
  story: "gas",
  who: ["office", "contractor", "tenant", "compliance", "landlord"],
  scenes: () => [
    {
      id: "due", actor: "office", title: "It Shows Up 30 Days Out",
      says: "Compliance lists every managed home with something running out in the next month, worst first. 8 Recreation Terrace's gas safety runs out in 24 days. Open the home to see every certificate it needs.",
      where: "Portfolio > Compliance",
      screen: { kind: "office-compliance", at: "due", open: true },
    },
    {
      id: "chase", actor: "office", title: "The Agent's Morning Email",
      says: "Each morning a certificate on one of your homes is 30, 14 or 7 days out, or has just run out, you get one email listing them.",
      screen: { kind: "email", at: "due", email: "compliance-chase-agent" },
      sends: ["compliance-chase-agent"],
    },
    {
      id: "book-it", actor: "office", title: "Book It",
      says: "Book it on the gas certificate opens a planned job: the home, Gas safety (CP12) and the due date already filled in from the certificate. Sophie, Raj and the access notes come with the home.",
      where: "Compliance > the home > Book it",
      screen: { kind: "office-maintenance", at: "due", raise: "planned" },
      try: { says: "Type what the job is at the top (say, Gas safety renewal), check the rest, then press Plan it.", hint: "Plan it", did: ["raised"] },
    },
    {
      id: "gas-landlord", actor: "office", title: "The Same Steps as a Repair",
      says: "A planned job runs the same way: tell Raj, decide who is arranging it, pick a Gas Safe engineer. Dan is nearest.",
      where: "Maintenance > Planned > the job",
      screen: { kind: "office-maintenance", at: "landlord_told", open: true, section: "planned" },
      try: { says: "Press Contacted beside Mercer Heating & Gas.", hint: "Contacted", did: ["contact_contractor"] },
      sends: ["works-contractor-report"],
    },
    {
      id: "gas-confirmed", actor: "office", title: "Works Order Out",
      says: "Dan says yes. Press They've confirmed and his works order goes out with his own link, and Sophie hears an engineer will ring her.",
      where: "Maintenance > the job > Now",
      screen: { kind: "office-maintenance", at: "contacted", open: true, section: "planned" },
      try: { says: "Press They've confirmed.", hint: "They've confirmed", did: ["contractor_confirmed"] },
      sends: ["works-contractor-order", "works-tenant-found"],
    },
    {
      id: "gas-book", actor: "contractor", title: "Dan Books It with Sophie",
      says: "He agrees a time with her and sets it on his page. Sophie gets the date, Raj hears it is arranged.",
      where: "The contractor's link",
      screen: { kind: "contractor", at: "confirmed" },
      try: { says: "Pick a date and time, then press That's the date.", hint: "That's the date", did: ["date"] },
      sends: ["works-contractor-booked", "works-tenant-booked", "works-landlord-arranged"],
    },
    {
      id: "gas-tenant", actor: "tenant", title: "Sophie Knows When",
      says: "The date and the engineer's name, so she can be in or leave a key.",
      screen: { kind: "email", at: "booked", email: "works-tenant-booked" },
      sends: ["works-tenant-booked"],
    },
    {
      id: "gas-cert", actor: "contractor", title: "Dan Files the Certificate",
      says: "After the check, he says what it is (Gas safety, CP12) and when it runs out, and chooses the file. It goes on the home's record, the job is marked done, and it waits for compliance to check it.",
      where: "The contractor's link > A certificate from the visit",
      screen: { kind: "contractor", at: "booked" },
      try: { says: "Choose Gas safety (CP12), a date a year away, then choose any file.", hint: "Choose the certificate", did: ["certificate"] },
      sends: ["works-tenant-done", "works-compliance-done"],
    },
    {
      id: "gas-verify", actor: "compliance", title: "Compliance Check It",
      says: "To verify lists every certificate that has come in, oldest first. The engineer's Gas Safe number is read off for them: copy it, check it on the register, and press Verified. If something is wrong, Query it and the agent is emailed what they wrote.",
      where: "Compliance desk > To verify",
      screen: { kind: "office-verify", at: "certificate" },
      try: { says: "Press Verified on the gas safety certificate.", hint: "Verified", did: ["verified", "queried"] },
    },
    {
      id: "gas-shared", actor: "landlord", title: "Raj Gets It",
      says: "Verified, the new certificate goes to Raj with the PDF attached and the date it next runs out.",
      screen: { kind: "email", at: "verified", email: "certificate-shared-landlord" },
      sends: ["certificate-shared-landlord", "certificate-shared-tenant", "certificate-shared-contractor", "certificate-shared-compliance"],
    },
    {
      id: "gas-tenant-copy", actor: "tenant", title: "And So Does Sophie",
      says: "Her copy, which the law says she must have within 28 days of the check.",
      screen: { kind: "email", at: "verified", email: "certificate-shared-tenant" },
      sends: ["certificate-shared-tenant"],
    },
    {
      id: "gas-green", actor: "office", title: "Green for Another Year",
      says: "The home drops off the due list. The gas safety now shows in date for 12 months, and the cycle starts again 30 days before it runs out.",
      where: "Portfolio > Compliance",
      screen: { kind: "office-compliance", at: "verified", open: true },
    },
  ],
  agent: { says: "Book it from the home on Compliance, then run the job on Maintenance under Planned.", href: "/compliance" },
  notYet: [
    "Nothing books the gas safety on its own. The OS shows it due and emails the agent; a person presses Book it.",
    "The landlord is not emailed before a certificate runs out. Only the agent's morning email is wired.",
    "Certificates only go to the landlord and tenant once the certificate-sending switch is on, and only for a renewal with a tenant in the home.",
    "If the landlord uses their own engineer, they send the certificate from their portal and compliance enter the expiry date when they verify it.",
    "The tenant's own Documents page does not yet show the certificate. They get it by email.",
  ],
};

/* ─────────────────────────── compliance ─────────────────────────── */

const COMPLIANCE: BackOfficeJourney = {
  id: "compliance",
  title: "Compliance, End to End",
  lead: "Which certificates every home needs, how the OS knows when one is running out, who is told, and how a new one is checked before it reaches the landlord and the tenant - whichever door it came in through.",
  sees: [
    "Every home needs an EICR and an EPC, and a gas safety if it has gas. An HMO also needs its licence, fire safety, PAT and alarms.",
    "One list of every managed home, worst first, with a tile per certificate and Book it on each.",
    "Agents see only their own homes. The office sees the whole book.",
    "A new certificate can come from the contractor's link, the landlord's portal or the office. Whichever way, compliance check it first.",
    "Verified, it goes to the landlord and the tenant. Queried, the agent is emailed what is wrong.",
  ],
  story: "compliance",
  who: ["office", "landlord", "compliance", "tenant"],
  scenes: () => [
    {
      id: "book", actor: "office", title: "Every Home, Worst First",
      says: "The book: every home we manage, with the next month's renewals at the top. Let-only homes are not here - their certificates are the landlord's job.",
      where: "Portfolio > Compliance",
      screen: { kind: "office-compliance", at: "book" },
    },
    {
      id: "home", actor: "office", title: "What One Home Needs",
      says: "Open a home: a tile for every certificate it needs, in date, due or missing, with Book it on each. A home that has said it has no gas shows No gas and is never chased for one.",
      where: "Compliance > the home",
      screen: { kind: "office-compliance", at: "book", open: true },
    },
    {
      id: "chase", actor: "office", title: "Who Is Told, and When",
      says: "Every morning a certificate is 30, 14 or 7 days from running out, and once when it has run out, the agent on the home gets one email listing them.",
      screen: { kind: "email", at: "book", email: "compliance-chase-agent" },
      sends: ["compliance-chase-agent"],
    },
    {
      id: "landlord-upload", actor: "landlord", title: "Raj Sends His Own",
      says: "A landlord who uses their own electrician sends the new certificate from their portal. It goes to the compliance team to check, not straight onto the record.",
      where: "Landlord portal > Documents",
      screen: { kind: "landlord-documents", at: "book" },
      try: { says: "Press Send the new one on the EICR row and choose any file.", hint: "Send the new one", did: ["landlord_upload"] },
    },
    {
      id: "verify", actor: "compliance", title: "Three Doors, One Check",
      says: "To verify holds everything that has come in: from a contractor's link, a landlord's portal or the office. Gas and electrical ones have the engineer's register number read off. A landlord's upload needs its expiry date typed as it is verified.",
      where: "Compliance desk > To verify",
      screen: { kind: "office-verify", at: "uploaded" },
      try: { says: "Verify one, or Query one with a note.", hint: "Verified", did: ["verified", "queried"] },
    },
    {
      id: "shared", actor: "landlord", title: "Verified: Out It Goes",
      says: "The landlord gets the new certificate with the PDF attached, and the tenant gets a copy. A copy also goes to the compliance inbox for the record.",
      screen: { kind: "email", at: "verified", email: "certificate-shared-landlord" },
      sends: ["certificate-shared-landlord", "certificate-shared-tenant", "certificate-shared-compliance"],
    },
    {
      id: "own", actor: "office", title: "Your Own Compliance",
      says: "Agents hold things of their own too: ID, Right to Rent and AML training, data protection. Mark them on your profile, and you are reminded each morning one is missing or running out.",
      where: "Your profile",
      screen: { kind: "email", at: "book", email: "own-compliance" },
      sends: ["own-compliance"],
    },
  ],
  agent: { says: "Your homes are on Compliance, under Portfolio. Your own checks are on your profile.", href: "/compliance" },
  notYet: [
    "The landlord's reminder before a certificate runs out is written but not wired. Only the agent is emailed.",
    "The email to the agent when compliance query a document is not in the email catalogue, so it cannot be opened here.",
    "The tenant's Documents page still shows the gas safety and EPC as \"Not yet\" - they get certificates by email.",
    "Compliance is hidden from agents until the area is opened in Admin.",
  ],
};

/* ─────────────────────── visits and planned maintenance ─────────────────────── */

const VISITS: BackOfficeJourney = {
  id: "visits",
  title: "Visits and Planned Maintenance",
  lead: "Regular property visits - the first three months in, then every six, every three for an HMO - booked with the tenant in writing, recorded room by room on the day, sent to the landlord, and anything found raised as a job. Alongside them, the planned work every home needs each year.",
  sees: [
    "The due list on Inspections, and Book it on each home.",
    "Book a time straight away, or send the tenant some dates and let them choose from a link.",
    "On the day: the safety checks, then each room with photos, then the write-up.",
    "Anything that needs fixing becomes a works order from the finding.",
    "The landlord gets the report, room by room, and sees the visit on their page.",
  ],
  story: "visits",
  who: ["office", "tenant", "landlord"],
  scenes: () => [
    {
      id: "due", actor: "office", title: "Who Is Due a Visit",
      says: "The Due tab lists every managed home that is due a visit, with when and why. Book it raises the visit and opens it.",
      where: "Portfolio > Inspections > Due",
      screen: { kind: "office-inspections", at: "due" },
      try: { says: "Press Book it on 8 Recreation Terrace.", hint: "Book it", near: "8 Recreation Terrace", did: ["inspection_raised"] },
    },
    {
      id: "ask", actor: "office", title: "Let Sophie Choose",
      says: "Offer her a few times and press Send. She gets an email with a link to pick one. Or book a time straight away and the confirmation is her notice.",
      where: "Inspections > the visit > Now",
      screen: { kind: "office-inspections", at: "raised", open: true },
      try: { says: "Press Let Sophie choose, pick a few times, then press Send Sophie the dates.", hint: ["Let Sophie choose", "Send Sophie the dates"], did: ["ask_access", "schedule"] },
      sends: ["inspection-tenant-access"],
    },
    {
      id: "tenant-picks", actor: "tenant", title: "Sophie Picks a Time",
      says: "Her home and her say: yes to a time, none of these, or no - each the same size on the page. A yes books it.",
      where: "The link in her email",
      screen: { kind: "visit", at: "asked" },
      try: { says: "Pick one of the times for Sophie, then press That time works.", hint: "That time works", did: ["visit_reply"] },
    },
    {
      id: "confirm", actor: "office", title: "Confirm It in Writing",
      says: "It is in the diary. Press Email the confirmation and Sophie has the date, the time and who is coming.",
      where: "Inspections > the visit > Now",
      screen: { kind: "office-inspections", at: "booked", open: true },
      try: { says: "Press Email Sophie the confirmation.", hint: "Email Sophie the confirmation", did: ["confirm"] },
      sends: ["inspection-tenant-booked"],
    },
    {
      id: "record", actor: "office", title: "On the Day: Record It",
      says: "The safety checks first - smoke and CO alarms, heating, damp, leaks - then each room: its condition, a note, photos, and what should happen about anything found.",
      where: "Inspections > the visit > Record the visit",
      screen: { kind: "office-inspections", at: "confirmed", open: true },
      try: { says: "Press Record the visit.", hint: "Record the visit", did: ["visited", "checks", "finding"] },
    },
    {
      id: "raise", actor: "office", title: "Anything Found Becomes a Job",
      says: "The boiler finding is marked Raise a works order. Pick the trade and urgency and press Raise it: it carries on Maintenance, and the visit links to it.",
      where: "Inspections > the visit > Findings",
      screen: { kind: "office-inspections", at: "reported", open: true },
      try: { says: "Press Raise the works order, then Raise it.", hint: "Raise the works order", did: ["raise_works_order"] },
    },
    {
      id: "send", actor: "office", title: "Send Raj the Report",
      says: "Written up with the overall condition and a summary, press Send the report. Raj gets every check and every room, photos and all.",
      where: "Inspections > the visit > Now",
      screen: { kind: "office-inspections", at: "reported", open: true },
      try: { says: "Press Send the report.", hint: "Send the report", did: ["report_sent"] },
      sends: ["inspection-landlord-report"],
    },
    {
      id: "landlord-report", actor: "landlord", title: "Raj Reads It",
      says: "How the home is being kept, room by room, with the checks and the photos, and what is happening about each thing found.",
      screen: { kind: "email", at: "sent", email: "inspection-landlord-report" },
      sends: ["inspection-landlord-report"],
    },
    {
      id: "landlord-page", actor: "landlord", title: "And on His Page",
      says: "His Maintenance page shows the visit, its condition, and the job it raised.",
      where: "Landlord portal > Maintenance",
      screen: { kind: "landlord-repairs", at: "sent" },
    },
    {
      id: "planned", actor: "office", title: "Planned Maintenance",
      says: "The work every home needs on a date rather than because something broke: the gas safety, the EICR, a boiler service, alarm tests. Each is a planned job on Maintenance, due by its date, run exactly like a repair.",
      where: "Portfolio > Maintenance > Planned",
      screen: { kind: "office-maintenance", at: "sent", section: "planned" },
    },
  ],
  agent: { says: "Book and record visits on Inspections, under Portfolio. Planned jobs are on Maintenance.", href: "/inspections" },
  notYet: [
    "Planned maintenance is raised by hand. Nothing raises a yearly boiler service or alarm test on its own yet.",
    "The due list is read from the old system's open visit tasks for now; the OS's own cadence (3 months, then every 6, HMOs every 3) is ready behind it.",
    "Tell the landlord too only notes that they were told - it sends no email.",
    "A works order raised from a visit does not email the tenant.",
    "Inspections are switched off for agents until the back office opens (pilot phase 4).",
  ],
};

/** In the order James listed them. */
export const BACK_OFFICE: BackOfficeJourney[] = [COMPLIANCE, REPAIR, GAS, VISITS];

/** Every email any walkthrough shows: the Showroom's email route renders only these. */
export const BACK_OFFICE_EMAIL_IDS: string[] = Array.from(
  new Set(
    BACK_OFFICE.flatMap((j) => (j.ways ?? [{ id: "portal" as WayId }]).flatMap((w) => j.scenes(w.id)).flatMap((s) => [...(s.sends ?? []), ...(s.screen.email ? [s.screen.email] : [])]))
  )
);
