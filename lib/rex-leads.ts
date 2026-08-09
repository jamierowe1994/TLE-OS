import "server-only";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";
import type { Lead, Stage } from "@/lib/leads-sample";

/**
 * Real enquiries, out of REX and into the OS's own shape.
 *
 * THE SHARED-BOOK PROBLEM. This REX account is mostly a SALES book — of the
 * hundred newest enquiries, 43 are sales, 28 are rentals and 29 carry no
 * listing at all. A lettings OS that showed all of them would bury its own
 * work. So leads are classified and the sales ones set aside — but COUNTED
 * and reported, because a filter that silently drops two thirds of the book
 * is indistinguishable from a bug.
 *
 * REX WILL NOT DO THIS FILTERING FOR US. `Leads/search` takes criteria only
 * on `lead.*` and `received_email.*` fields — anything about the attached
 * listing (its category, above all) is rejected as "not a permissible search
 * field". So we walk the newest pages and sort them out here.
 */

/** How many pages of 100 to walk. ~28% are lettings, so 5 pages ≈ 140 of them. */
const PAGES = 5;
const PAGE_SIZE = 100;

export interface LeadBook {
  leads: Lead[];
  /** Everything the walk saw, so the screen can be honest about its own scope. */
  scanned: number;
  setAside: { sales: number; unclear: number };
  total: number | null;
  newestAt: string | null;
}

interface RexLead extends Record<string, unknown> {
  id?: string | number;
  system_ctime?: string;
  system_completed_time?: string | null;
  subject?: string | null;
  body_snippet?: string | null;
  received_from_email?: string | null;
  is_spam?: string | null;
  contact?: { name?: string; email_address?: string; phone_number?: string; id?: string } | null;
  assignee?: { name?: string } | null;
  lead_type?: { id?: string; text?: string } | null;
  lead_status?: { id?: string; text?: string } | null;
  listing?: {
    id?: number;
    listing_category?: { id?: string; text?: string } | null;
    listing_agent_1?: { name?: string } | null;
    listing_primary_image?: { thumbs?: Record<string, { url?: string }> } | null;
    location?: { text?: string } | null;
    property?: {
      system_search_key?: string;
      adr_suburb_or_town?: string | null;
      adr_postcode?: string | null;
    } | null;
  } | null;
}

const RENTAL_CATEGORIES = ["residential_rental", "commercial_rental", "rental"];

/** Words that give away which side of the business an untagged lead belongs to. */
const LETTINGS_WORDS = /\b(letting|lettings|tenant|tenancy|rent|rental|to let)\b/i;
const SALES_WORDS = /\b(sales enquiry|buyer|for sale|purchase|vendor|offers over)\b/i;
const VALUATION_WORDS = /\b(valuation|appraisal|market appraisal|how much is)\b/i;

type Verdict = { keep: true; enquiry: Lead["enquiry"] } | { keep: false; why: "sales" | "unclear" };

/**
 * Which side of the business is this?
 *
 * The listing's own category is the trustworthy signal and is used first.
 * Only when there is no listing do we fall back to reading the words, which
 * is guesswork and is treated as such — anything still ambiguous is set
 * aside rather than filed under a side it might not belong to.
 */
export function classify(l: RexLead): Verdict {
  const category = l.listing?.listing_category?.id ?? null;
  if (category) {
    if (RENTAL_CATEGORIES.includes(category)) return { keep: true, enquiry: "Letting" };
    return { keep: false, why: "sales" };
  }

  const text = `${l.subject ?? ""} ${l.body_snippet ?? ""}`;
  const typeId = l.lead_type?.id ?? "";

  if (typeId === "appraisal_request" || VALUATION_WORDS.test(text)) {
    // A valuation request is a would-be landlord (or vendor) — the landlord
    // side of the book either way, and worth someone's morning.
    return { keep: true, enquiry: "Valuation" };
  }
  if (SALES_WORDS.test(text)) return { keep: false, why: "sales" };
  if (LETTINGS_WORDS.test(text)) return { keep: true, enquiry: "Letting" };
  return { keep: false, why: "unclear" };
}

/** REX runs a three-state workflow; ours is richer, so map only what's certain. */
function stageOf(l: RexLead): Stage {
  switch (l.lead_status?.id) {
    case "in_progress":
      return "Contacted";
    case "completed":
      return "Closed";
    default:
      return "New";
  }
}

/** "*@rightmove.com" is nobody's idea of a source name. */
export function sourceOf(l: RexLead): string {
  const raw = (l.received_from_email ?? "").replace(/^\*@/, "").toLowerCase();
  if (!raw) return "Direct";
  if (raw.includes("rightmove")) return "Rightmove";
  if (raw.includes("zoopla") || raw.includes("zpg")) return "Zoopla";
  if (raw.includes("onthemarket")) return "OnTheMarket";
  if (raw.includes("getagent")) return "GetAgent";
  if (raw.includes("siteloft")) return "Website";
  return raw.split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
}

function ago(seconds: number): string {
  const mins = Math.floor((Date.now() / 1000 - seconds) / 60);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/** The applicant's own words, dug out of the portal's boilerplate wrapper. */
function messageOf(l: RexLead): string {
  const body = l.body_snippet ?? "";
  const m = /Message:\s*([\s\S]*)$/i.exec(body);
  const text = (m ? m[1] : body).replace(/\r?\n/g, " ").trim();
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

function photoOf(l: RexLead): string | undefined {
  const url = l.listing?.listing_primary_image?.thumbs?.["400x300"]?.url;
  // REX hands these back protocol-relative, which breaks the moment they're
  // used anywhere but a browser already on https.
  return url ? (url.startsWith("//") ? `https:${url}` : url) : undefined;
}

function toLead(l: RexLead, enquiry: Lead["enquiry"]): Lead {
  const property = l.listing?.property;
  const received = Number(l.system_ctime ?? 0);
  const area =
    property?.adr_suburb_or_town ??
    property?.adr_postcode?.split(" ")[0] ??
    "—";

  return {
    id: `rex-${l.id}`,
    name: l.contact?.name?.trim() || "(no name given)",
    email: l.contact?.email_address ?? "",
    phone: l.contact?.phone_number ?? "",
    enquiry,
    area,
    budget: "—", // the enquiry carries no budget; it comes from qualifying
    source: sourceOf(l),
    received: received ? ago(received) : "—",
    stage: stageOf(l),
    moveDate: "—",
    preferred: property?.system_search_key ?? "—",
    agent: l.assignee?.name ?? l.listing?.listing_agent_1?.name ?? "Unassigned",
    // The applicant's words go in enquiryMessage, NOT notes — notes is the
    // agency's own writing, and conflating them mis-attributes the sender.
    notes: "",
    enquiryMessage: messageOf(l),
    activity: [
      {
        icon: "target",
        text: `Enquiry received from ${sourceOf(l)}`,
        when: received ? ago(received) : "—",
      },
      ...(l.system_completed_time
        ? [{ icon: "check", text: "Marked complete in REX", when: ago(Number(l.system_completed_time)) }]
        : []),
    ],
    receivedAt: received ? new Date(received * 1000).toISOString() : undefined,
    photo: photoOf(l),
    address: property?.system_search_key ?? undefined,
    listingId: l.listing?.id ?? undefined,
    office: l.listing?.location?.text ?? undefined,
    subject: l.subject ?? undefined,
  };
}

/** Walk the newest enquiries and return the lettings book. */
export async function fetchLeadBook(): Promise<LeadBook> {
  if (!rexConfigured()) {
    return { leads: [], scanned: 0, setAside: { sales: 0, unclear: 0 }, total: null, newestAt: null };
  }

  const leads: Lead[] = [];
  const setAside = { sales: 0, unclear: 0 };
  let scanned = 0;
  let total: number | null = null;
  let newestAt: string | null = null;

  for (let page = 0; page < PAGES; page++) {
    const res = await rexCall("Leads", "search", {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      order_by: { system_ctime: "desc" }, // an OBJECT here — the array form 400s
    });
    if (!res.ok) break;
    if (total === null) {
      // REX hands `total` back as a string; left alone it reaches the screen
      // as "87800" with no thousands separator.
      const raw = (res.result as { total?: number | string } | null)?.total;
      total = raw == null ? null : Number(raw);
    }

    const rows = rexRows(res.result) as RexLead[];
    if (!rows.length) break;

    for (const row of rows) {
      // REX scores spam for us; no reason to make someone else read it.
      if (row.is_spam === "1") continue;
      scanned++;
      if (!newestAt && row.system_ctime) {
        newestAt = new Date(Number(row.system_ctime) * 1000).toISOString();
      }
      const verdict = classify(row);
      if (verdict.keep) leads.push(toLead(row, verdict.enquiry));
      else setAside[verdict.why]++;
    }

    if (rows.length < PAGE_SIZE) break;
  }

  return { leads, scanned, setAside, total, newestAt };
}
