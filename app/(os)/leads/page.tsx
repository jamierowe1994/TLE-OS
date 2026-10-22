"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BoardSkeleton } from "@/components/Skeleton";
import dynamic from "next/dynamic";
import { whenIdle } from "@/lib/when-idle";
import { useSearchParams } from "next/navigation";
import { PressButton } from "@/components/Bits";
import AddedHere from "@/components/AddedHere";
import { contactToLead, type ContactRow } from "@/lib/contacts-as-leads";
import { searchMatches } from "@/lib/search-match";
/* The drawer is 4,000 lines and the new-lead panel 1,300: off the first load,
   fetched while the board sits idle (see whenIdle below). */
const loadLeadDrawer = () => import("@/components/LeadDrawer");
const loadNewLeadPanel = () => import("@/components/NewLeadPanel");
const LeadDrawer = dynamic(loadLeadDrawer, { ssr: false });
const NewLeadPanel = dynamic(loadNewLeadPanel, { ssr: false });
import PageHeader from "@/components/PageHeader";
import SourceMark from "@/components/SourceMark";
import { ColumnCustomiser, DataTable, useColumns, type ColumnDef } from "@/components/TableColumns";
import { Pill } from "@/components/Wire";
import { LEADS, STAGE_TONE, leadSide, type Lead } from "@/lib/leads-sample";
import PickOne from "@/components/PickOne";
import TagsPick from "@/components/TagsPick";
import { defaultTags } from "@/lib/lead-facts-shape";
import Segmented from "@/components/Segmented";
import ListSearch from "@/components/ListSearch";
import DoodleIcon from "@/components/DoodleIcon";
import LeadGroups, { DEFAULT_GROUPS, isCompleted, type GroupsConfig } from "@/components/LeadGroups";
import GroupsCustomiser from "@/components/GroupsCustomiser";
import CornerSwell from "@/components/CornerSwell";
import { usePref } from "@/lib/prefs-store";
import { dropJson, peekJson, readJson } from "@/lib/page-cache";
import PassportsDoneList from "@/components/PassportsDoneList";
import ArchivedLeads from "@/components/ArchivedLeads";
import { doneAgo, type DonePassport } from "@/lib/passports-done-shape";
import { PASSPORT_LABEL, type PassportState, type PassportStateRow } from "@/lib/passport-states-shape";
import type { LeadViewingRow } from "@/lib/lead-viewings-shape";
import { SAGE_INK, SAGE_WASH } from "@/components/ListingTags";

/**
 * Leads: one inbox for every channel, with the record open beside it.
 *
 * The two feeds are genuinely different pipes — Rightmove/Zoopla/website land
 * in REX, paid social lands in GoHighLevel — and the page's job is that you
 * never have to care which. Every action written here goes back to REX.
 */

/** A filter that filters: pick a value, the list narrows, the chip wears
 *  the choice; "All …" hands the rows back. */

interface LeadSource {
  leads: Lead[];
  live: boolean;
  loading: boolean;
  reason?: string;
  /** The read failed. The board says so rather than showing an empty list as
   *  if it were true. */
  failed?: boolean;
  scanned?: number;
  setAside?: { sales: number; unclear: number; blank: number };
  total?: number | null;
  /** Leads the OS holds of its own, in its ledger. */
  onFile?: number;
  stale?: boolean;
}

/** What /api/leads answers. */
interface LeadsAnswer {
  ok?: boolean;
  live?: boolean;
  demo?: boolean;
  unlinked?: boolean;
  leads?: Lead[];
  hiddenIds?: string[];
  scanned?: number;
  setAside?: { sales: number; unclear: number; blank: number };
  total?: number | null;
  onFile?: number;
  stale?: boolean;
  reason?: string;
}

/** The board's state from one answer - the same whether it is the read just
 *  made or the last good one held in the tab. */
function sourceFrom(j: LeadsAnswer): LeadSource {
  if (j.ok && j.live && Array.isArray(j.leads)) {
    return { leads: j.leads, live: true, loading: false, scanned: j.scanned, setAside: j.setAside, total: j.total, onFile: j.onFile, stale: j.stale };
  }
  if (j.ok && j.demo) return { leads: LEADS, live: false, loading: false, reason: j.reason };
  return {
    leads: [],
    live: false,
    loading: false,
    failed: !j.unlinked,
    reason: j.reason ?? "We couldn't read your leads just now. Nothing is lost - try again in a minute.",
  };
}

/** The Passport filter, in the order a passport goes. */
const PASSPORT_OPTIONS: { id: PassportState | "none"; label: string }[] = (["none", "sent", "started", "done"] as const).map((id) => ({
  id,
  label: PASSPORT_LABEL[id],
}));

/**
 * One passport's state on the board. Completed is the solid pink of the
 * drawer's Passport done (James, 8 Oct 2026); Started and Sent step down
 * from it; Not sent is quiet, because it is most of the list.
 */
function PassportChip({ state, at }: { state: PassportState | "none"; at: string | null }) {
  const when = at ? doneAgo(at) : "";
  const look =
    state === "done"
      ? "bg-accent-dark text-white"
      : state === "started"
        ? "bg-accent-soft text-accent-dark"
        : state === "sent"
          ? "border border-accent-dark/60 text-accent-dark"
          : "border border-line/80 text-muted";
  const title =
    state === "done" ? `Passport completed ${when}` : state === "started" ? `Started, last filled in ${when}` : state === "sent" ? `Passport sent ${when}, not started` : "No passport sent yet";
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${look}`}>
      {state === "done" && <span aria-hidden>✓</span>}
      {PASSPORT_LABEL[state]}
      {when && <span className="font-normal opacity-80">· {when}</span>}
    </span>
  );
}

/**
 * Who is booked in to view (Lorna, 21 Oct 2026, ticket d44f5ea3): the next
 * viewing on the lead's row, so a lead that stays on the list after booking
 * says so without opening it. Sage while it is coming up; once it has been,
 * a quieter "Viewed". Nothing at all when there is no viewing.
 */
const LONDON = "Europe/London";
function ViewingChip({ list }: { list: LeadViewingRow[] }) {
  if (!list.length) return null;
  const now = Date.now();
  const ahead = list.filter((v) => new Date(v.startsAt).getTime() >= now - 30 * 60_000).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const been = list.filter((v) => !ahead.includes(v)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const v = ahead[0] ?? been[0];
  const at = new Date(v.startsAt);
  const day = at.toLocaleDateString("en-GB", { timeZone: LONDON, weekday: "short", day: "numeric", month: "short" });
  const time = at.toLocaleTimeString("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit" });
  const more = ahead.length > 1 ? ahead.length - 1 : 0;
  const title = [
    `${ahead[0] ? "Booked to view" : "Viewed"} ${v.address || "the property"} on ${day} at ${time}${v.agent ? ` with ${v.agent}` : ""}.`,
    ...ahead.slice(1).map((x) => {
      const d = new Date(x.startsAt);
      return `Also ${x.address || "a viewing"} on ${d.toLocaleDateString("en-GB", { timeZone: LONDON, weekday: "short", day: "numeric", month: "short" })} at ${d.toLocaleTimeString("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit" })}.`;
    }),
  ].join(" ");
  return ahead[0] ? (
    <span title={title} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: SAGE_WASH, color: SAGE_INK }}>
      <DoodleIcon name="calendar" size={11} />
      {day}, {time}
      {more > 0 && <span className="font-normal opacity-80">+{more}</span>}
    </span>
  ) : (
    <span title={title} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line/80 px-2 py-0.5 text-[10.5px] font-semibold text-muted">
      Viewed {day}
    </span>
  );
}

/**
 * Which page numbers to draw: the first, the last, and where you are.
 *
 * Every page used to get a button. At 21 pages that is 21 buttons in a row
 * that cannot wrap or scroll, which dragged the Leads document to 819px on a
 * 390px screen - the whole page scrolled sideways. It is also unbounded: the
 * ledger decides how many, so the row grows for ever as leads come in.
 *
 * Seven or fewer still shows them all, because a gap in place of one number
 * helps nobody.
 */
function pageWindow(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const want = new Set<number>([0, pages - 1, page]);
  for (const d of [-1, 1]) {
    const p = page + d;
    if (p > 0 && p < pages - 1) want.add(p);
  }
  const out: (number | "gap")[] = [];
  let prev = -1;
  for (const p of [...want].sort((a, b) => a - b)) {
    if (prev >= 0 && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

export default function Leads() {
  useEffect(() => whenIdle(() => { void loadLeadDrawer(); void loadNewLeadPanel(); }), []);
  // Closed on arrival: the page is the inbox, full width. The panel is a
  // consequence of picking someone, never the state you land in.
  const [openId, setOpenId] = useState<string | null>(null);
  /* ?open=<lead id> from the search bar: open that record on arrival. */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("open");
    if (wanted) setOpenId(wanted);
  }, []);
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  /** Bumped when a contact is saved, so the strip above the table re-reads. */
  const [addedTick, setAddedTick] = useState(0);
  // Stacks of 25 — enough by default, more when they want a long scroll.
  const [perPage, setPerPage] = useState(25);
  const [q, setQ] = useState("");
  /**
   * Table, or the three boxes.
   *
   * James, 10 Sep 2026: "a different view next to the new lead button". They
   * are two questions, not two skins - the table is for looking something up,
   * the boxes are for "what has come in and who have I not rung". See
   * components/LeadGroups.
   */
  /* Groups is the resting shape on a SIDE, and not offered at all on All
     leads. James, 10 Sep 2026: "the groups under All Leads shouldn't be
     visible on All Leads, but it should be visible on Tenants... when we
     first sign into it, it'll always go to Groups unless they click it."
     Groups asks "what has come in and who have I not rung", which is a
     question about one pipe - the tenant side or the landlord side. Asked of
     both at once it is a box of everybody, which is the list again with more
     scrolling. Held per side below, so a switch to List is remembered while
     you are on that side and a fresh sign-in starts at Groups. */
  const [view, setView] = useState<"list" | "groups">("list");
  /* The shape they settled on, kept per side and per person (James, 11 Sep
     2026: "once I've set it up, it will then stay"). All leads has no
     Groups, so nothing is remembered for it. */
  const [savedView, saveView, viewReady] = usePref<Record<string, "list" | "groups">>("leads-view-v1", {});
  /* How the boxes are laid out - which, in what order, how deep. */
  const [groupsConfig, saveGroupsConfig] = usePref<GroupsConfig>("leads-groups-v1", DEFAULT_GROUPS);
  const pickView = (v: "list" | "groups") => {
    setView(v);
    if (side) saveView({ ...savedView, [side]: v });
  };
  const [fSource, setFSource] = useState<string | null>(null);
  const [fAgent, setFAgent] = useState<string | null>(null);
  const [fStage, setFStage] = useState<string | null>(null);
  /* Tags, as a filter (James, 11 Sep 2026). Saved tags come from the OS;
     a lead nobody has tagged carries its defaults. Re-read when the drawer
     closes, so a tag just added is filterable at once. */
  const [fTags, setFTags] = useState<string[]>([]);
  const [savedTags, setSavedTags] = useState<Record<string, string[]>>({});
  /* Read on arrival and again when a drawer CLOSES - not when one opens.
     Opening re-read the whole board's tags and stages, and the answer landing
     mid-slide rebuilt the open lead, so the drawer threw away its own reads
     and fetched them all a second time (2 Oct 2026). */
  const drawerShut = openId === null;
  useEffect(() => {
    if (!drawerShut) return;
    fetch("/api/leads/facts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; tags?: Record<string, string[]> } | null) => { if (j?.ok && j.tags) setSavedTags(j.tags); })
      .catch(() => {});
    /* Not cancelled when a drawer opens: the answer is still the board's. */
  }, [drawerShut]);
  const tagsOf = useCallback((l: Lead) => savedTags[l.id] ?? defaultTags(l), [savedTags]);
  const params = useSearchParams();
  const side = params.get("side"); // "tenant" | "landlord" | null (both)

  /* ── Finished passports (Kirstie, 6 Oct 2026) ──────────────────────────
     She books no viewing until the passport is in. One read for the whole
     tenant side - it is both the Passports done view and the tick on each
     row below - re-read when a drawer closes, like the tags. Null while it
     reads; a failure is said, never an empty list standing in for it. */
  const passportsParam = params.get("passports") === "done";
  const [passportsOn, setPassportsOn] = useState(passportsParam);
  /* Arriving from the dashboard tile while already on Leads. */
  useEffect(() => setPassportsOn(passportsParam), [passportsParam]);
  const [donePassports, setDonePassports] = useState<DonePassport[] | null>(null);
  const [passportsError, setPassportsError] = useState<string | null>(null);
  useEffect(() => {
    if (side !== "tenant" || !drawerShut) return;
    let gone = false;
    fetch("/api/tenant/passports/done?limit=500", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; passports?: DonePassport[]; error?: string } | null) => {
        if (gone) return;
        if (j?.ok && Array.isArray(j.passports)) {
          setDonePassports(j.passports);
          setPassportsError(null);
        } else {
          setDonePassports(null);
          setPassportsError(j?.error ?? "The passports didn't load. Try again in a minute.");
        }
      })
      .catch(() => {
        if (gone) return;
        setDonePassports(null);
        setPassportsError("The passports didn't load. Try again in a minute.");
      });
    return () => { gone = true; };
  }, [side, drawerShut]);
  const pickPassports = (on: boolean) => {
    setPassportsOn(on);
    /* Kept in the address, so the dashboard tile can link straight here and
       a refresh stays where it was. */
    const u = new URL(window.location.href);
    if (on) u.searchParams.set("passports", "done");
    else u.searchParams.delete("passports");
    window.history.replaceState(null, "", u);
  };
  const showPassports = side === "tenant" && passportsOn;

  /* ── Every tenant's passport, sent or not (James, 9 Oct 2026) ──────────
     The Passport column and filter: Not sent, Sent, Started, Completed. One
     read for the board, re-read when a drawer closes (a passport sent from
     the drawer shows at once). Not on the landlord side, where there are no
     passports. Null while it reads; a failure leaves the column saying so,
     never Not sent standing in for an answer we don't have. */
  const passportsWanted = side !== "landlord";
  const [passportRows, setPassportRows] = useState<PassportStateRow[] | null>(null);
  const [passportRowsFailed, setPassportRowsFailed] = useState(false);
  useEffect(() => {
    if (!passportsWanted || !drawerShut) return;
    let gone = false;
    fetch("/api/tenant/passports/states", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; passports?: PassportStateRow[] } | null) => {
        if (gone) return;
        if (j?.ok && Array.isArray(j.passports)) {
          setPassportRows(j.passports);
          setPassportRowsFailed(false);
        } else setPassportRowsFailed(true);
      })
      .catch(() => { if (!gone) setPassportRowsFailed(true); });
    return () => { gone = true; };
  }, [passportsWanted, drawerShut]);
  /** A tenant lead's passport: by email, else by the OS contact it was made from. Null on a landlord. */
  const passportStateOf = useMemo(() => {
    const byEmail = new Map<string, PassportStateRow>();
    const byContact = new Map<string, PassportStateRow>();
    for (const r of passportRows ?? []) {
      if (r.email) byEmail.set(r.email, r);
      if (r.contactId) byContact.set(`os-${r.contactId}`, r);
    }
    return (l: Lead): { state: PassportState | "none"; at: string | null } | null => {
      if (leadSide(l) !== "tenant") return null;
      const hit = byEmail.get((l.email ?? "").trim().toLowerCase()) ?? byContact.get(l.id);
      return hit ? { state: hit.state, at: hit.at } : { state: "none", at: null };
    };
  }, [passportRows]);
  /* ── Who is booked in to view (Lorna, 21 Oct 2026, ticket d44f5ea3) ────
     One read for the board, like the passports, and re-read when a drawer
     closes so a viewing booked from the drawer shows at once. Matched by the
     lead it was booked from, the REX contact, or the email. */
  const [viewingRows, setViewingRows] = useState<LeadViewingRow[] | null>(null);
  const [viewingRowsFailed, setViewingRowsFailed] = useState(false);
  useEffect(() => {
    if (!passportsWanted || !drawerShut) return;
    let gone = false;
    fetch("/api/leads/viewings", { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j: { ok?: boolean; viewings?: LeadViewingRow[] } | null) => {
        if (gone) return;
        if (j?.ok && Array.isArray(j.viewings)) {
          setViewingRows(j.viewings);
          setViewingRowsFailed(false);
        } else setViewingRowsFailed(true);
      })
      .catch(() => { if (!gone) setViewingRowsFailed(true); });
    return () => { gone = true; };
  }, [passportsWanted, drawerShut]);
  const viewingsOf = useMemo(() => {
    const by = new Map<string, LeadViewingRow[]>();
    const add = (k: string, v: LeadViewingRow) => { const l = by.get(k); if (l) { if (!l.includes(v)) l.push(v); } else by.set(k, [v]); };
    for (const v of viewingRows ?? []) {
      if (v.leadId) add(`lead:${v.leadId}`, v);
      if (v.contactId) add(`contact:${v.contactId}`, v);
      if (v.email) add(`email:${v.email}`, v);
    }
    return (l: Lead): LeadViewingRow[] => {
      const hits = [
        ...(by.get(`lead:${l.id}`) ?? []),
        ...(l.contactId ? by.get(`contact:${l.contactId}`) ?? [] : []),
        ...(l.email ? by.get(`email:${l.email.trim().toLowerCase()}`) ?? [] : []),
      ];
      return [...new Map(hits.map((v) => [v.id, v])).values()];
    };
  }, [viewingRows]);
  const [fPassport, setFPassport] = useState<PassportState | "none" | null>(null);
  /* Off the landlord side the filter has nothing to filter. */
  useEffect(() => { if (!passportsWanted) setFPassport(null); }, [passportsWanted]);
  /* "Add new lead" in the sidebar lands here with ?new=1 and opens the panel. */
  const wantsNew = params.get("new") === "1";
  useEffect(() => {
    if (wantsNew) setCreating(true);
  }, [wantsNew]);

  /* All leads has no Groups, so it is always the list. A side opens on
     whatever this person last chose for it, and on Groups until they have. */
  useEffect(() => {
    if (!side) return setView("list");
    if (!viewReady) return;
    setView(savedView[side] ?? "groups");
    // Only when the side changes or the saved choice first arrives; a save
    // made here must not re-run this and put the view back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, viewReady]);

  /* ── The real book, out of REX. NOTHING stands in for it (18 Sep 2026).
        The demo book used to show while the real one loaded, when an agent had
        no link, and when the read failed - made-up people with real-looking
        addresses, on a live board, with Email and Send passport beside them.
        The demo book is for a laptop with no REX at all, and the server says
        so with `demo`. Anything else is a loading line or an error. ── */
  /* The last good read paints at once (lib/page-cache); the one below
     corrects it a moment later. */
  const [source, setSource] = useState<LeadSource>(() => {
    const held = peekJson<LeadsAnswer>("/api/leads");
    return held ? sourceFrom(held) : { leads: [], live: false, loading: true };
  });

  /* ── People added in the OS ────────────────────────────────────────────
     Their own fetch rather than a field on /api/leads, because the two answer
     different questions and fail separately: REX being slow must not delay a
     record somebody typed in ten seconds ago, and REX being down must not hide
     it. They arrive whenever they arrive and merge into the book below. */
  const [ours, setOurs] = useState<Lead[]>(() => peekJson<{ contacts?: ContactRow[] }>("/api/contacts")?.contacts?.map(contactToLead) ?? []);
  /* Removed from the OS: by the server (hiddenIds) and, the moment the drawer
     does it, by the "lead-removed" event - no reload needed. */
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => peekJson<LeadsAnswer>("/api/leads")?.hiddenIds ?? []);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [movedTo, setMovedTo] = useState<Record<string, string>>({});
  const [restoredTick, setRestoredTick] = useState(0);
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setRemoved((cur) => new Set(cur).add(id));
      /* Forget it was open: the drawer goes before its own close reaches the
         page, and a lead still "open" here springs back up the moment
         Reactivate returns it to the board. */
      if (id) setOpenId((cur) => (cur === id ? null : cur));
      /* The held board still has them; the next visit must not paint it. */
      dropJson("/api/leads");
    };
    /* Reactivated from Archived: back on the board now, and the next read
       of the board fetched fresh. */
    const back = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!id) return;
      setRemoved((cur) => { const next = new Set(cur); next.delete(id); return next; });
      setHiddenIds((cur) => cur.filter((x) => x !== id));
      dropJson("/api/leads");
      setRestoredTick((n) => n + 1);
    };
    /* Passed to somebody else from the drawer by an owner or the office
       ("Not my lead", components/LeadReassign): the row wears the new name
       now, and the next read of the board is fresh. */
    const moved = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; agent: string }>).detail;
      if (!d?.id) return;
      setMovedTo((cur) => ({ ...cur, [d.id]: d.agent }));
      dropJson("/api/leads");
    };
    window.addEventListener("lead-removed", on);
    window.addEventListener("lead-restored", back);
    window.addEventListener("lead-reassigned", moved);
    return () => {
      window.removeEventListener("lead-removed", on);
      window.removeEventListener("lead-restored", back);
      window.removeEventListener("lead-reassigned", moved);
    };
  }, []);
  useEffect(() => {
    let gone = false;
    if (addedTick) dropJson("/api/contacts");
    readJson<{ contacts?: ContactRow[] }>("/api/contacts", (j) => Array.isArray(j?.contacts))
      .then((j) => {
        if (!Array.isArray(j?.contacts)) return;
        if (!gone) setOurs(j.contacts.map(contactToLead));
      })
      .catch(() => {
        /* Nobody added by hand is simply nobody added by hand — the REX book
           still renders. A failure here must never empty the page. */
      });
    return () => { gone = true; };
  }, [addedTick]);

  useEffect(() => {
    let gone = false;
    const good = (j: LeadsAnswer) => Boolean(j.ok && j.live && Array.isArray(j.leads));
    let again = 0;
    readJson<LeadsAnswer>("/api/leads", good)
      .then((j) => {
        if (gone) return;
        if (Array.isArray(j.hiddenIds)) setHiddenIds(j.hiddenIds);
        setSource(sourceFrom(j));
        /* A held board answered while the server rebuilds it: read once more
           in a few seconds and take the rebuilt one. */
        if (j.stale) {
          again = window.setTimeout(() => {
            dropJson("/api/leads");
            readJson<LeadsAnswer>("/api/leads", good)
              .then((k) => { if (!gone && good(k)) setSource(sourceFrom(k)); })
              .catch(() => undefined);
          }, 4000);
        }
      })
      .catch(() => {
        /* The held board was only ever there until this read answered. A
           read that fails says so - never the old book standing in for it. */
        if (!gone) setSource({ leads: [], live: false, loading: false, failed: true, reason: "We couldn't read your leads just now. Nothing is lost - try again in a minute." });
      });
    return () => { gone = true; window.clearTimeout(again); };
  }, [restoredTick]);

  /* Ours first, newest at the top. Somebody who has just typed a record in
     expects to see it, and burying it below three hundred portal enquiries is
     the same as not showing it at all. */
  /* ── What the OS has logged against each lead ─────────────────────────
     One read for the whole book: only leads with something logged or booked
     come back, and for those the Stage column says the spine's word rather
     than REX's three. Fails to nothing - the REX stage stands. */
  const [spines, setSpines] = useState<Record<string, { label: string | null; followUpAt?: string | null }>>({});
  useEffect(() => {
    if (!drawerShut) return;
    fetch("/api/leads/spine", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; spines?: Record<string, { label: string | null; followUpAt?: string | null }> } | null) => {
        if (j?.ok && j.spines) setSpines(j.spines);
      })
      .catch(() => {});
    /* Not cancelled when a drawer opens: the answer is still the board's. */
  }, [drawerShut]);

  /* ── Beyond the newest 500 ──────────────────────────────────────────────
     The board loads the newest 500 leads; the file holds thousands. Three
     letters typed and the whole file is searched too (Susan, 19 Sep 2026: a
     missing lead should be findable without clicking through every agent),
     and whatever it finds joins the list below. */
  const [found, setFound] = useState<Lead[]>([]);
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 3) return setFound([]);
    let gone = false;
    const t = window.setTimeout(() => {
      fetch(`/api/leads/search?q=${encodeURIComponent(needle)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { ok?: boolean; leads?: Lead[] } | null) => {
          if (!gone && j?.ok && Array.isArray(j.leads)) setFound(j.leads);
        })
        .catch(() => {});
    }, 300);
    return () => {
      gone = true;
      window.clearTimeout(t);
    };
  }, [q]);

  const ALL = useMemo(() => {
    /* The people added here arrive TWICE - once from /api/contacts, and again
       from the lead book, which folds them in server-side (16 Sep 2026: React
       was warning about duplicate keys, and a lead shown twice can be worked
       twice). The book's copy wins: it carries the spine and the enquiry. */
    const seen = new Set<string>();
    const out: Lead[] = [];
    for (const l of [...source.leads, ...ours, ...found]) {
      if (seen.has(l.id) || removed.has(l.id) || hiddenIds.includes(l.id)) continue;
      seen.add(l.id);
      const label = spines[l.id]?.label;
      const followUpAt = spines[l.id]?.followUpAt ?? null;
      const was = movedTo[l.id] ? { ...l, agent: movedTo[l.id] } : l;
      out.push(label || followUpAt ? { ...was, ...(label ? { spineLabel: label } : {}), followUpAt } : was);
    }
    return out;
  }, [ours, source.leads, found, spines, removed, hiddenIds, movedTo]);

  // The dropdowns offer what the book actually contains — no imagined values.
  const sources = useMemo(() => [...new Set(ALL.map((l) => l.source))].sort(), [ALL]);
  const agents = useMemo(() => [...new Set(ALL.map((l) => l.agent))].sort(), [ALL]);
  const manyAgents = agents.filter((a) => a && a !== "Unassigned").length > 1;
  const stages = useMemo(() => [...new Set(ALL.map((l) => l.spineLabel ?? l.stage))], [ALL]);

  // Tenant-side and landlord-side are different jobs with different questions,
  // so the nav splits them and the list follows. The filters stack on top.
  /* Done with leads leave the List as well as Groups (Howard, 1 Oct 2026),
     with one switch at the foot to see them. A stage filter or a search finds
     them either way. */
  const [showDone, setShowDone] = useState(false);
  const { book, doneCount } = useMemo(() => {
    const needle = q.trim();
    const all = ALL.filter((l) => {
      if (side && leadSide(l) !== side) return false;
      if (fSource && l.source !== fSource) return false;
      if (fAgent && l.agent !== fAgent) return false;
      if (fStage && (l.spineLabel ?? l.stage) !== fStage) return false;
      if (fTags.length) { const mine = tagsOf(l); if (!fTags.every((t) => mine.includes(t))) return false; }
      /* A passport filter is a question about tenants: landlords drop out. */
      if (fPassport && passportStateOf(l)?.state !== fPassport) return false;
      /* Phone and address are in the needle too. Somebody looking a landlord up
         mid-call has the number in front of them far more often than the town,
         and a search that silently ignores what you typed reads as "not in the
         system". Punctuation is stripped from both sides so 07876 703066 finds
         07876703066. */
      if (needle) {
        const digits = needle.replace(/\D/g, "");
        const phoneHit = digits.length >= 5 && l.phone.replace(/\D/g, "").includes(digits);
        if (!searchMatches(needle, l.name, l.email, l.area, l.preferred, l.phone, l.address, l.agent) && !phoneHit) return false;
      }
      return true;
    });
    /* Lost is off the working list (Howard, 24 Sep 2026), and since 1 Oct so
       is everything else that is done - lost, a viewing or an appraisal
       booked, closed. Groups keeps them: it has its own Completed box. */
    /* A passport filter finds them too: a tenant whose REX enquiry is closed
       can still be the one with a finished passport, ready to book. */
    const keep = view === "groups" || showDone || Boolean(fStage) || Boolean(fPassport) || Boolean(needle);
    return { book: keep ? all : all.filter((l) => !isCompleted(l)), doneCount: all.filter(isCompleted).length };
  }, [ALL, side, fSource, fAgent, fStage, fTags, fPassport, passportStateOf, q, view, showDone]);
  /* Nobody's yet (Howard, 1 Oct 2026: a new valuation request can arrive with
     no agent, and support assigns it). Counted on the side being looked at,
     for the chip that filters to them. */
  const unassigned = useMemo(
    () => ALL.filter((l) => l.agent === "Unassigned" && (!side || leadSide(l) === side) && !isCompleted(l)).length,
    [ALL, side]
  );
  /* Every tag on the board this side, with how many carry it. */
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of ALL) { if (side && leadSide(l) !== side) continue; for (const t of tagsOf(l)) m.set(t, (m.get(t) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en-GB"));
  }, [ALL, side, tagsOf]);

  // A filter change can strand the page number past the end of the list.
  useEffect(() => {
    setPage(0);
  }, [side, fSource, fAgent, fStage, fTags, fPassport, q, perPage]);
  /* A lead opened by link may be one the list is not showing (completed):
     the drawer still opens it. */
  const open = book.find((l) => l.id === openId) ?? ALL.find((l) => l.id === openId) ?? null;

  /** Previous/Next walk the whole filtered book, not just the visible page. */
  function step(delta: number) {
    if (!open) return;
    const i = book.findIndex((l) => l.id === open.id);
    const next = book[(i + delta + book.length) % book.length];
    setOpenId(next.id);
    setPage(Math.floor(book.indexOf(next) / perPage));
  }

  // Defined once (per board shape) — a fresh array each render would restart the prefs effect.
  const defs = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        key: "name", label: "Lead", required: true,
        /* Who it is for, under the name, when the board is more than one
           agent's - the owner's view (Susan, 19 Sep 2026). Here rather than
           only in the Agent column, which is off unless switched on. */
        render: (l) => {
          return (
            <span className="block whitespace-nowrap">
              <span className="hand text-[13px]">{l.name}</span>
              {manyAgents && <span className="block text-[10.5px] text-muted">{l.agent && l.agent !== "Unassigned" ? `For ${l.agent}` : "Not assigned"}</span>}
            </span>
          );
        },
      },
      /* Straight after the name (James, 9 Oct 2026), so a ready tenant shows
         without opening anybody - it replaces the tick that sat on the name
         (Kirstie, 6 Oct). Tenants only; a landlord row is blank. */
      ...(passportsWanted
        ? [{
            key: "passport", label: "Passport", cell: "whitespace-nowrap",
            render: (l: Lead) => {
              const p = passportStateOf(l);
              if (!p) return null;
              if (!passportRows) {
                return passportRowsFailed
                  ? <span className="text-[11px] text-muted" title="The passports didn't load. Try again in a minute.">Didn&apos;t load</span>
                  : <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" aria-label="Loading" />;
              }
              return <PassportChip state={p.state} at={p.at} />;
            },
          } satisfies ColumnDef<Lead>]
        : []),
      /* Who is booked in to view, beside the passport (ticket d44f5ea3). */
      ...(passportsWanted
        ? [{
            key: "viewing", label: "Viewing", cell: "whitespace-nowrap",
            render: (l: Lead) => {
              if (leadSide(l) !== "tenant") return null;
              if (!viewingRows) {
                return viewingRowsFailed
                  ? <span className="text-[11px] text-muted" title="The viewings didn't load. Try again in a minute.">Didn&apos;t load</span>
                  : <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" aria-label="Loading" />;
              }
              return <ViewingChip list={viewingsOf(l)} />;
            },
          } satisfies ColumnDef<Lead>]
        : []),
      /* The home itself, not "Letting" (James, 9 Oct 2026: it is a lettings
         platform, the word says nothing). The listing they asked about; a
         landlord's own address; the town when neither is known. */
      {
        key: "property", label: "Property", cell: "max-w-[280px] truncate",
        render: (l) => {
          const home = l.address || (l.preferred && l.preferred !== "—" ? l.preferred : "") || l.area;
          return <span title={home}>{home}</span>;
        },
      },
      {
        key: "email", label: "Email",
        // Its own column now: squeezed under the name it was always truncated,
        // and an email you can't read is an email you can't act on.
        cell: "whitespace-nowrap text-muted",
        render: (l) => l.email,
      },
      { key: "phone", label: "Phone", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => l.phone },
      /* Off unless switched on: Property says where, and "Letting" said nothing. */
      { key: "enquiry", label: "Enquiry", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => (l.enquiry === "Letting" ? "Tenant" : l.enquiry) },
      { key: "area", label: "Area", optional: true, cell: "whitespace-nowrap", render: (l) => l.area },
      { key: "budget", label: "Budget", cell: "figures whitespace-nowrap", render: (l) => l.budget },
      { key: "source", label: "Source", cell: "text-muted", render: (l) => <SourceMark source={l.source} /> },
      { key: "received", label: "Received", cell: "whitespace-nowrap text-[11px] text-muted", render: (l) => l.received },
      { key: "moveDate", label: "Move date", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => l.moveDate },
      { key: "agent", label: "Agent", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => l.agent },
      {
        key: "stage", label: "Stage", cell: "whitespace-nowrap",
        render: (l) =>
          l.spineLabel ? (
            <Pill tone={l.spineLabel === "Appraisal booked" ? "good" : l.spineLabel === "Nurture" || l.spineLabel === "Lost" ? "neutral" : "accent"}>
              {l.spineLabel}
            </Pill>
          ) : (
            <Pill tone={STAGE_TONE[l.stage]}>{l.stage}</Pill>
          ),
      },
    ],
    [manyAgents, passportsWanted, passportStateOf, passportRows, passportRowsFailed, viewingsOf, viewingRows, viewingRowsFailed]
  );
  /* v2 (9 Oct 2026): Passport and Property arrived and Enquiry/Area went
     optional. Saved layouts from before would have put the new columns at
     the far end and kept "Letting" on, so everybody starts from the new one. */
  const cols = useColumns<Lead>("leads-v2", defs);

  /**
   * What was read, and what was left out of it.
   *
   * Moved off the masthead (10 Sep 2026) but NOT dropped: a list of 500 under
   * a count of 90,022 needs saying out loud, or the difference reads as leads
   * going missing. Live from the same response the list came from - never a
   * remembered number.
   */
  const scanNote = useMemo(() => {
    if (!source.live || source.loading) return null;
    const bits: string[] = [];
    if (source.scanned) bits.push(`Showing the ${source.scanned.toLocaleString("en-GB")} most recent`);
    if (source.setAside) {
      const aside = source.setAside.sales + source.setAside.unclear;
      if (aside) bits.push(`${aside.toLocaleString("en-GB")} set aside as sales or unclear`);
      if (source.setAside.blank) bits.push(`${source.setAside.blank.toLocaleString("en-GB")} with no details at all`);
    }
    if (source.onFile) bits.push(`${source.onFile.toLocaleString("en-GB")} kept on file in the OS - the search at the top looks through all of them`);
    return bits.length ? `${bits.join(". ")}.` : null;
  }, [source]);

  /* One press to the leads nobody has been given yet. Only on a board that
     holds more than one agent's work: an agent's own board never has any. */
  const unassignedChip =
    manyAgents && (unassigned > 0 || fAgent === "Unassigned") ? (
      <button
        type="button"
        onClick={() => setFAgent(fAgent === "Unassigned" ? null : "Unassigned")}
        aria-pressed={fAgent === "Unassigned"}
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
          fAgent === "Unassigned" ? "border-ink bg-ink text-page" : "border-accent/50 text-accent-dark hover:border-accent-dark"
        }`}
      >
        <DoodleIcon name="user" size={12} />
        {fAgent === "Unassigned" ? "Showing not assigned" : `${unassigned.toLocaleString("en-GB")} not assigned`}
      </button>
    ) : null;

  const pages = Math.max(1, Math.ceil(book.length / perPage));
  const rows = book.slice(page * perPage, page * perPage + perPage);

  return (
    <>
      <PageHeader
        title={side === "tenant" ? "Tenant leads" : side === "landlord" ? "Landlord leads" : "Leads"}
        /* The headline only.
           
           This used to carry the whole scan report - how many were read, how
           many set aside as sales or unclear, how many arrived with no details,
           how many are kept on file. Every one of those is worth saying: they
           are what explains a list of 500 sitting under a count of 90,000, and
           dropping them would have somebody report the gap as a fault.
           
           But they describe the LIST, not the page, and in the masthead they
           ran the blurb to six lines in a column narrowed by the artwork. They
           now sit directly above the table, where the thing they are talking
           about actually is. See `scanNote` below. */
        blurb={
          source.loading
            ? "Fetching today's enquiries…"
            : source.live
              ? `Live from the portals, your ads and the website${
                  source.total ? ` - ${source.total.toLocaleString("en-GB")} enquiries on record` : ""
                }.`
              : (source.reason ?? "New enquiries from the portals, your ads and the website.")
        }
        /* The bar under the header is the list's search - one search per
           page (James, 6 Sep 2026). */
        /* The board's search is the icon on the filter row (components/
           ListSearch, 11 Oct 2026); finding anything is the sidebar's ⌘K. */
        search={false}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Tenants only: the people who have finished their passport, and
                so can be booked in. One press on, one press back. */}
            {side === "tenant" && (
              <button
                type="button"
                onClick={() => pickPassports(!passportsOn)}
                aria-pressed={passportsOn}
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold transition-colors ${
                  passportsOn ? "border-accent-dark bg-accent-dark text-white" : "border-accent-dark/60 bg-accent-soft text-accent-dark hover:bg-accent-dark hover:text-white"
                }`}
              >
                <DoodleIcon name="user" size={13} />
                Passports Done
                {donePassports && <span className={`figures ${passportsOn ? "text-white/80" : "opacity-80"}`}>{donePassports.length.toLocaleString("en-GB")}</span>}
              </button>
            )}
            {/* The shape switch sits BEFORE the button that makes a lead, and
                the marker slides between them - the same control as every
                other choice of two in the OS. */}
            {side && !showPassports && (
              <Segmented
                value={view}
                onChange={pickView}
                options={[
                  { id: "list" as const, label: "List", icon: <DoodleIcon name="list" size={13} /> },
                  { id: "groups" as const, label: "Groups", icon: <DoodleIcon name="grid" size={13} /> },
                ]}
              />
            )}
            {/* Archived (James Crumpton, 14 Oct 2026): the applicants taken
                off the board, each with Reactivate. */}
            <button
              type="button"
              data-steve="leads.archived"
              onClick={() => setArchiveOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-line/80 bg-white px-3.5 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
            >
              <DoodleIcon name="folder" size={13} />
              Archived
            </button>
            {/* The brand colour they picked, as picked - not its deepened
                cousin. The switch beside it is brown, so the one button that
                MAKES something is the one thing on the row in the accent. */}
            <PressButton
              data-steve="leads.new"
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-white ring-1 ring-inset ring-black/10"
            >
              <span className="text-[15px] leading-none">+</span> New lead
            </PressButton>
          </div>
        }
      />

      <AddedHere refreshKey={addedTick} />
      <ArchivedLeads open={archiveOpen} onClose={() => setArchiveOpen(false)} />

      {source.failed && ALL.length > 0 && (
        <p className="mt-4 rounded-2xl border border-line/50 bg-white px-4 py-3 text-[12px] text-muted" role="alert">
          Your enquiries didn't load, so only the people added here by hand are showing. Try again in a minute.
        </p>
      )}

      <div className="mt-4">
        {/* Somebody typed in by hand still shows when the book does not: the
            state below only takes the board's place when there is nothing at
            all to put on it. */}
        {!source.live && ALL.length === 0 && source.loading ? (
          <BoardSkeleton label="Fetching your leads…" count={7} />
        ) : !source.live && ALL.length === 0 ? (
          <div className="fade-up rounded-[22px] border border-line/50 bg-white px-5 py-10 text-center" role="status">
            {source.loading ? null : (
              <>
                <p className="text-[13px] font-semibold text-ink">{source.failed ? "Your leads didn't load" : "No leads to show yet"}</p>
                <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-muted">{source.reason}</p>
                {source.failed && (
                  <PressButton onClick={() => window.location.reload()} className="mt-4 rounded-full bg-accent px-5 py-2 text-[12px] font-semibold text-white">
                    Try again
                  </PressButton>
                )}
              </>
            )}
          </div>
        ) : showPassports ? (
          <>
          <div className="mb-3 flex justify-end">
            <ListSearch value={q} onChange={setQ} placeholder="Name, phone, address or agent…" />
          </div>
          <PassportsDoneList
            passports={donePassports}
            error={passportsError}
            leads={ALL.filter((l) => leadSide(l) === "tenant")}
            activeId={openId}
            onOpen={(id) => setOpenId(id === openId ? null : id)}
            q={q}
            manyAgents={manyAgents}
          />
          </>
        ) : view === "groups" ? (
          <>
            <div className="fade-up relative z-20 rounded-[22px] border border-line/50 bg-white px-5 py-4">
              <CornerSwell />
              <div className="relative flex flex-wrap items-center gap-2.5">
                <PickOne tone="pink" label="All sources" options={sources.map((o) => ({ id: o, label: o }))} value={fSource} onChange={setFSource} />
                <PickOne tone="pink" label="All agents" options={agents.map((o) => ({ id: o, label: o }))} value={fAgent} onChange={setFAgent} />
                <PickOne tone="pink" label="All stages" options={stages.map((o) => ({ id: o, label: o }))} value={fStage} onChange={setFStage} />
                <TagsPick tone="pink" tags={tagCounts} value={fTags} onChange={setFTags} />
            {passportsWanted && <PickOne tone="pink" label="All passports" options={PASSPORT_OPTIONS} value={fPassport} onChange={setFPassport} />}
                {unassignedChip}
                <div className="ml-auto flex items-center gap-2">
                  <ListSearch value={q} onChange={setQ} placeholder="Name, phone, address or agent…" />
                  <GroupsCustomiser value={groupsConfig} onChange={saveGroupsConfig} />
                </div>
              </div>
              {scanNote && <p className="relative mt-3 text-[11px] leading-relaxed text-muted">{scanNote}</p>}
            </div>

            {/* The whole filtered book, not a page of it - each box does its
                own limiting, and paging a set of three boxes would mean "New
                today" ending halfway down page two. */}
            <div className="mt-4">
              <LeadGroups
                leads={book}
                activeId={openId}
                onOpen={(l) => setOpenId(l.id === openId ? null : l.id)}
                config={groupsConfig}
                badge={passportsWanted && viewingRows ? (l) => (leadSide(l) === "tenant" ? <ViewingChip list={viewingsOf(l)} /> : null) : undefined}
              />
            </div>
          </>
        ) : (
        <div className="fade-up relative min-w-0 rounded-[22px] border border-line/50 bg-white p-5">
          <CornerSwell />
          {/* Filters, with the column customiser at the end of the row. */}
          {/* The filters, then the search icon and the column customiser
              (components/ListSearch, 11 Oct 2026). */}
          <div className="relative flex flex-wrap items-center gap-2.5">
            <PickOne tone="pink" label="All sources" options={sources.map((o) => ({ id: o, label: o }))} value={fSource} onChange={setFSource} />
            <PickOne tone="pink" label="All agents" options={agents.map((o) => ({ id: o, label: o }))} value={fAgent} onChange={setFAgent} />
            <PickOne tone="pink" label="All stages" options={stages.map((o) => ({ id: o, label: o }))} value={fStage} onChange={setFStage} />
            <TagsPick tone="pink" tags={tagCounts} value={fTags} onChange={setFTags} />
            {passportsWanted && <PickOne tone="pink" label="All passports" options={PASSPORT_OPTIONS} value={fPassport} onChange={setFPassport} />}
            {unassignedChip}
            <div className="ml-auto flex items-center gap-2">
              <ListSearch value={q} onChange={setQ} placeholder="Name, phone, address or agent…" />
              <ColumnCustomiser cols={cols} tone="pink" />
            </div>
          </div>

          {/* The scan report, next to the list it is about. */}
          {scanNote && <p className="relative mt-3 text-[11px] leading-relaxed text-muted">{scanNote}</p>}

          <div className="relative mt-4">
            <DataTable
              cols={cols}
              rows={rows}
              activeId={openId}
              onRowClick={(l) => setOpenId(l.id === openId ? null : l.id)}
            />
          </div>

          <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/50 pt-4">
            <p className="flex items-center gap-2.5 text-[11px] text-muted">
              Showing {book.length ? page * perPage + 1 : 0}–
              {Math.min((page + 1) * perPage, book.length)} of {book.length} leads
              {doneCount > 0 && !fStage && !fPassport && !q.trim() && (
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  aria-pressed={showDone}
                  className="rounded-full border border-line/80 px-2.5 py-1 text-[11px] font-semibold text-accent-dark transition-colors hover:border-ink/40"
                >
                  {showDone ? `Hide ${doneCount.toLocaleString("en-GB")} completed` : `Show ${doneCount.toLocaleString("en-GB")} completed`}
                </button>
              )}
              <select
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="rounded-full border border-line/80 bg-transparent px-2.5 py-1 text-[11px] outline-none transition-colors hover:border-ink/40"
                title="Leads per page"
              >
                {[25, 50, 75, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </p>
            {/* flex-wrap as well as the window: a pager is never allowed to
                widen the page, whatever the count does. */}
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                ‹
              </button>
              {pageWindow(page, pages).map((i, at) =>
                i === "gap" ? (
                  <span key={`gap-${at}`} aria-hidden className="px-0.5 text-[11px] text-muted">
                    …
                  </span>
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i)}
                    className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] transition-colors ${
                      i === page
                        ? "bg-accent-soft/60 font-semibold text-accent-dark"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {i + 1}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                disabled={page >= pages - 1}
                className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      <LeadDrawer lead={open} onClose={() => setOpenId(null)} onStep={step} />
      {/* onCreated is a REFRESH nudge, nothing more. The panel saves itself
          now — this prop being forgotten is exactly how Save came to save
          nothing, so nothing depends on it any more. */}
      <NewLeadPanel
        open={creating}
        /* Landing on the Tenant or Landlord board and adding somebody means
           adding one of those - the home screen's quick links arrive with
           ?new=1&side=... for exactly this. */
        initialKind={side === "tenant" || side === "landlord" ? side : undefined}
        onClose={() => setCreating(false)}
        onCreated={() => setAddedTick((n) => n + 1)}
      />
    </>
  );
}
