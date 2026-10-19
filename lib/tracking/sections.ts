/**
 * Every part of the OS that Admin > Tracking reports on (15 Oct 2026).
 *
 * Each part names the screens that belong to it (page views, lib/pilot) and
 * the first word of the calls its screens make (the read log, lib/read-log).
 * Opening a screen counts as an open; any call that is not a read counts as
 * something done. What each part produces - valuations sent, issues raised -
 * is in lib/tracking/metrics.
 *
 * Shared with the browser, so no server imports here.
 */

export type SectionKey =
  | "dashboard"
  | "leads"
  | "appraisals"
  | "listings"
  | "viewings"
  | "applications"
  | "passport"
  | "pretenancy"
  | "portfolio"
  | "maintenance"
  | "compliance"
  | "finances"
  | "huddles"
  | "steve"
  | "landlord"
  | "tenant"
  | "marketing"
  | "tools"
  | "search"
  | "profile";

export interface SectionDef {
  key: SectionKey;
  label: string;
  /** components/LineIcon name. */
  icon: string;
  blurb: string;
  /** Screens, matched as the path itself or anything under it. */
  pages: string[];
  /** The word after /api/ on the calls this part's screens make. */
  api: string[];
}

export const SECTIONS: SectionDef[] = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", blurb: "The home screen, the morning briefing and the phone's home.", pages: ["/dashboard", "/overview", "/agent", "/m"], api: ["my", "activity", "news", "tasks", "launch", "reminders"] },
  { key: "leads", label: "Leads", icon: "target", blurb: "Landlord and tenant leads, notes, calls and contacts.", pages: ["/leads", "/agent/leads", "/agent/people", "/m/people"], api: ["leads", "contacts", "messages", "people"] },
  { key: "appraisals", label: "Market Appraisals", icon: "trend-up", blurb: "Booking, valuing, the decks and the terms to sign.", pages: ["/market-appraisals"], api: ["appraisals", "presentations", "ma-research", "ma-photos", "video", "docuseal", "esign", "market-picture", "property-history", "dossier"] },
  { key: "listings", label: "Listings", icon: "megaphone", blurb: "Listing homes, editing adverts, enquiries and offers.", pages: ["/listings", "/agent/match", "/agent/find-home"], api: ["listings", "property-drafts", "attributes", "offers"] },
  { key: "viewings", label: "Diary and Viewings", icon: "calendar", blurb: "The diary, booking viewings and their confirmations.", pages: ["/viewings", "/diary", "/agent/viewings", "/agent/day", "/agent/event", "/m/event"], api: ["viewings", "diary", "confirmations", "appointments", "travel"] },
  { key: "applications", label: "Applications", icon: "file-contract", blurb: "Lets in progress, through to the handover.", pages: ["/applications", "/offers", "/agent/applications", "/agent/id-check", "/m/id-check"], api: ["applications", "deals", "handoff", "tenant-swaps", "lets", "id-checks", "guarantors", "flatfair", "propoly", "customer-updates"] },
  { key: "passport", label: "Tenant Passport", icon: "note", blurb: "Passports sent to tenants, and how far each tenant got.", pages: [], api: ["tenant"] },
  { key: "pretenancy", label: "Pre-tenancy", icon: "checklist", blurb: "PLC packs and Kirstie's checks before a move-in.", pages: ["/pre-tenancy", "/plc"], api: ["pretenancy", "plc"] },
  { key: "portfolio", label: "Portfolio", icon: "folder", blurb: "Managed homes: inspections, reviews, notices, rent.", pages: ["/portfolio", "/contractors", "/inspections", "/tenancy-reviews", "/move-outs", "/clean-sweep", "/agent/properties", "/m/properties"], api: ["portfolio", "property-file", "section-notices", "tenancy-reviews", "move-outs", "inspections", "case-state", "property", "clean-sweep"] },
  { key: "maintenance", label: "Maintenance", icon: "setting", blurb: "Repairs raised, contractors and invoices.", pages: ["/maintenance"], api: ["works-orders", "contractors", "invoices"] },
  { key: "compliance", label: "Compliance", icon: "shield", blurb: "Certificates uploaded, checked and shared.", pages: ["/compliance", "/compliance-desk", "/agent-compliance"], api: ["compliance", "compliance-desk", "agent-compliance", "documents"] },
  { key: "finances", label: "Finances", icon: "wallet", blurb: "Finances and Susan's company figures.", pages: ["/finances", "/company-figures"], api: ["finances", "business", "payprop", "overview"] },
  { key: "huddles", label: "Huddles", icon: "message", blurb: "The team's own chats.", pages: ["/huddles", "/agent/chats"], api: [] },
  { key: "steve", label: "Steve", icon: "magic-wand", blurb: "Questions asked of Steve, briefings and reports.", pages: ["/agent/steve", "/guides", "/knowledge"], api: ["assistant", "knowledge", "bugs"] },
  { key: "landlord", label: "Landlord Portal", icon: "key", blurb: "What landlords do on their side: decks, messages, signing.", pages: [], api: [] },
  { key: "tenant", label: "Tenant Portal", icon: "home", blurb: "What tenants do on their side: accounts, enquiries, messages.", pages: [], api: [] },
  { key: "marketing", label: "Emails and Events", icon: "mail", blurb: "Newsletters, campaigns and the marketing hub.", pages: ["/marketing-hub", "/emails", "/newsroom"], api: ["campaigns", "newsletters"] },
  { key: "tools", label: "Tools", icon: "rocket", blurb: "Bond, Radar and the launch pad.", pages: ["/tools"], api: ["bond", "radar", "tools", "postcards"] },
  { key: "search", label: "Search", icon: "search", blurb: "Search for anything.", pages: [], api: ["search"] },
  { key: "profile", label: "Profile and Set-up", icon: "user", blurb: "Profile, set-up, phone alerts and connecting REX and email.", pages: ["/profile", "/setup", "/settings", "/download", "/practice"], api: ["profile", "setup", "me", "push", "rex", "mailbox"] },
];

export const SECTION_BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

/**
 * A page address with the record taken out: /listings/848794 and
 * /market-appraisals/lead-os-27ca.../build become /listings/:id and
 * /market-appraisals/:id/build, so a page is counted as one page however many
 * records it was opened on.
 */
export function normalisePage(path: string): string {
  const clean = (path.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  return clean
    .split("/")
    .map((seg, i) => (i > 0 && seg && (/\d/.test(seg) || seg.length > 24) ? ":id" : seg))
    .join("/");
}

/** Which part of the OS a page belongs to. The longest matching prefix wins, so /agent/leads is Leads and not the phone's home. */
export function sectionForPage(path: string): SectionKey | null {
  let best: { key: SectionKey; len: number } | null = null;
  for (const s of SECTIONS) {
    for (const p of s.pages) {
      if (under(path, p) && (!best || p.length > best.len)) best = { key: s.key, len: p.length };
    }
  }
  /* The bare phone homes match only themselves: anything else under /agent
     or /m that no part names is not the dashboard. */
  if (best && (best.key === "dashboard") && (path.startsWith("/agent/") || path.startsWith("/m/"))) return null;
  return best?.key ?? null;
}

const API_SECTION = new Map<string, SectionKey>();
for (const s of SECTIONS) for (const a of s.api) API_SECTION.set(a, s.key);

/** Which part of the OS a call belongs to, from the word after /api/. */
export function sectionForApi(segment: string): SectionKey | null {
  return API_SECTION.get(segment) ?? null;
}

const WORDS: Record<string, string> = {
  m: "Phone",
  agent: "App",
  ":id": "a record",
  "market-appraisals": "Market Appraisals",
  "pre-tenancy": "Pre-tenancy",
  "compliance-desk": "Michael's view",
  "company-figures": "Susan's figures",
  "marketing-hub": "Marketing hub",
  plc: "PLC",
  "id-check": "ID check",
  "id-checks": "ID checks",
};

/** "/market-appraisals/:id/build" -> "Market Appraisals > a record > Build". */
export function pageLabel(page: string): string {
  if (page === "/") return "Home";
  return page
    .split("/")
    .filter(Boolean)
    .map((w) => WORDS[w] ?? w.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()))
    .join(" > ");
}
