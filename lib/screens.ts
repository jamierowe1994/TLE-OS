import "server-only";
import { AGENT_ROUTES, AGENT_NAV, navRoutesMismatch, type AgentRoute } from "@/lib/nav";

/**
 * What each screen is for, what you can do on it, and what is not wired yet.
 *
 * ── Why this one is written down when the rest of the map is derived ──────
 *
 * lib/system-map.ts derives everything it can from constants, because a
 * snapshot of a process goes stale and an assistant states a stale thing with
 * confidence. That principle holds — but it has a limit, and this file is it.
 * What a screen DOES lives in JSX, and no constant knows that the Listings
 * board has a search box or that the Compliance tiles are filters. It has to be
 * written.
 *
 * So the honesty is bought a different way, in three parts:
 *
 *   1. COVERAGE IS COMPILED. `SCREENS` is a Record keyed by AgentRoute, so a
 *      screen added to the rail without a description fails the build. The
 *      assistant can never silently not know a screen exists.
 *   2. THE RAIL IS CHECKED, not trusted — `navRoutesMismatch()` runs at module
 *      load, so the route union and the rail cannot quietly diverge.
 *   3. WIRING IS STATED, not implied. See below.
 *
 * ── `wiring` is the whole point of this file ─────────────────────────────
 *
 * James, 29 Aug: he should give "process, then what's wired".
 *
 * Most of this OS is designed ahead of being connected, which is correct for
 * something launching in October — but it means the process an agent should
 * follow and the buttons that currently work are two different things. An
 * assistant that knows only the process walks a pilot agent into a dead
 * button, and then the agent stops believing him about anything.
 *
 * TLE's process is real whether or not the software does it yet. It comes from
 * lib/journey.ts, and it is worth teaching. What must never be implied is that
 * a screen does something it does not. So every screen says which it is, and
 * `caveats` name the specific things that do not work, in the words an agent
 * would use — "book it in REX instead", not "unimplemented".
 *
 * Keep `caveats` current the way you would fix a lie on a tile. A stale caveat
 * here is the failure this whole file exists to prevent, just wearing the
 * opposite sign: telling somebody to go and do it by hand when the OS has
 * quietly started doing it for them.
 */

/** How much of the screen actually works today. */
export type Wiring =
  /** Reads live data and its controls do what they say. */
  | "live"
  /** Real data, but some named controls are not connected. See `caveats`. */
  | "partial"
  /** Placeholder figures or no working controls. Do not send anyone here to do a job. */
  | "shell";

export interface ScreenDoc {
  /** One line: what this screen is for. */
  purpose: string;
  /** Concrete things you can do, using the button labels as they appear. */
  does: string[];
  wiring: Wiring;
  /** Named things that do NOT work, and what to do instead. */
  caveats?: string[];
  /** Where a record goes when it leaves this screen. */
  next?: string;
}

export const SCREENS: Record<AgentRoute, ScreenDoc> = {
  "/dashboard": {
    purpose: "The morning view — what is happening across your lettings business today.",
    does: [
      "Read your own bento board of tiles.",
      "Press Customise to add, remove or resize tiles from the tray, then Done.",
    ],
    wiring: "partial",
    caveats: ["The board layout is saved in your own browser, so it does not follow you to another device."],
  },

  "/tools": {
    purpose:
      "The kit that sits alongside your book, grouped by the job it does. The first group is Prospecting — the doors nobody has knocked on yet.",
    does: [
      "See every tool, what it is for, and whether it comes with your package or is bought separately.",
      "Open a tool that is ready. One that is still being built shows what it is waiting on and cannot be opened.",
    ],
    /* "shell" is the honest answer and it should stay that way until a tool on
       this page actually opens. The hub itself renders real data — but the data
       is a list of tools, and today not one of them can be used, so anybody
       sent here to do a job would arrive and find nothing to press. */
    wiring: "shell",
    caveats: [
      "Nothing on here opens yet. Launch Pad is being rebuilt into the OS; until it lands, use Launch Pad in the browser as you do now.",
      "The Paid badge describes the tool, not you. Nothing here knows what you have bought, so it will not tell you whether a tool is yours.",
    ],
  },

  "/leads": {
    purpose:
      "Every enquiry, tenant and landlord, in one book. The two sides are different jobs so they are filtered apart.",
    does: [
      "Switch between Tenant and Landlord from the rail.",
      "Press + New lead to add one by hand. It saves in the OS immediately; whether it also reaches REX depends on the Create contacts in REX switch.",
      "Anything saved here that REX has not got yet is listed above the table, with a Push to REX button and the reason it is waiting.",
      "Search, and filter by source, agent or stage.",
      "Click a lead to open its drawer, then step through the record with Previous and Next.",
      "In the drawer, the single next-action button does that step's work — booking a viewing, booking the appraisal, sending the email, recording the offer.",
      "On a landlord, the last step is Book the appraisal. Pick a day and a time and it creates the appraisal and takes you to its file. Booking the same landlord again moves the appointment rather than making a second one.",
    ],
    wiring: "live",
    next: "A landlord lead leaves here at Appraisal booked and continues on Market Appraisals. A tenant lead leaves at Application received and continues on Applications.",
  },

  "/market-appraisals": {
    purpose:
      "Everything between a landlord saying yes to a visit and signing terms — booked, prepared, appraised, won.",
    does: [
      "Filter by stage using the tab strip: All open, Booked, Pre-appraisal, Appraisal, Post-appraisal, Take-on & photos, AML & compliance.",
      "Click an appraisal to open its file — the rent guide, the comparables behind it, and what needs doing now.",
      "From the file, Build the presentation makes the deck the landlord opens before you arrive.",
    ],
    wiring: "partial",
    caveats: [
      "You cannot start an appraisal on this screen. One is created by booking it from a landlord lead on Leads, which then brings you straight to its file. There is no New appraisal button here and that is deliberate.",
      "Four rows are stand-ins to shape the screen. Anything you booked yourself is marked Booked here - the unmarked ones are samples, so don't quote them.",
      "The stage tabs only filter. Nothing on this screen moves an appraisal from one stage to the next, so a record stays at Booked until that is built.",
      "Record the valuation on the file page does not open a form yet.",
      "The confirmation email and the calendar invite to the landlord are not connected, and the appointment does not reach REX's diary. Send the confirmation and put the appointment in REX yourself.",
    ],
    next: "A won appraisal becomes a listing.",
  },

  "/listings": {
    purpose: "The properties on the market, as a card board — rent, beds, days on market, and what is missing.",
    does: [
      "Toggle Available only, and sort by Most recent, Rent or Location.",
      "Search the board.",
      "Click a card for the file: Applications & viewings, Property, Marketing, Photos and Documents.",
      "In Marketing, edit the portal write-up and press Save. That goes straight to REX and out to Rightmove, Zoopla and OnTheMarket — live on the portals in about five to ten minutes. There is nothing else to press afterwards.",
      "Open the live advert on Rightmove, Zoopla or OnTheMarket from the Live advert links at the top of the file.",
      "Make an offer, and hand a let property over to Kirstie for pre-tenancy.",
    ],
    wiring: "partial",
    caveats: [
      "+ Add new listing does nothing when pressed. Create the property in REX.",
      "Pills like No photos and EPC not filed are telling you what REX is missing, not what this screen failed to load.",
      "Every other field on the file is read-only — the Marketing write-up is the only thing here that saves back to REX. Rent, availability, beds and the rest have to be changed in REX itself.",
      "Live advert links only appear for a property that is actually feeding a portal. No links means the feed is not running, not that the screen failed.",
    ],
    next: "A let property hands over to pre-tenancy.",
  },

  "/viewings": {
    purpose:
      "Every viewing and its whole story — the property, who is coming, whether anyone lives there, and whether the confirmations actually went.",
    does: [
      "Switch between the Diary and Feedback tabs.",
      "Click a viewing for access details, keys, and the comms checklist showing which confirmations were sent.",
      "Record the outcome, starting with whether they turned up, including a No-show.",
      "Push an offer to the landlord, and couple or uncouple applicants.",
      "Open the Week calendar and click an empty slot to add an appointment.",
    ],
    wiring: "partial",
    caveats: [
      "Appointments added on the week calendar stay in the OS. They do not reach REX, so REX will not know about them.",
      "The landlord feedback report is not built yet.",
    ],
    next: "A viewing that goes well produces an application.",
  },

  "/applications": {
    purpose: "Every application on REX's four statuses, live, with the pre-tenancy stages once one is accepted.",
    does: [
      "Read the four-tile pipeline across REX's statuses.",
      "Show or hide unsuccessful applications.",
      "Choose your columns.",
      "Click an application for the file and the handover.",
    ],
    wiring: "live",
    caveats: [
      "Referencing has no source in any system we connect to, so it is not shown. The screen says so.",
      "The right-to-rent gap warning is real — it is counting applications with nothing recorded.",
    ],
    next: "An accepted application becomes a deal in Propoly and goes to pre-tenancy.",
  },

  "/compliance": {
    purpose: "Which certificates are in date, which are running out, and the whole book behind them.",
    does: [
      "Press any of the four tiles to filter the book by that state.",
      "See what is coming out of compliance over the next month, with days left or days over.",
      "Press Book the {trade} on an urgent row to raise a works order.",
      "Click a property to open its file and upload a certificate.",
    ],
    wiring: "partial",
    caveats: [
      "Tell the landlord only ticks the row on your screen. No email is sent, so ring or email them yourself.",
      "Gas and EICR recording only began in November, so the book is thinner than the real position. EPC looks complete because it was bulk imported.",
      "A renewed certificate overwrites the old one in REX, so this screen cannot tell you what was overdue in the past.",
    ],
  },

  "/emails": {
    purpose:
      "Everything sent under the company's name, from REX's own send log — the automation and the agents kept apart.",
    does: [
      "Read what was sent, and whether it was opened, clicked or bounced.",
      "Increase the depth to pull more of the log back.",
    ],
    wiring: "live",
    caveats: [
      "This is an audit of what already went out. Nothing on this screen sends anything.",
      "The log is slow to read and pulling more pages takes a while.",
    ],
  },

  "/portfolio": {
    purpose: "The whole managed book — properties, landlords, and where they are.",
    does: [],
    wiring: "shell",
    caveats: [
      "This screen is a wireframe. The figures on it are placeholders, not your book, and nothing on it can be clicked.",
      "The property directory, the landlord directory and the map view are all still to be built.",
    ],
  },

  "/finances": {
    purpose:
      "Fee income on the accounts' own basis — a fee belongs to the month its batch transferred, net of VAT.",
    does: ["Read your own board of finance tiles.", "Customise the board tile by tile."],
    wiring: "live",
    caveats: [
      "Partner joining fees run through a separate bank account, so they are not here and never will be.",
      "PayProp money only starts in August 2025. Anything earlier is not missing, it does not exist.",
    ],
  },
};

/* The rail and the route union describe the same screens, so they are checked
   against each other once, here, at module load. This throws in development
   the moment they diverge rather than the assistant quietly losing a screen —
   and it cannot throw in front of an agent, because it runs when the server
   loads the module, not when somebody asks a question. */
const mismatch = navRoutesMismatch();
if (mismatch.length) {
  throw new Error(`lib/nav.ts and lib/screens.ts disagree:\n  ${mismatch.join("\n  ")}`);
}

/** The rail's own label for a route, so the assistant calls screens what the rail calls them. */
export function labelFor(route: AgentRoute): string {
  return AGENT_NAV.find((n) => n.href === route)?.label ?? route;
}

/**
 * The screens section of the system prompt.
 *
 * Written as instructions to somebody being shown round rather than as a
 * schema dump: the model reads better from prose than from JSON, and every
 * token here is cached anyway, so clarity costs nothing per request.
 */
export function screensSection(): string {
  const body = AGENT_ROUTES.map((route) => {
    const s = SCREENS[route];
    const lines = [`### ${labelFor(route)} — ${route}`, s.purpose];

    if (s.does.length) {
      lines.push("", "What you can do here:", ...s.does.map((d) => `   · ${d}`));
    }
    if (s.next) lines.push("", `Where it goes next: ${s.next}`);

    if (s.wiring === "shell") {
      lines.push("", "NOT WIRED YET. Do not tell anyone to do a job on this screen.");
    } else if (s.wiring === "partial") {
      lines.push("", "Mostly working, with the exceptions below.");
    }
    if (s.caveats?.length) {
      lines.push("What does NOT work, and what to do instead:", ...s.caveats.map((c) => `   · ${c}`));
    }
    return lines.join("\n");
  }).join("\n\n");

  return `## The screens, and what actually works on each

Every screen below is one an ordinary agent can reach from the rail. When you
name one, write it as a markdown link using EXACTLY the path given — for
example [Market Appraisals](/market-appraisals) — because those become buttons
that take the person straight there. Never invent a path that is not on this
list; a button that goes nowhere is worse than no button.

${body}`;
}
