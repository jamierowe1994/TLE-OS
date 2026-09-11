"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PressButton } from "@/components/Bits";
import AddedHere from "@/components/AddedHere";
import { contactToLead, type ContactRow } from "@/lib/contacts-as-leads";
import LeadDrawer from "@/components/LeadDrawer";
import NewLeadPanel from "@/components/NewLeadPanel";
import PageHeader from "@/components/PageHeader";
import SourceMark from "@/components/SourceMark";
import { ColumnCustomiser, DataTable, useColumns, type ColumnDef } from "@/components/TableColumns";
import { Pill } from "@/components/Wire";
import { LEADS, STAGE_TONE, leadSide, type Lead } from "@/lib/leads-sample";
import PickOne from "@/components/PickOne";
import TagsPick from "@/components/TagsPick";
import { defaultTags } from "@/lib/lead-facts-shape";
import Segmented from "@/components/Segmented";
import DoodleIcon from "@/components/DoodleIcon";
import LeadGroups from "@/components/LeadGroups";

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
  scanned?: number;
  setAside?: { sales: number; unclear: number; blank: number };
  total?: number | null;
  /** Leads the OS holds of its own, in its ledger. */
  onFile?: number;
  stale?: boolean;
}

export default function Leads() {
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
  const [fSource, setFSource] = useState<string | null>(null);
  const [fAgent, setFAgent] = useState<string | null>(null);
  const [fStage, setFStage] = useState<string | null>(null);
  /* Tags, as a filter (James, 11 Sep 2026). Saved tags come from the OS;
     a lead nobody has tagged carries its defaults. Re-read when the drawer
     closes, so a tag just added is filterable at once. */
  const [fTags, setFTags] = useState<string[]>([]);
  const [savedTags, setSavedTags] = useState<Record<string, string[]>>({});
  useEffect(() => {
    let gone = false;
    fetch("/api/leads/facts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; tags?: Record<string, string[]> } | null) => { if (!gone && j?.ok && j.tags) setSavedTags(j.tags); })
      .catch(() => {});
    return () => { gone = true; };
  }, [openId]);
  const tagsOf = useCallback((l: Lead) => savedTags[l.id] ?? defaultTags(l), [savedTags]);
  const params = useSearchParams();
  const side = params.get("side"); // "tenant" | "landlord" | null (both)
  /* "Add new lead" in the sidebar lands here with ?new=1 and opens the panel. */
  const wantsNew = params.get("new") === "1";
  useEffect(() => {
    if (wantsNew) setCreating(true);
  }, [wantsNew]);

  /* All leads has no Groups, so it is always the list. A side rests on Groups
     until somebody says otherwise, and changing side forgets that they did -
     the choice belongs to the question, not to the session. */
  useEffect(() => {
    setView(side ? "groups" : "list");
  }, [side]);

  /* ── The real book, out of REX. Until it answers we show the demo one, so
        the page never renders empty; `live` says which you're looking at. ── */
  const [source, setSource] = useState<LeadSource>({ leads: LEADS, live: false, loading: true });

  /* ── People added in the OS ────────────────────────────────────────────
     Their own fetch rather than a field on /api/leads, because the two answer
     different questions and fail separately: REX being slow must not delay a
     record somebody typed in ten seconds ago, and REX being down must not hide
     it. They arrive whenever they arrive and merge into the book below. */
  const [ours, setOurs] = useState<Lead[]>([]);
  /* Removed from the OS: by the server (hiddenIds) and, the moment the drawer
     does it, by the "lead-removed" event - no reload needed. */
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id) setRemoved((cur) => new Set(cur).add(id));
    };
    window.addEventListener("lead-removed", on);
    return () => window.removeEventListener("lead-removed", on);
  }, []);
  useEffect(() => {
    let gone = false;
    fetch("/api/contacts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((j: { contacts: ContactRow[] }) => {
        if (!gone) setOurs((j.contacts ?? []).map(contactToLead));
      })
      .catch(() => {
        /* Nobody added by hand is simply nobody added by hand — the REX book
           still renders. A failure here must never empty the page. */
      });
    return () => { gone = true; };
  }, [addedTick]);

  useEffect(() => {
    let gone = false;
    fetch("/api/leads")
      .then((r) => r.json())
      .then((j) => {
        if (gone) return;
        if (Array.isArray(j.hiddenIds)) setHiddenIds(j.hiddenIds);
        if (j.ok && j.live && Array.isArray(j.leads)) {
          setSource({
            leads: j.leads,
            live: true,
            loading: false,
            scanned: j.scanned,
            setAside: j.setAside,
            total: j.total,
            onFile: j.onFile,
            stale: j.stale,
          });
        } else {
          setSource({ leads: LEADS, live: false, loading: false, reason: j.reason });
        }
      })
      .catch(() => {
        if (!gone) setSource({ leads: LEADS, live: false, loading: false, reason: "REX didn't answer — showing the demo book." });
      });
    return () => { gone = true; };
  }, []);

  /* Ours first, newest at the top. Somebody who has just typed a record in
     expects to see it, and burying it below three hundred portal enquiries is
     the same as not showing it at all. */
  /* ── What the OS has logged against each lead ─────────────────────────
     One read for the whole book: only leads with something logged or booked
     come back, and for those the Stage column says the spine's word rather
     than REX's three. Fails to nothing - the REX stage stands. */
  const [spines, setSpines] = useState<Record<string, { label: string | null }>>({});
  useEffect(() => {
    let gone = false;
    fetch("/api/leads/spine", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; spines?: Record<string, { label: string | null }> } | null) => {
        if (!gone && j?.ok && j.spines) setSpines(j.spines);
      })
      .catch(() => {});
    return () => { gone = true; };
  }, [openId]);

  const ALL = useMemo(
    () =>
      [...ours, ...source.leads].filter((l) => !removed.has(l.id) && !hiddenIds.includes(l.id)).map((l) => {
        const label = spines[l.id]?.label;
        return label ? { ...l, spineLabel: label } : l;
      }),
    [ours, source.leads, spines, removed, hiddenIds]
  );

  // The dropdowns offer what the book actually contains — no imagined values.
  const sources = useMemo(() => [...new Set(ALL.map((l) => l.source))].sort(), [ALL]);
  const agents = useMemo(() => [...new Set(ALL.map((l) => l.agent))].sort(), [ALL]);
  const stages = useMemo(() => [...new Set(ALL.map((l) => l.spineLabel ?? l.stage))], [ALL]);

  // Tenant-side and landlord-side are different jobs with different questions,
  // so the nav splits them and the list follows. The filters stack on top.
  const book = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ALL.filter((l) => {
      if (side && leadSide(l) !== side) return false;
      if (fSource && l.source !== fSource) return false;
      if (fAgent && l.agent !== fAgent) return false;
      if (fStage && (l.spineLabel ?? l.stage) !== fStage) return false;
      if (fTags.length) { const mine = tagsOf(l); if (!fTags.every((t) => mine.includes(t))) return false; }
      /* Phone and address are in the needle too. Somebody looking a landlord up
         mid-call has the number in front of them far more often than the town,
         and a search that silently ignores what you typed reads as "not in the
         system". Punctuation is stripped from both sides so 07876 703066 finds
         07876703066. */
      if (needle) {
        const hay = `${l.name} ${l.email} ${l.area} ${l.preferred} ${l.phone} ${l.address ?? ""}`.toLowerCase();
        const digits = needle.replace(/\D/g, "");
        const phoneHit = digits.length >= 5 && l.phone.replace(/\D/g, "").includes(digits);
        if (!hay.includes(needle) && !phoneHit) return false;
      }
      return true;
    });
  }, [ALL, side, fSource, fAgent, fStage, fTags, tagsOf, q]);
  /* Every tag on the board this side, with how many carry it. */
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of ALL) { if (side && leadSide(l) !== side) continue; for (const t of tagsOf(l)) m.set(t, (m.get(t) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en-GB"));
  }, [ALL, side, tagsOf]);

  // A filter change can strand the page number past the end of the list.
  useEffect(() => {
    setPage(0);
  }, [side, fSource, fAgent, fStage, fTags, q, perPage]);
  const open = book.find((l) => l.id === openId) ?? null;

  /** Previous/Next walk the whole filtered book, not just the visible page. */
  function step(delta: number) {
    if (!open) return;
    const i = book.findIndex((l) => l.id === open.id);
    const next = book[(i + delta + book.length) % book.length];
    setOpenId(next.id);
    setPage(Math.floor(book.indexOf(next) / perPage));
  }

  // Defined once — a fresh array each render would restart the prefs effect.
  const defs = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        key: "name", label: "Lead", required: true,
        render: (l) => <span className="hand whitespace-nowrap text-[13px]">{l.name}</span>,
      },
      {
        key: "email", label: "Email",
        // Its own column now: squeezed under the name it was always truncated,
        // and an email you can't read is an email you can't act on.
        cell: "whitespace-nowrap text-muted",
        render: (l) => l.email,
      },
      { key: "phone", label: "Phone", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => l.phone },
      { key: "enquiry", label: "Enquiry", cell: "whitespace-nowrap text-muted", render: (l) => l.enquiry },
      { key: "area", label: "Area", cell: "whitespace-nowrap", render: (l) => l.area },
      { key: "budget", label: "Budget", cell: "figures whitespace-nowrap", render: (l) => l.budget },
      { key: "source", label: "Source", cell: "text-muted", render: (l) => <SourceMark source={l.source} /> },
      { key: "received", label: "Received", cell: "whitespace-nowrap text-[11px] text-muted", render: (l) => l.received },
      { key: "moveDate", label: "Move date", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => l.moveDate },
      { key: "agent", label: "Agent", optional: true, cell: "whitespace-nowrap text-muted", render: (l) => l.agent },
      {
        key: "stage", label: "Stage", cell: "whitespace-nowrap",
        render: (l) =>
          l.spineLabel ? (
            <Pill tone={l.spineLabel === "Appraisal booked" ? "good" : l.spineLabel === "Nurture" ? "neutral" : "accent"}>
              {l.spineLabel}
            </Pill>
          ) : (
            <Pill tone={STAGE_TONE[l.stage]}>{l.stage}</Pill>
          ),
      },
    ],
    []
  );
  const cols = useColumns<Lead>("leads", defs);

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
    if (source.onFile) bits.push(`${source.onFile.toLocaleString("en-GB")} kept on file in the OS`);
    return bits.length ? `${bits.join(". ")}.` : null;
  }, [source]);

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
            ? "Fetching today's enquiries from REX…"
            : source.live
              ? `Live from REX${
                  source.total ? ` - ${source.total.toLocaleString("en-GB")} enquiries on record` : ""
                }.`
              : (source.reason ?? "New enquiries from the portals, your ads and the website.")
        }
        /* James's row of houses with the To Let board (10 Sep 2026), in place
           of the seated scene.

           SIZED BY WIDTH, like the street on Portfolio, and for the same
           reason: at 2.66 wide, standing it at the seated scenes' 330 would
           run it 878px across and leave the blurb a column. What sets the
           number here is the footprint rather than the height - the text
           block reserves the artwork's width as padding, and this page's
           blurb is generated live from the REX counts, so it is the longest
           on the OS and the first to wrap when that padding grows.

           160 puts it at 426px, within three pixels of the 423 the seated
           scene occupied. The masthead therefore measures exactly what it did
           before the swap and nothing else on the page moves. 200, to match
           the street, took it to 532 and pushed the rule down 59px - which on
           the one week we have spent getting every masthead to the same depth
           would have been the wrong trade for a slightly bigger drawing.

           Pushed down 4% so the pavement runs into the line and is erased by
           it, the same as every other scene. */
        illustration="/illustrations/to-let-row.webp"
        illustrationHeight={240}
        illustrationNudge={26}
        illustrationAspect={2.6615}
        seat={0.96}
        illustrationCrop
        lineBreak="none"
        /* The bar under the header is the list's search - one search per
           page (James, 6 Sep 2026). */
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Search leads…"
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            {/* The shape switch sits BEFORE the button that makes a lead, and
                the marker slides between them - the same control as every
                other choice of two in the OS. */}
            {side && (
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { id: "list" as const, label: "List", icon: <DoodleIcon name="list" size={13} /> },
                  { id: "groups" as const, label: "Groups", icon: <DoodleIcon name="grid" size={13} /> },
                ]}
              />
            )}
            <PressButton
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page"
            >
              <span className="text-[15px] leading-none">+</span> New lead
            </PressButton>
          </div>
        }
      />

      <AddedHere refreshKey={addedTick} />

      <div className="mt-4">
        {view === "groups" ? (
          <>
            <div className="fade-up relative z-20 rounded-2xl border border-line/80 bg-panel px-5 py-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <PickOne label="All sources" options={sources.map((o) => ({ id: o, label: o }))} value={fSource} onChange={setFSource} />
                <PickOne label="All agents" options={agents.map((o) => ({ id: o, label: o }))} value={fAgent} onChange={setFAgent} />
                <PickOne label="All stages" options={stages.map((o) => ({ id: o, label: o }))} value={fStage} onChange={setFStage} />
                <TagsPick tags={tagCounts} value={fTags} onChange={setFTags} />
              </div>
              {scanNote && <p className="mt-3 text-[11px] leading-relaxed text-muted">{scanNote}</p>}
            </div>

            {/* The whole filtered book, not a page of it - each box does its
                own limiting, and paging a set of three boxes would mean "New
                today" ending halfway down page two. */}
            <div className="mt-4">
              <LeadGroups
                leads={book}
                activeId={openId}
                onOpen={(l) => setOpenId(l.id === openId ? null : l.id)}
              />
            </div>
          </>
        ) : (
        <div className="fade-up min-w-0 rounded-2xl border border-line/80 bg-panel p-5">
          {/* Filters, with the column customiser at the end of the row. */}
          {/* The search itself is the bar under the header - one search per
              page (James, 6 Sep 2026). This row is only the filters. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <PickOne label="All sources" options={sources.map((o) => ({ id: o, label: o }))} value={fSource} onChange={setFSource} />
            <PickOne label="All agents" options={agents.map((o) => ({ id: o, label: o }))} value={fAgent} onChange={setFAgent} />
            <PickOne label="All stages" options={stages.map((o) => ({ id: o, label: o }))} value={fStage} onChange={setFStage} />
            <TagsPick tags={tagCounts} value={fTags} onChange={setFTags} />
            <ColumnCustomiser cols={cols} />
          </div>

          {/* The scan report, next to the list it is about. */}
          {scanNote && <p className="mt-3 text-[11px] leading-relaxed text-muted">{scanNote}</p>}

          <div className="mt-4">
            <DataTable
              cols={cols}
              rows={rows}
              activeId={openId}
              onRowClick={(l) => setOpenId(l.id === openId ? null : l.id)}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
            <p className="flex items-center gap-2.5 text-[11px] text-muted">
              Showing {book.length ? page * perPage + 1 : 0}–
              {Math.min((page + 1) * perPage, book.length)} of {book.length} leads
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
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30"
              >
                ‹
              </button>
              {Array.from({ length: pages }, (_, i) => (
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
              ))}
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
        onClose={() => setCreating(false)}
        onCreated={() => setAddedTick((n) => n + 1)}
      />
    </>
  );
}
