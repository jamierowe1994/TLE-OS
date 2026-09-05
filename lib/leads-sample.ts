/**
 * Demo lead book for the wireframe — deliberately 24 rows so the list
 * behaves like a real working day rather than a tidy screenshot.
 *
 * Sources are the honest mix: Rightmove / Zoopla / OnTheMarket and the
 * website land in REX; Facebook and Instagram land in GoHighLevel. Nothing
 * here is real data — these are placeholder people.
 */

export type Stage =
  | "New"
  | "Contacted"
  | "Viewing booked"
  | "Qualified"
  | "Waiting"
  | "Not proceeding"
  /** REX's own third state: the enquiry has been dealt with. Deliberately
   *  NOT mapped onto "Qualified" — REX doesn't say which way it went, and
   *  guessing would put words in the team's mouth. */
  | "Closed";

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  enquiry: "Letting" | "Landlord" | "Valuation";
  area: string;
  budget: string;
  source: string;
  received: string;
  stage: Stage;
  moveDate: string;
  preferred: string;
  agent: string;
  notes: string;
  /** Approximate geotag for radius search — real leads get exact ones from
   *  the address lookup; the demo book carries town-level points. */
  lat?: number;
  lng?: number;
  activity: { icon: string; text: string; when: string }[];
  /* ── Only real REX leads carry these; the demo book leaves them unset. ── */
  /** ISO timestamp, so the list can sort on something better than "10m ago". */
  receivedAt?: string;
  /** What the applicant themselves typed. Kept separate from `notes`, which
   *  is the agency's own writing — showing one as the other puts words in
   *  somebody's mouth. */
  enquiryMessage?: string;
  /** The listing's own photo, for leads attached to a property. */
  photo?: string;
  address?: string;
  listingId?: number;
  /** Which office the listing belongs to — this REX account is shared. */
  office?: string;
  subject?: string;
  /** The OS's own word for where a landlord lead is - "2nd contact",
   *  "Nurture", "Appraisal booked" - folded from the log (lib/lead-spine).
   *  Unset when nothing has been logged, and the REX stage stands. */
  spineLabel?: string;
};

export const STAGE_TONE: Record<Stage, "accent" | "neutral" | "good"> = {
  New: "accent",
  Contacted: "neutral",
  "Viewing booked": "neutral",
  Qualified: "good",
  Waiting: "neutral",
  "Not proceeding": "neutral",
  Closed: "neutral",
};

const act = (icon: string, text: string, when: string) => ({ icon, text, when });

export const LEADS: Lead[] = [
  {
    id: "l1", lat: 53.4166, lng: -2.231, name: "Sarah Johnson", email: "sarah.johnson@gmail.com", phone: "07712 345 678",
    enquiry: "Letting", area: "Didsbury", budget: "£1,200 pcm", source: "Rightmove",
    received: "10m ago", stage: "New", moveDate: "1 Sep 2026",
    preferred: "Didsbury, Withington", agent: "Kirstie",
    notes: "Looking for a 2-bed flat with parking. Pet friendly.",
    activity: [
      act("target", "Lead received from Rightmove", "10 minutes ago"),
      act("mail", "Auto-response email sent", "9 minutes ago"),
      act("call", "Call attempted — no answer", "5 minutes ago"),
      act("calendar", "Follow-up due today", "Today at 14:00"),
    ],
  },
  {
    id: "l2", lat: 53.4444, lng: -2.276, name: "Tom Williams", email: "t.williams84@outlook.com", phone: "07945 678 901",
    enquiry: "Letting", area: "Chorlton", budget: "£1,000 pcm", source: "Zoopla",
    received: "25m ago", stage: "Contacted", moveDate: "15 Sep 2026",
    preferred: "Chorlton", agent: "Kirstie", notes: "Sharer, needs two doubles.",
    activity: [
      act("target", "Lead received from Zoopla", "25 minutes ago"),
      act("call", "Spoke — sending shortlist", "12 minutes ago"),
    ],
  },
  {
    id: "l3", lat: 52.3792, lng: -1.5615, name: "Chloe Adams", email: "chloe.adams.property@gmail.com", phone: "07890 123 456",
    enquiry: "Landlord", area: "Coventry", budget: "3-bed to let", source: "Facebook ad",
    received: "2h ago", stage: "New", moveDate: "Flexible",
    preferred: "Coventry CV4", agent: "Unassigned",
    notes: "Landlord enquiry from the paid campaign — wants a valuation.",
    activity: [
      act("megaphone", "Lead captured by Facebook campaign", "2 hours ago"),
      act("link", "Synced from GoHighLevel", "2 hours ago"),
    ],
  },
  {
    id: "l4", lat: 53.418, lng: -2.229, name: "Emma Brown", email: "emma.brown1992@hotmail.co.uk", phone: "07890 123 456",
    enquiry: "Letting", area: "Didsbury", budget: "£1,300 pcm", source: "Website",
    received: "3h ago", stage: "Viewing booked", moveDate: "1 Oct 2026",
    preferred: "Didsbury", agent: "Michael", notes: "Booked in for Thursday at 17:00.",
    activity: [
      act("target", "Enquiry from the website form", "3 hours ago"),
      act("calendar", "Viewing booked — Thu 17:00", "1 hour ago"),
    ],
  },
  {
    id: "l5", lat: 53.431, lng: -2.227, name: "James Patel", email: "james.patel@workmail.com", phone: "07411 222 333",
    enquiry: "Letting", area: "Withington", budget: "£950 pcm", source: "Instagram ad",
    received: "4h ago", stage: "Qualified", moveDate: "20 Aug 2026",
    preferred: "Withington, Fallowfield", agent: "Kirstie", notes: "Referencing pack sent.",
    activity: [
      act("megaphone", "Lead captured by Instagram campaign", "4 hours ago"),
      act("shield", "Marked qualified", "2 hours ago"),
    ],
  },
  {
    id: "l6", lat: 53.442, lng: -2.28, name: "Olivia Clark", email: "olivia.clark@btinternet.com", phone: "07789 444 555",
    enquiry: "Letting", area: "Chorlton", budget: "£1,100 pcm", source: "Referral",
    received: "1d ago", stage: "Waiting", moveDate: "Not sure yet",
    preferred: "Chorlton, Sale", agent: "Unassigned",
    notes: "Referred by an existing landlord. Waiting on her budget.",
    activity: [act("user", "Referred by an existing landlord", "Yesterday")],
  },
  {
    id: "l7", lat: 53.4715, lng: -2.296, name: "Daniel Okafor", email: "d.okafor@gmail.com", phone: "07533 987 221",
    enquiry: "Letting", area: "Salford", budget: "£1,150 pcm", source: "Rightmove",
    received: "1d ago", stage: "Contacted", moveDate: "5 Sep 2026",
    preferred: "Salford Quays", agent: "Michael", notes: "Wants a balcony if possible.",
    activity: [act("target", "Lead received from Rightmove", "Yesterday")],
  },
  {
    id: "l8", lat: 51.8787, lng: -0.4149, name: "Ryan Whitfield", email: "ryan.whitfield.rentals@gmail.com", phone: "07822 664 190",
    enquiry: "Valuation", area: "Luton", budget: "Owner-occupier", source: "Instagram ad",
    received: "1d ago", stage: "Contacted", moveDate: "n/a",
    preferred: "Luton LU1", agent: "Kirstie", notes: "Considering letting rather than selling.",
    activity: [act("megaphone", "Lead captured by Instagram campaign", "Yesterday")],
  },
  {
    id: "l9", lat: 53.4419, lng: -2.217, name: "Aisha Rahman", email: "aisha.rahman@nhs.net", phone: "07701 556 233",
    enquiry: "Letting", area: "Fallowfield", budget: "£900 pcm", source: "Zoopla",
    received: "2d ago", stage: "Viewing booked", moveDate: "1 Sep 2026",
    preferred: "Fallowfield", agent: "Michael", notes: "Shift worker — evenings only for viewings.",
    activity: [act("calendar", "Viewing booked — Sat 11:00", "2 days ago")],
  },
  {
    id: "l10", lat: 53.436, lng: -2.194, name: "George Mensah", email: "g.mensah@yahoo.co.uk", phone: "07984 220 117",
    enquiry: "Letting", area: "Levenshulme", budget: "£1,050 pcm", source: "OnTheMarket",
    received: "2d ago", stage: "New", moveDate: "12 Sep 2026",
    preferred: "Levenshulme", agent: "Unassigned", notes: "",
    activity: [act("target", "Lead received from OnTheMarket", "2 days ago")],
  },
  {
    id: "l11", lat: 51.7527, lng: -0.3394, name: "Hannah Price", email: "hannah.price@gmail.com", phone: "07445 812 909",
    enquiry: "Letting", area: "St Albans", budget: "£1,700 pcm", source: "Website",
    received: "3d ago", stage: "Qualified", moveDate: "14 Aug 2026",
    preferred: "St Albans AL1", agent: "Michael", notes: "Move-in monies due Friday.",
    activity: [act("shield", "Marked qualified", "3 days ago")],
  },
  {
    id: "l12", lat: 55.8791, lng: -4.308, name: "Liam Doyle", email: "liam.doyle@glasgowmail.com", phone: "07771 330 445",
    enquiry: "Letting", area: "Glasgow", budget: "£1,300 pcm", source: "Rightmove",
    received: "3d ago", stage: "Qualified", moveDate: "20 Aug 2026",
    preferred: "Glasgow G12", agent: "Kirstie", notes: "Agreement out for signature.",
    activity: [act("doc", "Tenancy agreement sent", "3 days ago")],
  },
  {
    id: "l13", lat: 53.484, lng: -2.235, name: "Sophie Turner", email: "sophie.turner.mcr@gmail.com", phone: "07612 774 008",
    enquiry: "Letting", area: "Manchester", budget: "£995 pcm", source: "Rightmove",
    received: "4d ago", stage: "Waiting", moveDate: "12 Sep 2026",
    preferred: "Northern Quarter", agent: "Kirstie", notes: "Referencing stalled — chasing employer.",
    activity: [act("clock", "Referencing stalled 6 days", "4 days ago")],
  },
  {
    id: "l14", lat: 51.88, lng: -0.418, name: "Marcus Bell", email: "marcus.bell@protonmail.com", phone: "07300 991 662",
    enquiry: "Letting", area: "Luton", budget: "£1,150 pcm", source: "OnTheMarket",
    received: "4d ago", stage: "Viewing booked", moveDate: "1 Sep 2026",
    preferred: "Luton LU1", agent: "Kirstie", notes: "",
    activity: [act("calendar", "Viewing booked — today 15:30", "4 days ago")],
  },
  {
    id: "l15", lat: 53.415, lng: -2.232, name: "Priya Shah", email: "priya.shah.work@gmail.com", phone: "07890 445 112",
    enquiry: "Letting", area: "Didsbury", budget: "£1,750 pcm", source: "Website",
    received: "5d ago", stage: "Qualified", moveDate: "1 Oct 2026",
    preferred: "Didsbury M20", agent: "Michael", notes: "PLC in progress.",
    activity: [act("shield", "Pre-let compliance started", "5 days ago")],
  },
  {
    id: "l16", lat: 52.927, lng: -1.273, name: "Nathan Cole", email: "nathan.cole88@gmail.com", phone: "07455 003 771",
    enquiry: "Letting", area: "Nottingham", budget: "£850 pcm", source: "Facebook ad",
    received: "5d ago", stage: "Contacted", moveDate: "1 Oct 2026",
    preferred: "Nottingham NG9", agent: "Unassigned", notes: "",
    activity: [act("megaphone", "Lead captured by Facebook campaign", "5 days ago")],
  },
  {
    id: "l17", lat: 52.895, lng: -1.435, name: "Beatrice Okonkwo", email: "beatrice.okonkwo@outlook.com", phone: "07533 220 984",
    enquiry: "Landlord", area: "Derby", budget: "2 properties", source: "Referral",
    received: "6d ago", stage: "New", moveDate: "Flexible",
    preferred: "Derby DE24", agent: "Unassigned", notes: "Two flats coming off another agent.",
    activity: [act("user", "Referred by an existing landlord", "6 days ago")],
  },
  {
    id: "l18", lat: 53.2, lng: -1.01, name: "Callum Fraser", email: "c.fraser@hotmail.com", phone: "07711 664 003",
    enquiry: "Letting", area: "Newark", budget: "£750 pcm", source: "Zoopla",
    received: "6d ago", stage: "Not proceeding", moveDate: "n/a",
    preferred: "Newark NG22", agent: "Michael", notes: "Found somewhere else.",
    activity: [act("cross", "Marked not proceeding", "6 days ago")],
  },
  {
    id: "l19", lat: 51.56, lng: -0.214, name: "Maya Lindqvist", email: "maya.lindqvist@gmail.com", phone: "07822 110 553",
    enquiry: "Letting", area: "London", budget: "£2,400 pcm", source: "Rightmove",
    received: "1w ago", stage: "Viewing booked", moveDate: "1 Nov 2026",
    preferred: "London NW2", agent: "Michael", notes: "Relocating — viewing by video first.",
    activity: [act("calendar", "Video viewing booked", "1 week ago")],
  },
  {
    id: "l20", lat: 52.38, lng: -1.56, name: "Ade Bamgbose", email: "ade.bamgbose@gmail.com", phone: "07900 447 218",
    enquiry: "Letting", area: "Coventry", budget: "£1,975 pcm", source: "Website",
    received: "1w ago", stage: "Qualified", moveDate: "1 Sep 2026",
    preferred: "Coventry CV4", agent: "Kirstie", notes: "Family of four, needs a garden.",
    activity: [act("shield", "Marked qualified", "1 week ago")],
  },
  {
    id: "l21", lat: 53.509, lng: -2.265, name: "Grace Whitmore", email: "grace.whitmore@icloud.com", phone: "07445 990 226",
    enquiry: "Valuation", area: "Salford", budget: "Owner-occupier", source: "Facebook ad",
    received: "1w ago", stage: "Contacted", moveDate: "n/a",
    preferred: "Salford M7", agent: "Kirstie", notes: "Wants a rental appraisal on a 3-bed.",
    activity: [act("megaphone", "Lead captured by Facebook campaign", "1 week ago")],
  },
  {
    id: "l22", lat: 53.43, lng: -2.228, name: "Oscar Rehman", email: "oscar.rehman@gmail.com", phone: "07377 552 041",
    enquiry: "Letting", area: "Withington", budget: "£1,050 pcm", source: "OnTheMarket",
    received: "1w ago", stage: "Waiting", moveDate: "Dec 2026",
    preferred: "Withington", agent: "Unassigned", notes: "Not moving until December.",
    activity: [act("clock", "Long lead time — recontact in October", "1 week ago")],
  },
  {
    id: "l23", lat: 51.337, lng: -0.114, name: "Isabelle Novak", email: "isabelle.novak@gmail.com", phone: "07600 883 194",
    enquiry: "Letting", area: "Purley", budget: "£1,400 pcm", source: "Zoopla",
    received: "2w ago", stage: "Not proceeding", moveDate: "n/a",
    preferred: "Purley CR8", agent: "Michael", notes: "Budget didn't stretch.",
    activity: [act("cross", "Marked not proceeding", "2 weeks ago")],
  },
  {
    id: "l24", lat: 53.437, lng: -2.19, name: "Freddie Ansah", email: "freddie.ansah.rentals@gmail.com", phone: "07988 211 447",
    enquiry: "Letting", area: "Levenshulme", budget: "£1,050 pcm", source: "Instagram ad",
    received: "2w ago", stage: "Contacted", moveDate: "1 Oct 2026",
    preferred: "Levenshulme M19", agent: "Kirstie", notes: "",
    activity: [act("megaphone", "Lead captured by Instagram campaign", "2 weeks ago")],
  },
];

/* --------------------------------------------------------------------------
   Lead detail — what the drawer shows behind each of its six tabs.

   Only the fields a lettings business actually keeps. Notably NO AML: that's
   a sales-side check and doesn't belong on a tenant record.
-------------------------------------------------------------------------- */

export type Task = { id: string; title: string; due: string; done: boolean };
export type Note = { id: string; author: string; when: string; text: string; pinned?: boolean };
export type DocTag =
  | "Right to Rent"
  | "Proof of income"
  | "Reference"
  | "Tenancy agreement"
  | "ID"
  | "Bank statement"
  | "Guarantor"
  | "Other";
export type Doc = { id: string; name: string; tag: DocTag; size: string; when: string };
export type LeadViewing = {
  id: string;
  when: string;
  property: string;
  locality: string;
  outcome: "Booked" | "Attended" | "Applying" | "Thinking" | "Not for them" | "No show";
};

export const DOC_TAGS: DocTag[] = [
  "Right to Rent", "Proof of income", "Reference", "Tenancy agreement",
  "ID", "Bank statement", "Guarantor", "Other",
];

export type LeadDetail = {
  tags: string[];
  priority: "High" | "Medium" | "Low";
  summary: string;
  nextAction: { title: string; detail: string; due: string } | null;
  tasks: Task[];
  notes: Note[];
  docs: Doc[];
  viewings: LeadViewing[];
  /** REX listing ids this lead has been matched to. */
  interested: string[];
};

/**
 * Detail per lead. Written out for the ones a demo actually opens; everything
 * else gets a believable shell derived from the lead's own fields, so no row
 * is a dead end.
 */
const DETAIL: Record<string, Partial<LeadDetail>> = {
  l1: {
    tags: ["Looking to rent", "2 bed", "Pet owner", "Urgent"],
    priority: "High",
    summary:
      "Sarah is looking for a 2-bedroom flat with parking in Didsbury or Withington. Budget up to £1,200 pcm. Pet friendly essential — one small dog. Looking to move from 1 September.",
    nextAction: {
      title: "Follow-up call",
      detail: "Call to discuss requirements and arrange viewings.",
      due: "Due today, 14:00",
    },
    tasks: [
      { id: "t1", title: "Call back — no answer first time", due: "Today, 14:00", done: false },
      { id: "t2", title: "Send Didsbury shortlist", due: "Today", done: false },
      { id: "t3", title: "Check pet policy on 12 Elm Gardens", due: "Tomorrow", done: false },
      { id: "t4", title: "Auto-response email", due: "Sent", done: true },
    ],
    notes: [
      {
        id: "n1", author: "Kirstie", when: "Today, 09:31", pinned: true,
        text: "Pet is a small dog — non-negotiable. Rule out anything with a no-pets clause before sending.",
      },
      {
        id: "n2", author: "Kirstie", when: "Today, 09:28",
        text: "Works in Media City, wants a short commute. Parking matters more than a second bathroom.",
      },
    ],
    docs: [
      { id: "d1", name: "Sarah Johnson — payslip Jul.pdf", tag: "Proof of income", size: "184 KB", when: "Today" },
      { id: "d2", name: "Passport scan.jpg", tag: "ID", size: "1.2 MB", when: "Today" },
      { id: "d3", name: "Share code screenshot.png", tag: "Right to Rent", size: "420 KB", when: "Today" },
    ],
    viewings: [
      { id: "vw1", when: "Thu 6 Aug, 17:00", property: "Flat 2, Mercer Street", locality: "Manchester M4", outcome: "Booked" },
    ],
    interested: ["295517", "295547", "339326"],
  },
  l3: {
    tags: ["Landlord", "Valuation wanted", "From Facebook"],
    priority: "High",
    summary:
      "Chloe has a 3-bed in Coventry coming off another agent and wants a rental valuation. Came through the paid Facebook campaign, so she landed in GoHighLevel rather than REX.",
    nextAction: {
      title: "Book the appraisal",
      detail: "She's free most weekday mornings — get it in the diary this week.",
      due: "Due tomorrow",
    },
    tasks: [{ id: "t1", title: "Book market appraisal", due: "Tomorrow", done: false }],
    notes: [
      {
        id: "n1", author: "System", when: "2 hours ago",
        text: "Captured by the Facebook lead form and synced from GoHighLevel. No REX record yet.",
      },
    ],
    docs: [],
    viewings: [],
    interested: [],
  },
};

const DEFAULT_TASKS: Task[] = [
  { id: "t1", title: "Make first contact", due: "Today", done: false },
];

/** Everything the drawer needs, whether or not this lead was written out. */
export function leadDetail(lead: Lead): LeadDetail {
  const d = DETAIL[lead.id] ?? {};
  return {
    tags: d.tags ?? [
      lead.enquiry === "Landlord" ? "Landlord" : "Looking to rent",
      lead.area,
      lead.source,
    ],
    priority: d.priority ?? (lead.stage === "New" ? "High" : "Medium"),
    summary:
      d.summary ??
      [
        `${lead.name.split(" ")[0]} enquired about ${lead.area}`,
        lead.budget && lead.budget !== "—" ? ` at ${lead.budget}` : "",
        ". ",
        lead.enquiryMessage || lead.notes || "No further detail captured yet.",
      ].join(""),
    nextAction:
      d.nextAction ??
      (lead.stage === "New"
        ? { title: "First contact", detail: "Nobody has spoken to this lead yet.", due: "Overdue" }
        : null),
    tasks: d.tasks ?? DEFAULT_TASKS,
    notes:
      d.notes ??
      // The applicant's own message is THEIRS — attributed to them, not to
      // whichever agent the lead happens to be assigned to.
      (lead.enquiryMessage
        ? [{ id: "n1", author: `${lead.name} — their enquiry`, when: lead.received, text: lead.enquiryMessage }]
        : lead.notes
          ? [{ id: "n1", author: lead.agent, when: lead.received, text: lead.notes }]
          : []),
    docs: d.docs ?? [],
    viewings: d.viewings ?? [],
    interested: d.interested ?? [],
  };
}

/**
 * Where a lead can come from. Grouped, because "how did you hear about us"
 * has four genuinely different answers and the pipe matters downstream:
 * portals and the website land in REX, paid social lands in GoHighLevel,
 * and word-of-mouth lands wherever whoever took the call put it.
 */
export const LEAD_SOURCES: { group: string; options: string[] }[] = [
  {
    group: "Portals",
    options: ["Rightmove", "Zoopla", "OnTheMarket", "SpareRoom", "Gumtree"],
  },
  {
    group: "Paid social",
    options: ["Facebook ad", "Instagram ad", "TikTok ad", "Google Ads"],
  },
  {
    group: "Owned",
    options: ["Website", "Phone-in", "Walk-in", "Email enquiry", "Live chat"],
  },
  {
    group: "Word of mouth",
    options: ["Referral", "Existing landlord", "Existing tenant", "Event", "Board / signage"],
  },
  { group: "Other", options: ["Repeat customer", "Unknown"] },
];

/** Tenant-side or landlord-side — the split the nav filters on. */
export function leadSide(lead: Lead): "tenant" | "landlord" {
  return lead.enquiry === "Letting" ? "tenant" : "landlord";
}
