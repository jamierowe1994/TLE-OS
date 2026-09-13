/**
 * The pre-tenancy guides: how each of Kirstie's screens works, step by step,
 * with a picture of each part taken from the screen itself.
 *
 * James, 13 Sep 2026: "a helpful guide area where they can learn about how
 * these processes work now ... the PLC queue will show a guide using
 * screenshots from each part of the process, and it will talk them through
 * it so they can just do it." For Kirstie, and for whoever starts next.
 *
 * The pictures live in /public/guides/pre-tenancy and are captured from the
 * pages on sample data (the ?sample=1 switch), so what the guide shows is
 * what the screen shows. When a screen changes, recapture; the words here
 * describe what a thing is for, not where a pixel is, so they date slower.
 *
 * No em dashes: this copy is read by people.
 */

export type GuideStep = {
  title: string;
  body: string;
  image?: string;
  /** A short line under the picture, when the picture needs one. */
  caption?: string;
};

export type Guide = {
  id: "start" | "dashboard" | "board" | "plc";
  title: string;
  blurb: string;
  icon: string;
  /** The page this guide is about, for the "Open it" button. */
  href: string;
  minutes: number;
  steps: GuideStep[];
};

const img = (name: string) => `/guides/pre-tenancy/${name}.webp`;

export const GUIDES: Guide[] = [
  {
    id: "start",
    title: "Starting in pre-tenancy",
    blurb: "What the job is, what the three screens are for, and where to begin each morning.",
    icon: "key",
    href: "/pre-tenancy/dashboard",
    minutes: 3,
    steps: [
      {
        title: "The job in one line",
        body: "Every accepted offer becomes a deal. Pre-tenancy takes it from the offer to the keys: holding fee, referencing, the PLC pack, the deposit, the agreement, the first rent, move-in day. The agent does their part, the landlord does theirs, and this workspace is where you see all of it in one place and keep it moving.",
      },
      {
        title: "Your three screens",
        body: "The rail on the left is the whole workspace. Dashboard is where you start the day: what needs you, who is moving in, what moved overnight. Board is where you work a deal. PLC queue is the packs agents have handed to compliance, waiting on your decision. Knowledge is this page.",
        image: img("rail"),
      },
      {
        title: "Green and red mean the same thing everywhere",
        body: "Green is fine, done or received. Red is late, slipped, or waiting on a person. Amber is with somebody else. Nothing else is coloured, so when you see red, that is the thing to pick up.",
        image: img("board-tiles"),
      },
      {
        title: "Where the data comes from",
        body: "Deals come from Propoly. Money, deposits and rent come from PayProp. Properties, certificates and the landlord's terms come from REX. The OS reads all three and lays them side by side. When two of them disagree, the screen says so, because that disagreement is usually the job.",
      },
      {
        title: "A good morning",
        body: "Open the dashboard. Clear the pink card first: late packs and move-ins that are not ready. Then the PLC queue, longest wait first. Then the board, starting with whatever is red. Leave What moved open on a second screen if you have one.",
        image: img("dashboard"),
      },
    ],
  },
  {
    id: "dashboard",
    title: "The dashboard",
    blurb: "What needs you today, who is moving in, what moved, and the queue and pipeline in numbers.",
    icon: "home",
    href: "/pre-tenancy/dashboard",
    minutes: 4,
    steps: [
      {
        title: "The whole page",
        body: "One screen, five cards. It refreshes itself every minute, so it can be left open. Every number on it comes from the same place as the screen it opens, so the dashboard and the board can never disagree.",
        image: img("dashboard"),
      },
      {
        title: "The pink card is your list for today",
        body: "Two things land here and nothing else: packs in the PLC queue that have waited past 48 hours, and move-ins today or tomorrow that are not marked complete. Each row opens the thing itself. When the card says nothing needs you, that is true, and you can go to the board.",
        image: img("dashboard-attention"),
      },
      {
        title: "Move-ins",
        body: "Today and the next seven days. A green dot is a deal marked complete and ready for the keys; a red dot is one that is not. The day on the right is the move-in date. Click a row to open the deal on the board.",
        image: img("dashboard-moveins"),
      },
      {
        title: "What moved",
        body: "Every change Propoly made to a deal, newest first: references back, a deposit reconciled, a stage moved. This is the feed you would otherwise get by opening each file in Propoly. View all opens the full feed, which can be popped out onto a second screen.",
        image: img("dashboard-moved"),
      },
      {
        title: "Packs with compliance",
        body: "The PLC queue in short: how many are waiting and how long the oldest has waited. Red past 48 hours, green inside it. The queue itself is on the rail; this tells you whether to go there first.",
        image: img("dashboard-packs"),
      },
      {
        title: "Pipeline at a glance",
        body: "Every live deal counted by stage. It is the board's columns as numbers. If one stage is piling up, that is where the week's bottleneck is.",
        image: img("dashboard-pipeline"),
      },
    ],
  },
  {
    id: "board",
    title: "The board",
    blurb: "Every deal by stage, the ones that need a look, and the drawer where a deal is worked.",
    icon: "grid",
    href: "/pre-tenancy",
    minutes: 8,
    steps: [
      {
        title: "The board at a glance",
        body: "Eight columns, one per stage, left to right in the order a deal moves. Above them: four numbers, today's focus, and the chips that filter what you see. The board takes a few seconds to load because it asks Propoly, REX and PayProp at the same time.",
        image: img("board"),
      },
      {
        title: "The four numbers",
        body: "In progression is every live deal. Moving this month is the deals with a move-in date this month. Due today is your tasks due today; click it to see them. Stalled is deals where nothing has happened for a week, and clicking it filters the columns to only those.",
        image: img("board-tiles"),
      },
      {
        title: "Today's focus",
        body: "Deals the OS thinks are wrong: a deposit that should be registered and is not, rent that should have arrived, a slipped move-in. Each card names the stage and the reason. View all opens the full list. This is the same check the drawer shows under each stage, gathered in one place.",
        image: img("board-focus"),
      },
      {
        title: "Chips, search and the agent",
        body: "All properties is everything. Needs attention, Stalled and Moving soon narrow the columns without changing their shape. Search finds a property, a tenant or an agent by name. The agent list on the right shows one agent's deals only.",
        image: img("board-chips"),
      },
      {
        title: "The columns and the cards",
        body: "Each card is a deal: the photo, the address, the lead tenant, one status line, and how long since anything happened. The status line is green when something is done or received, amber when it is waiting on somebody, red when the move-in has slipped or the agent is waiting on you. A red dot beside a column's count means something in it needs attention.",
        image: img("board-columns"),
      },
      {
        title: "One card",
        body: "Click anywhere on a card to open the deal. The speech-bubble count is the number of messages between you and the agent on this deal.",
        image: img("board-card"),
      },
      {
        title: "Board or List",
        body: "Board is the columns. List shows one stage at a time as larger tiles, which is easier when one column is long. The three dots next to the toggle hold the views that are not a stage: Slipped, All, Archive, and Cancelled when you want to see them.",
        image: img("board-list"),
      },
      {
        title: "The drawer",
        body: "A deal opens from the right. Everything about it is here: the photo and address, the agent, the state pills, Open in Propoly and Open in REX, and a mailbox button for the Emails tab. Escape or the cross closes it.",
        image: img("drawer"),
      },
      {
        title: "The drawer's four tiles",
        body: "Move-in date and how far away it is, the current stage, how many checklist steps are outstanding, and how old the deal is. Outstanding is a button: click it and the checklist drops down.",
        image: img("drawer-tiles"),
      },
      {
        title: "The checklist",
        body: "Ten steps a tenancy needs. Tick each one as it is done and your name and the date go against it. Most of them also move the deal along on their own: a ticked PLC or deposit is read by the stage list underneath. Untick to undo.",
        image: img("drawer-checklist"),
      },
      {
        title: "Property",
        body: "The rent, deposit, holding fee and move-in date from Propoly. The deposit scheme is yours to record: no other system holds it, so the OS is the register. When PayProp shows which scheme the deposit was paid to, a one-click suggestion appears under the field.",
        image: img("drawer-property"),
      },
      {
        title: "Tenancy progress",
        body: "The eight stages with a tick for done, a red dot for now, and under each one what an outside system can prove: the holding fee in PayProp, the PLC pack, the deposit, the landlord's signed terms in REX, the first rent. Amber means the stage has passed and the evidence is missing. That is the line to chase. The pink Next up card is the current stage in plain words.",
        image: img("drawer-progress"),
      },
      {
        title: "Ready to move in",
        body: "The one stage you move by hand. The button beside Move day reads the records back to you first: the PLC pack, the deposit, the rent. Sign off puts your name on it, tells the agent, and shows Move-in day to the landlord and tenant on their portals. Short of something, it says so and still lets you decide.",
        image: img("drawer-signoff"),
      },
      {
        title: "Activity, Notes, Tasks, Emails",
        body: "Activity is the shared thread with the agent: what you write here, they see instantly, and their replies show a red dot on the card. Notes are private to you. Tasks are follow-ups with a date, and today's count shows on the board. Emails shows mail on this deal from your connected mailbox.",
        image: img("drawer-tabs"),
      },
      {
        title: "The people",
        body: "Tenant, agent and landlord, with email and phone where Propoly holds them. The landlord card is new: Propoly has always carried the landlord and the old board threw it away.",
        image: img("drawer-people"),
      },
    ],
  },
  {
    id: "plc",
    title: "The PLC queue",
    blurb: "Packs handed over by agents, longest wait first, and how to read one and decide.",
    icon: "shield",
    href: "/pre-tenancy/plc",
    minutes: 6,
    steps: [
      {
        title: "What a pack is",
        body: "When an agent's offer is accepted they assemble the pre-let compliance pack: landlord ID and AML, tenant and guarantor checks, gas, EPC, EICR, licensing, the draft agreement and right to rent. Handing it over locks it and starts the clock. Agents are told 48 hours.",
        image: img("plc"),
      },
      {
        title: "The queue",
        body: "Longest wait first, always. The pill on the left is how long the pack has waited: green inside 48 hours, red past it. The three numbers above say how many are waiting, how many are late, and how many move in this week. Decide those first.",
        image: img("plc-rows"),
      },
      {
        title: "Open a pack",
        body: "Click a row and the review opens from the right. The head has the address, who handed it over, the move-in date and the wait. The first card is the three facts and anything the agent wanted you to know.",
        image: img("plc-facts"),
      },
      {
        title: "Read the pack",
        body: "A pack that has just arrived offers a scan. The scan reads dates and names out of the documents and tells you what it found. It does not decide anything. Skip it if you would rather read the documents yourself; you still approve, defer or decline either way.",
        image: img("plc-read"),
      },
      {
        title: "What the scan found",
        body: "One line per finding. Red is a blocker, such as a gas certificate that runs out after the tenants move in. Amber is a query worth raising. Green is in order. Under each finding is the document it came from and the date it read, so you can open the same page and check.",
        image: img("plc-findings"),
      },
      {
        title: "The pack itself",
        body: "Every check, and what was filed against it. A green dot has a document, a red dot has nothing, a grey dot was declared not needed with a reason. Click a filename to open it. Right to Rent is often blank here because its evidence lives elsewhere; that is allowed.",
        image: img("plc-pack"),
      },
      {
        title: "Your decision",
        body: "Write what is missing, or why it is fine, and choose. Approve clears the property to be let. Defer sends it back to the agent to fix and re-submit. Decline ends it. What you write goes to the agent exactly as written; it is the only thing they see. A deferral or a decline needs a reason. An approval does not.",
        image: img("plc-decision"),
      },
      {
        title: "After approval",
        body: "Your name and the time go on the pack. The approved documents can then be pushed into the deal's document slots in Propoly, so the agreement is generated without uploading them again, and the certificates written to REX with their expiry dates, so the tracker stops calling them missing. Both run on approval when their switch is on; the buttons run them by hand and show what happened file by file.",
        image: img("plc-push"),
      },
    ],
  },
];

export const guideById = (id: string | null | undefined) => GUIDES.find((g) => g.id === id) ?? null;
