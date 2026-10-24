"use client";

import RequiredDocs from "@/components/appraisal/RequiredDocs";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import GuideButton from "@/components/GuideButton";
import RexPropertyPicker from "@/components/RexPropertyPicker";
import PropertyFile from "@/components/PropertyFile";
import SaveChip, { SaveScopeProvider, useSaveScope } from "@/components/SaveChip";
import AppraisalMessages from "@/components/appraisal/AppraisalMessages";
import ListingAction from "@/components/appraisal/ListingAction";
import PhotosPanel from "@/components/appraisal/PhotosPanel";
import TakeOnWizard from "@/components/appraisal/TakeOnWizard";
import ConfirmLine from "@/components/appraisal/ConfirmLine";
import AppraisalChange from "@/components/AppraisalChange";
import AppraisalOutcome from "@/components/AppraisalOutcome";
import AppraisalTidy from "@/components/AppraisalTidy";
import WelcomeVideoRecorder from "@/components/WelcomeVideoRecorder";
import NextUp, { SAGE_INK, SAGE_WASH, type SentDeck } from "@/components/appraisal/NextUp";
import ChangeFees from "@/components/appraisal/ChangeFees";
import { glanceFor } from "@/components/appraisal/glance";
import {
  MA_STAGES,
  effectiveStage,
  needsValuation,
  type MarketAppraisal,
} from "@/lib/market-appraisal";
import { WhatsAppButton } from "@/components/WhatsAppQr";
import ContactBlock from "@/components/ContactBlock";
import HomeLandlords from "@/components/HomeLandlords";
import AppraisalLandlord from "@/components/new-look/AppraisalLandlord";
import { LandlordOnFile } from "@/components/LandlordHomeAddress";
import FileDocuments from "@/components/FileDocuments";
import TermsBanner from "@/components/appraisal/TermsBanner";
import { useNewLook } from "@/lib/use-new-look";
import { Badge, Ico, Menu, Tabs, type Tone } from "@/components/new-look/Parts";

/**
 * The appraisal file, to James's mock of 11 Sep 2026.
 *
 * Light and airy, the landlord portal's aesthetic brought into the OS: white
 * boxes with a hairline of trim, a blush hero, one sage box to break the
 * run, room around everything. The order is the order of the job:
 *
 *   0. QUICK LINKS     — the decks that exist and the video recorder, as
 *                        pills beside the back link
 *   1. THE HERO        — the address, the stage in a line, won or lost, the
 *                        house standing on the card's edge, and "At a
 *                        glance": the three facts an agent opens the file for
 *   2. THREE CARDS     — the landlord, the appointment, and NEXT UP: the one
 *                        box that changes with the stage (components/appraisal/NextUp)
 *   3. THE SPINE       — where it's up to, with the small ticks
 *
 * That is the whole page. The three-deck rail, the research and the
 * always-on property file came off it (James, 11 Sep): the step you are on
 * says what to do, the quick links open what exists, the property file
 * appears when the AML step asks for it, and the comparables live in the
 * presentation builder where they are used.
 */

const card = "rounded-[22px] border border-line/50 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const pill =
  "inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-white px-3.5 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40";
const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

/* "Saturday 19 September at 11:30am" - the way the landlord's email says it. */
const longDate = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s/g, "").toLowerCase();
  return `${day} at ${time}`;
};

interface FileRow {
  state: string;
  files: { key: string }[];
}

export default function AppraisalFile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  /* The new look (lib/new-look "appraisal", 23 Oct 2026): null until known. */
  const look = useNewLook("appraisal");
  /* The new look's tabs, and which stage of "Where it's up to" is opened out
     (null: the one it is at). Asked for here, above the early returns. */
  const [nlTab, setNlTab] = useState<NlTab>("overview");
  const [openStage, setOpenStage] = useState<number | null>(null);
  /* `undefined` means we have not looked yet and `null` means we looked and it
     is not there — the two must stay separate, or the page flashes "No such
     appraisal" at somebody who has just this second booked one. */
  const [booked, setBooked] = useState<MarketAppraisal | null | undefined>(undefined);
  const ma = booked ?? null;
  /* The Auto save chip beside the back link (23 Sep 2026). The documents
     checklist, the photographs, the take-on pop-out and the property file
     all report their saves to it. */
  const saves = useSaveScope(id);

  const reload = useCallback(() => {
    let gone = false;
    /* This one record, not the whole list (2 Oct 2026) - the list read paid
       for the signals of every other file on every save. */
    fetch(`/api/appraisals/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { appraisal?: MarketAppraisal | null } | null) => {
        if (gone) return;
        setBooked(j?.appraisal ?? null);
      })
      .catch(() => {
        if (!gone) setBooked(null);
      });
    return () => {
      gone = true;
    };
  }, [id]);
  useEffect(() => reload(), [reload]);

  /* The decks, read once here for the quick links and the Next up box.
     The lead and the ref come off the route id (the store keys an appraisal
     booked from a lead "lead-<leadId>", lib/appraisal-store), so the decks
     and the lead's facts start alongside the record instead of after it. */
  const routeLeadId = id.startsWith("lead-") ? id.slice("lead-".length) : null;
  const refId = ma ? (ma.leadId ?? ma.id) : (routeLeadId ?? id);
  /* The property type as the lead's property card holds it - "HMO" is one of
     its choices, and that is what decides the HMO documents (20 Sep 2026). */
  const [propertyType, setPropertyType] = useState<string | null>(null);
  const factsLeadId = ma ? ma.leadId : routeLeadId;
  useEffect(() => {
    const leadId = factsLeadId;
    if (!leadId) return;
    let live = true;
    fetch(`/api/leads/${encodeURIComponent(leadId)}/facts`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; property?: { type?: string | null } | null } | null) => {
        if (live && j?.ok) setPropertyType(j.property?.type ?? null);
      })
      .catch(() => { /* the card still offers the full list */ });
    return () => { live = false; };
  }, [factsLeadId]);
  const [decks, setDecks] = useState<SentDeck[] | null | undefined>(undefined);
  const loadDecks = useCallback(() => {
    if (!refId) return;
    fetch(`/api/presentations?ref=${encodeURIComponent(refId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; sent?: SentDeck[] }) => setDecks(j.ok && j.sent ? j.sent : null))
      .catch(() => setDecks(null));
  }, [refId]);
  useEffect(() => loadDecks(), [loadDecks]);

  /* The property file, counted for "At a glance". One light call so the
     hero can say "3 on file" without the whole panel. */
  const [file, setFile] = useState<{ held: number; outstanding: number } | null | undefined>(undefined);
  /* Keyed on the two fields it reads, not the record: every save hands back
     a new object, and this re-read the property file each time. */
  const fileRexId = ma?.rexPropertyId ?? null;
  const fileAddress = ma?.address ?? null;
  useEffect(() => {
    if (!fileRexId && !fileAddress) return;
    let live = true;
    const key = fileRexId ? `property=${encodeURIComponent(fileRexId)}` : `address=${encodeURIComponent(fileAddress ?? "")}`;
    fetch(`/api/property-file?${key}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; rows?: FileRow[]; outstanding?: number } | null) => {
        if (!live) return;
        if (!j?.ok || !Array.isArray(j.rows)) return setFile(null);
        setFile({
          held: j.rows.filter((r) => r.files.length > 0 || r.state === "valid" || r.state === "expiring").length,
          outstanding: j.outstanding ?? 0,
        });
      })
      .catch(() => live && setFile(null));
    return () => {
      live = false;
    };
  }, [fileRexId, fileAddress]);

  /* A save hands back the bare row; the ticks, the live stage and the
     "why" line only come with the staged read, so re-read this one record
     after every save. */
  const saved = useCallback(
    (next: MarketAppraisal) => {
      setBooked((prev) => (prev ? { ...prev, ...next } : next));
      reload();
    },
    [reload]
  );

  /* The property file panel, shown when asked for. */
  const [showFile, setShowFile] = useState(false);
  /* The home's documents (James, 5 Oct 2026), shared with the listing, the
     application and Kirstie's deal for the same address. */
  const [showDocs, setShowDocs] = useState(false);

  /* The landlord conversation. Opened from the Messages link, or straight
     away from the agent's email (?messages=1 - James, 17 Sep 2026). */
  const [showMessages, setShowMessages] = useState(false);
  /* The photographs and the advert, after the take-on visit (?photos=1). */
  const [showPhotos, setShowPhotos] = useState(false);
  /* The pop-out does the writing up; the panel under the file is the record
     of what came of it (James, 17 Sep 2026: "I would rather a pop-out modal
     ... the scroll down just looks a bit shit"). */
  const [wizard, setWizard] = useState(false);
  const openPhotos = useCallback(() => {
    setWizard(true);
    setShowPhotos(true);
    setNlTab("photos");
  }, []);
  useEffect(() => {
    if (booked === undefined) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("photos") !== "1") return;
    params.delete("photos");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    openPhotos();
  }, [booked, openPhotos]);
  /* Asked for from the Next up card, which is on this page. */
  useEffect(() => {
    const onAsk = () => openPhotos();
    window.addEventListener("os-appraisal-photos", onAsk);
    return () => window.removeEventListener("os-appraisal-photos", onAsk);
  }, [openPhotos]);
  const [readHere, setReadHere] = useState(false);
  const markRead = useCallback(() => setReadHere(true), []);
  const openMessages = useCallback(() => {
    setShowMessages(true);
    setNlTab("messages");
    setTimeout(() => document.getElementById("messages")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }, []);
  useEffect(() => {
    if (booked === undefined) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("messages") !== "1") return;
    params.delete("messages");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    openMessages();
  }, [booked, openMessages]);

  if (look && booked === undefined) {
    return (
      <div data-look="new" className="nl-page">
        <p className="nl-empty">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
          Fetching the appraisal…
        </p>
      </div>
    );
  }

  if (look && !ma) {
    return (
      <div data-look="new" className="nl-page nl-rise">
        <div className="nl-crumbs">
          <Link href="/market-appraisals" className="nl-crumb">
            <Ico name="back" size={14} /> Market Appraisals
          </Link>
        </div>
        <div className="py-12">
          <h1 className="nl-section-title">No Such Appraisal</h1>
          <p className="nl-meta mt-2">It may have been removed, or the link is wrong.</p>
        </div>
      </div>
    );
  }

  if (booked === undefined || look === null) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-[12.5px] text-muted">Fetching the appraisal…</p>
      </div>
    );
  }

  if (!ma) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="hand text-[20px]">No such appraisal</p>
        <p className="mt-2 text-[12.5px] text-muted">It may have been removed, or the link is wrong.</p>
        <Link href="/market-appraisals" className="mt-4 inline-block text-[12.5px] underline">
          Back to Market Appraisals
        </Link>
      </div>
    );
  }

  const live = effectiveStage(ma);
  /* "Lost" is an outcome, not a step, and it is not drawn on the spine. */
  const spine = MA_STAGES.filter((s) => s.id !== "lost");
  const at = Math.max(0, spine.findIndex((s) => s.id === live));
  const missingFigure = needsValuation(ma);
  const when = ma.appointmentAt ? new Date(ma.appointmentAt) : null;
  const past = Boolean(when && when < new Date());
  const latest = (kind: string) => decks?.find((d) => d.kind === kind) ?? null;
  const pre = latest("pre-appraisal");
  const deck = latest("appraisal");
  const post = latest("post-appraisal");
  const termsSigned =
    live === "takeon" || live === "aml" || live === "won" || (ma.ticks ?? []).some((t) => t.id === "terms-signed" && t.done);
  const openFile = () => {
    setShowFile(true);
    setNlTab("file");
    setTimeout(() => document.getElementById("property-file")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const openDocs = () => {
    setShowDocs(true);
    setNlTab("documents");
    setTimeout(() => document.getElementById("documents")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  /* ── THE NEW LOOK (lib/new-look "appraisal", 23 Oct 2026) ───────────────
     The same file, read and saved the same way, drawn as the design's
     record: the head with its jobs, the step that changes with the stage
     beside At a glance, the progress line, then tabs. The quick links of
     the old page are the tabs and the three-dot menu; the old page stays
     below until the switch has bedded in. */
  if (look) {
    const stageLabel = live === "lost" ? "Lost" : MA_STAGES.find((s) => s.id === live)?.label ?? "Booked";
    const tone: Tone = live === "won" ? "good" : live === "lost" ? "neutral" : live === "post_appraisal" || live === "takeon" || live === "aml" ? "accent" : "info";
    const unread = !readHere ? ma.unreadMessages ?? 0 : 0;
    const openIdx = openStage ?? at;
    const goTab = (t: NlTab) => {
      setNlTab(t);
      if (t === "messages") setShowMessages(true);
      if (t === "photos") setShowPhotos(true);
      if (t === "documents") setShowDocs(true);
      if (t === "file") setShowFile(true);
      setTimeout(() => document.getElementById("nl-appr-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    };
    const openUrl = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
    const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const opened = (n: number) => (n > 0 ? `opened ${n === 1 ? "once" : `${n} times`}` : "not opened yet");
    const homeLine = [ma.address, ma.postcode && !ma.address.includes(ma.postcode) ? ma.postcode : null].filter(Boolean).join(", ");

    return (
      <SaveScopeProvider scope={saves}>
        <div data-look="new" className="nl-page nl-rise nl-appr">
          <div className="nl-crumbs">
            <Link href="/market-appraisals" className="nl-crumb">
              <Ico name="back" size={14} /> Market Appraisals
            </Link>
            <SaveChip scope={saves} className="bg-card" />
          </div>

          {/* The head: where it is, the address, one line of facts, then the jobs. */}
          <div className="nl-rhead">
            <div className="nl-rhead-text">
              <div className="nl-rhead-meta">
                <Badge tone={tone}>{stageLabel}</Badge>
                <span className="nl-meta">Market appraisal · stage {at + 1} of {spine.length}</span>
                {ma.cancelledAt && <Badge tone="accent">Cancelled</Badge>}
              </div>
              <h1 className="nl-title">{ma.address}</h1>
              <p className="nl-rhead-sub">
                {[ma.postcode && !ma.address.includes(ma.postcode) ? ma.postcode : null, ma.landlord, ma.agent ? `with ${ma.agent}` : null, ma.valuation ? `valued ${gbp(ma.valuation)} pcm` : null].filter(Boolean).join(" · ")}
              </p>
              {ma.stageWhy && <p className="nl-meta mt-3 max-w-2xl">{ma.stageWhy}</p>}
              {/* Off the board without losing it, or a test file gone (23 Oct 2026). */}
              <div className="nl-appr-tidy">
                <AppraisalTidy
                  id={ma.id}
                  archivedAt={ma.archivedAt}
                  archivedBy={ma.archivedBy}
                  archivedWhy={ma.archivedWhy}
                  onLost={async () => {
                    await fetch("/api/appraisals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ma.id, outcome: "lost" }) }).catch(() => null);
                    window.location.reload();
                  }}
                />
              </div>
            </div>
            <div className="nl-rhead-acts">
              {/* Once the terms are signed, the listing is one press away whatever the stage. */}
              {termsSigned && <ListingAction ma={ma} className="nl-btn nl-btn--secondary" onLinked={saved} />}
              {!past && (
                <Link href={`/market-appraisals/${ma.id}/build`} className="nl-btn nl-btn--secondary" data-steve="appraisal.build">
                  <Ico name="pen" /> {deck ? "Update presentation" : "Build presentation"}
                </Link>
              )}
              {/* The stage is read from the record; these are the two hand moves. */}
              {!ma.archivedAt && (
                <span className="nl-appr-outcome">
                  <AppraisalOutcome id={ma.id} stage={live} why={null} size="large" />
                </span>
              )}
              <Menu
                items={[
                  ...(pre ? [{ label: "Pre-appraisal deck", sub: ma.preSend?.state === "sent" ? "Sent to the landlord" : "What the landlord is sent before the visit", onClick: () => openUrl(pre.url) }] : []),
                  ...(deck
                    ? [
                        { label: "View presentation", onClick: () => openUrl(deck.url) },
                        { label: "Download PDF", sub: "To have with you at the appointment", onClick: () => openUrl(`${deck.url.split("?")[0]}/print`) },
                      ]
                    : []),
                  ...(post ? [{ label: "Post-appraisal deck", onClick: () => openUrl(post.url) }] : []),
                  ...(pre || deck || post ? (["rule"] as const) : []),
                  { label: "Photographs", onClick: () => goTab("photos") },
                  { label: unread ? `Messages (${unread} new)` : "Messages", onClick: () => goTab("messages") },
                  { label: "Documents", onClick: () => goTab("documents") },
                  { label: "Property file", onClick: () => goTab("file") },
                ]}
              />
              <span className="nl-appr-guide">
                <GuideButton id="appraisals" />
              </span>
            </div>
          </div>

          {/* The one box that changes with the stage, beside At a glance. */}
          <div className="nl-appr-hero">
            <div className="nl-appr-next">
              <NextUp
                look="new"
                ma={ma}
                decks={decks}
                onSaved={saved}
                onDecksChanged={() => {
                  loadDecks();
                  reload();
                }}
                onAttach={openFile}
              />
            </div>
            <section className="nl-facts">
              <div className="nl-facts-head">
                <h3 className="nl-block-title">At a Glance</h3>
              </div>
              <ul className="nl-appr-glance">
                {glanceFor(ma, live, decks === undefined ? undefined : { deck: Boolean(deck), post: post ? { opens: post.opens } : null }, file).map((g, i) => (
                  <li key={i}>
                    <b>{g.title}</b>
                    {g.sub && <span>{g.sub}</span>}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Where it's up to: a step each, nothing written under them. */}
          <div className="nl-progress nl-appr-progress" style={{ "--nl-steps": spine.length } as React.CSSProperties} aria-label={`Stage ${at + 1} of ${spine.length}`}>
            {spine.map((s, i) => (
              <div key={s.id} className={`nl-step${i < at || (live === "won" && i === at) ? " done" : s.id === live ? " now" : ""}`}>
                <i />
                <span>{s.label}</span>
              </div>
            ))}
          </div>

          <div id="nl-appr-tabs" className="scroll-mt-6">
            <Tabs
              label="This appraisal"
              className="nl-ltabs"
              value={nlTab}
              onChange={(t) => goTab(t)}
              items={[
                { id: "overview" as NlTab, label: "Overview" },
                { id: "messages" as NlTab, label: "Messages", count: unread || null, dot: unread > 0 },
                { id: "photos" as NlTab, label: "Photographs" },
                { id: "documents" as NlTab, label: "Documents" },
                { id: "file" as NlTab, label: "Property file", count: file?.held || null },
                { id: "presentation" as NlTab, label: "Presentation", count: decks ? decks.length || null : null },
              ]}
            />
          </div>

          <div key={nlTab} className="nl-pane">
            {nlTab === "overview" && (
              <div className="nl-bento">
                {/* The stages opened out, with the small ticks read from the record. */}
                <section className="nl-cell span2">
                  <div className="nl-cell-head">
                    <h3 className="nl-block-title">Where It&apos;s Up To</h3>
                    <span className="nl-meta">Stage {at + 1} of {spine.length}</span>
                  </div>
                  <ol className="nl-appr-stages">
                    {spine.map((s, i) => {
                      const here = s.id === live;
                      const done = i < at || (live === "won" && here);
                      const ticks = (ma.ticks ?? []).filter((t) => t.stage === s.id);
                      const ticked = ticks.filter((t) => t.done).length;
                      const isOpen = openIdx === i;
                      return (
                        <li key={s.id} className={`nl-appr-stage ${done ? "is-done" : here ? "is-now" : "is-next"}${isOpen ? " is-open" : ""}`}>
                          <button type="button" className="nl-appr-stage-head" aria-expanded={isOpen} onClick={() => setOpenStage(isOpen ? -1 : i)}>
                            <span className="nl-appr-dot">{done ? <Ico name="check" size={12} /> : i + 1}</span>
                            <span className="nl-appr-stage-name">{s.label}</span>
                            <span className="nl-meta">{done ? "Done" : here ? (ticks.length ? `${ticked} of ${ticks.length}` : "Now") : ticks.length && ticked ? `${ticked} of ${ticks.length}` : "Not yet"}</span>
                            <svg className="nl-appr-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                          <div className={`nl-collapse${isOpen ? " is-open" : ""}`}>
                            <div>
                              <div className="nl-appr-stage-body">
                                {here && <p className="nl-meta">{s.blurb.replace(/\s*—\s*/g, " - ")}</p>}
                                {ticks.length > 0 ? (
                                  <ul className="nl-appr-ticks">
                                    {ticks.map((t) => (
                                      <li key={t.id} title={t.at ? new Date(t.at).toLocaleString("en-GB") : undefined}>
                                        <span className={`nl-appr-check${t.done ? " on" : ""}`} aria-label={t.done ? "Done" : "Not done"}>
                                          {t.done && <Ico name="check" size={11} />}
                                        </span>
                                        <span className={t.done ? "" : "nl-appr-tick-todo"}>{t.label}</span>
                                        {t.detail ? <span className="nl-meta">{t.detail}</span> : t.done && t.at ? <span className="nl-mono">{day(t.at)}</span> : null}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  !here && <p className="nl-meta">Nothing to tick at this stage.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="nl-appr-foot">
                    <Ico name="arrow" size={14} />
                    Once terms are signed this stops being an appraisal and becomes a listing.
                  </p>
                </section>

                {/* The landlord, fixed until the pencil (James, 24 Oct 2026): no
                    add buttons under it; the pencil opens the changes, the
                    additional landlords and the points of contact in one go. */}
                <section className="nl-cell">
                  <AppraisalLandlord
                    landlord={{ name: ma.landlord, email: ma.landlordEmail ?? null, phone: ma.landlordMobile ?? null }}
                    landlordRef={ma.landlordRef ?? null}
                    homeKey={ma.rexPropertyId ?? `appraisal:${ma.id}`}
                    address={homeLine}
                    onSaved={() => reload()}
                    onWhatsAppSent={
                      ma.leadId
                        ? async (message) => {
                            /* The appraisal came from a lead, and the lead keeps the log. */
                            const settle = saves.reporter.begin("WhatsApp log");
                            let problem: string | null;
                            try {
                              const r = await fetch(`/api/leads/${encodeURIComponent(ma.leadId as string)}/touches`, {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ kind: "whatsapp", outcome: "sent", body: message }),
                              });
                              const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
                              problem = j?.ok ? null : (j?.error ?? "That didn't save.");
                            } catch {
                              problem = "That didn't save - the connection dropped.";
                            }
                            settle(problem ? { ok: false, problem } : { ok: true });
                            return problem;
                          }
                        : undefined
                    }
                  />
                  <LandlordOnFile
                    className="pb-2"
                    email={ma.landlordEmail ?? null}
                    name={ma.landlord}
                    propertyAddress={[ma.address, ma.postcode].filter(Boolean).join(", ")}
                    appraisalId={ma.id}
                  />
                  <div className="nl-appr-picker mt-auto">
                    <RexPropertyPicker appraisal={ma} onSaved={saved} />
                  </div>
                </section>

                {/* The appointment */}
                <section className="nl-cell">
                  <h3 className="nl-block-title">The Appointment</h3>
                  {when ? (
                    <>
                      <p className="nl-appr-when">{longDate(ma.appointmentAt!)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {past ? <Badge tone="good">Visit done</Badge> : <Badge tone="info">Coming up</Badge>}
                        <span className="nl-meta">{ma.agent ? `with ${ma.agent}` : "In the diary"}</span>
                      </div>
                      {past && (
                        <p className="nl-meta">
                          {missingFigure ? "No figure recorded yet - the post-appraisal deck waits on it." : "The figure is recorded, so the post-appraisal deck can go."}
                        </p>
                      )}
                    </>
                  ) : ma.cancelledAt ? (
                    <>
                      {ma.cancelledWas && <p className="nl-appr-when is-struck">{longDate(ma.cancelledWas)}</p>}
                      <p className="nl-meta">
                        Cancelled{ma.cancelledBy ? ` by ${ma.cancelledBy}` : ""} on{" "}
                        {new Date(ma.cancelledAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}. Nothing is in the diary for it.
                      </p>
                    </>
                  ) : (
                    <p className="nl-meta">
                      No date on this appraisal. It was booked without one - worth chasing, because the pre-appraisal deck is scheduled from the appointment.
                    </p>
                  )}
                  {(ma.cancelledAt || (when && !past)) && (
                    <div className="flex flex-wrap gap-2">
                      <AppraisalChange
                        appraisalId={ma.id}
                        appraisal={ma}
                        buttonClass="nl-btn nl-btn--secondary nl-btn--sm"
                        noteClass="w-full nl-meta"
                        onChanged={(next) => {
                          if (next) saved(next as MarketAppraisal);
                          else reload();
                        }}
                      />
                    </div>
                  )}
                  {/* What the landlord has been sent, as the record has it. */}
                  {when && (
                    <div className="nl-appr-confirm">
                      <ConfirmLine appraisalId={ma.id} appointmentAt={ma.appointmentAt!} />
                    </div>
                  )}
                </section>

                {/* The property file, counted; the full panel is its own tab. */}
                <section className="nl-cell">
                  <h3 className="nl-block-title">Property File</h3>
                  <p className="nl-meta">
                    {file === undefined
                      ? "Reading the property file…"
                      : file === null
                        ? "We couldn't read the property file just now. Open it to try again."
                        : file.held === 0 && file.outstanding === 0
                          ? "Nothing on file yet. Certificates the landlord hands over at the visit are filed here, against the address."
                          : `${file.held} on file${file.outstanding ? `, ${file.outstanding} still to come` : ""}. Filed against the address, so they are on the home the day it is instructed.`}
                  </p>
                  <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm self-start" onClick={() => goTab("file")}>
                    Open the property file
                  </button>
                </section>

                {/* What the landlord will be asked for, beyond the five (Susan, 19 Sep 2026). */}
                <section className="nl-cell nl-appr-reqdocs">
                  <RequiredDocs appraisalId={ma.id} address={ma.address} postcode={ma.postcode} propertyType={propertyType} />
                </section>
              </div>
            )}

            {nlTab === "messages" && (
              <div id="messages" className="scroll-mt-6">
                <AppraisalMessages appraisalId={ma.id} landlord={ma.landlord} onRead={markRead} />
              </div>
            )}

            {nlTab === "photos" && (
              <div id="photos" className="scroll-mt-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="nl-meta min-w-0 flex-1 basis-[260px]">The take-on visit is written up in its own window. What came of it, the photographs and the advert, sits here.</p>
                  <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => setWizard(true)}>
                    <Ico name="camera" size={15} /> Write up the take-on visit
                  </button>
                </div>
                <PhotosPanel ma={ma} />
              </div>
            )}

            {nlTab === "documents" && (
              <section id="documents" className="scroll-mt-6">
                {/* The terms first, as the listing's Documents has them (24 Oct 2026, new look only). */}
                <div className="mb-6">
                  <TermsBanner ma={ma} onChanged={(next) => (next ? saved(next) : reload())} />
                </div>
                <FileDocuments
                  address={ma.postcode && !ma.address.toUpperCase().includes(ma.postcode.toUpperCase()) ? `${ma.address}, ${ma.postcode}` : ma.address}
                  propertyId={ma.rexPropertyId ?? null}
                  from={{ kind: "appraisal", id: ma.id }}
                  sides={["landlord", "home"]}
                />
              </section>
            )}

            {nlTab === "file" && (
              <div id="property-file" className="scroll-mt-6 nl-appr-file">
                <PropertyFile
                  propertyId={ma.rexPropertyId}
                  address={ma.address}
                  screen="the market appraisal"
                  onLink={async (rexPropertyId) => {
                    await fetch("/api/appraisals", {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ id: ma.id, rexPropertyId }),
                    }).catch(() => null);
                    reload();
                  }}
                />
              </div>
            )}

            {nlTab === "presentation" && (
              <ul className="nl-appr-decks">
                {decks === undefined ? (
                  <li><span className="nl-meta">Reading the decks…</span></li>
                ) : decks === null ? (
                  <li><span className="nl-meta">We couldn&apos;t read the decks just now. Refresh in a minute.</span></li>
                ) : (
                  <>
                    <li className={pre ? "" : "is-muted"}>
                      <span className={`nl-appr-deck-ic${pre ? " ok" : ""}`}><Ico name="mail" size={14} /></span>
                      <span className="nl-appr-deck-main">
                        <span className="nl-strong">Pre-appraisal deck</span>
                        <span className="nl-meta">
                          {pre
                            ? `Made ${day(pre.createdAt)} · ${ma.preSend?.state === "sent" ? `sent${ma.preSend.at ? ` ${day(ma.preSend.at)}` : ""}` : ma.preSend?.state === "queued" ? "waiting to go" : "not sent"} · ${opened(pre.opens)}`
                            : "Made from the file once the visit is booked"}
                        </span>
                      </span>
                      <span className="nl-appr-deck-acts">
                        {pre && !past && !ma.cancelledAt && ma.preSend?.state !== "sent" && (
                          <WelcomeVideoRecorder compact token={pre.token} address={ma.address} className="nl-btn nl-btn--secondary nl-btn--sm" />
                        )}
                        {pre && (
                          <a href={pre.url} target="_blank" rel="noreferrer" className="nl-btn nl-btn--quiet nl-btn--sm">
                            View <Ico name="arrow" size={14} />
                          </a>
                        )}
                      </span>
                    </li>
                    <li className={deck ? "" : "is-muted"}>
                      <span className={`nl-appr-deck-ic${deck ? " ok" : ""}`}><Ico name="image" size={14} /></span>
                      <span className="nl-appr-deck-main">
                        <span className="nl-strong">Appraisal presentation</span>
                        <span className="nl-meta">{deck ? `The deck you take on the day · built ${day(deck.createdAt)}` : past ? "Not built, and the visit has been" : "Not built yet"}</span>
                      </span>
                      <span className="nl-appr-deck-acts">
                        {deck && (
                          <a href={deck.url} target="_blank" rel="noreferrer" className="nl-btn nl-btn--quiet nl-btn--sm">
                            View <Ico name="arrow" size={14} />
                          </a>
                        )}
                        {deck && (
                          <a href={`${deck.url.split("?")[0]}/print`} target="_blank" rel="noreferrer" className="nl-btn nl-btn--secondary nl-btn--sm">
                            <Ico name="download" size={14} /> Download PDF
                          </a>
                        )}
                        {!past && (
                          <Link href={`/market-appraisals/${ma.id}/build`} className="nl-btn nl-btn--secondary nl-btn--sm">
                            <Ico name="pen" size={14} /> {deck ? "Update" : "Build presentation"}
                          </Link>
                        )}
                      </span>
                    </li>
                    <li className={post ? "" : "is-muted"}>
                      <span className={`nl-appr-deck-ic${post ? " ok" : ""}`}><Ico name="coin" size={14} /></span>
                      <span className="nl-appr-deck-main">
                        <span className="nl-strong">Post-appraisal deck</span>
                        <span className="nl-meta">{post ? `Built ${day(post.createdAt)} · ${opened(post.opens)}` : ma.valuation == null ? "Built once the figure is in" : "Not built yet. The figure is in, so it can be built from Next up."}</span>
                      </span>
                      <span className="nl-appr-deck-acts">
                        {post && ma.valuation != null && (
                          <ChangeFees
                            appraisalId={ma.id}
                            className="nl-btn nl-btn--secondary nl-btn--sm"
                            onSaved={(next) => {
                              saved(next);
                              loadDecks();
                            }}
                          >
                            <Ico name="pen" size={14} /> Change the fees
                          </ChangeFees>
                        )}
                        {post && (
                          <a href={post.url} target="_blank" rel="noreferrer" className="nl-btn nl-btn--quiet nl-btn--sm">
                            View <Ico name="arrow" size={14} />
                          </a>
                        )}
                      </span>
                    </li>
                  </>
                )}
              </ul>
            )}
          </div>

          {wizard && <TakeOnWizard ma={ma} onClose={() => setWizard(false)} onSaved={reload} />}
        </div>
      </SaveScopeProvider>
    );
  }

  return (
    <SaveScopeProvider scope={saves}>
    <div className="space-y-5">
      {/* ── 0. back, and the quick links ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto flex min-w-0 items-center gap-3">
          <Link href="/market-appraisals" className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
            <span aria-hidden>←</span> Market Appraisals
          </Link>
          <SaveChip scope={saves} className="bg-white" />
        </div>
        {/* Only what still has a moment (James, 12 Oct 2026): the pre-appraisal
            deck, the builder and the welcome video go once the appraisal day
            has passed, and the welcome once the pre-appraisal has gone out. */}
        {pre && !past && (
          <a href={pre.url} target="_blank" rel="noreferrer" className={pill}>
            <DoodleIcon name="mail" size={13} className="text-accent-dark" /> Pre-appraisal deck
          </a>
        )}
        {/* Built: look at it, or change it (James, 17 Sep 2026 - new
            information comes in, or they are not happy with how it looks). */}
        {deck ? (
          <>
            <a href={deck.url} target="_blank" rel="noreferrer" className={pill}>
              <DoodleIcon name="magic-wand" size={13} className="text-accent-dark" /> View presentation
            </a>
            {/* A PDF to have with you at the appointment (Susan, 19 Sep 2026). */}
            <a href={`${deck.url.split("?")[0]}/print`} target="_blank" rel="noreferrer" className={pill}>
              <DoodleIcon name="upload" size={13} className="rotate-180 text-accent-dark" /> Download PDF
            </a>
            {!past && (
              <Link href={`/market-appraisals/${ma.id}/build`} className={pill} data-steve="appraisal.build">
                <DoodleIcon name="pencil" size={13} className="text-accent-dark" /> Update presentation
              </Link>
            )}
          </>
        ) : !past ? (
          <Link href={`/market-appraisals/${ma.id}/build`} className={pill} data-steve="appraisal.build">
            <DoodleIcon name="magic-wand" size={13} className="text-accent-dark" /> Build presentation
          </Link>
        ) : null}
        {post && (
          <a href={post.url} target="_blank" rel="noreferrer" className={pill}>
            <DoodleIcon name="file-contract" size={13} className="text-accent-dark" /> Post-appraisal deck
          </a>
        )}
        {/* Agreed a different fee or service after it went (James Crumpton,
            14 Oct 2026): change it on the deck they already have. */}
        {post && ma.valuation != null && (
          <ChangeFees
            appraisalId={ma.id}
            className={pill}
            onSaved={(next) => {
              saved(next);
              loadDecks();
            }}
          >
            <DoodleIcon name="pencil" size={13} className="text-accent-dark" /> Change the fees
          </ChangeFees>
        )}
        {/* The welcome video, recorded against the pre-appraisal deck. */}
        {pre && !past && !ma.cancelledAt && ma.preSend?.state !== "sent" && (
          <span className="[&>button]:!border-line/70 [&>button]:!bg-white [&>button]:!px-3.5 [&>button]:!py-2 [&>button]:!text-[12px] [&>button]:!font-semibold">
            <WelcomeVideoRecorder compact token={pre.token} address={ma.address} />
          </span>
        )}
        {/* Once the terms are signed, the listing is one press from the file
            whatever the stage (Howard, 1 Oct 2026: "do everything whilst
            still in here"). */}
        {termsSigned && <ListingAction ma={ma} className={pill} onLinked={saved} />}
        <button type="button" onClick={openPhotos} className={pill}>
          <DoodleIcon name="pack/photo" size={13} className="text-accent-dark" /> Photographs
        </button>
        <button type="button" onClick={openMessages} className={`${pill} relative`}>
          <DoodleIcon name="message" size={13} className="text-accent-dark" /> Messages
          {!readHere && (ma.unreadMessages ?? 0) > 0 && (
            <span className="ml-0.5 rounded-full bg-accent-dark px-1.5 py-px text-[10.5px] font-bold text-white">{ma.unreadMessages} new</span>
          )}
        </button>
        <button type="button" onClick={openDocs} className={pill}>
          <DoodleIcon name="upload" size={13} className="text-accent-dark" /> Documents
        </button>
        <button type="button" onClick={openFile} className={pill}>
          <DoodleIcon name="folder" size={13} className="text-accent-dark" /> Property file
        </button>
        <GuideButton id="appraisals" className={pill} />
      </div>

      {/* ── 1. the hero ─────────────────────────────────────────────────── */}
      {/* Blush all the way across (James, 11 Sep), the glance panel white on
          it. The house stands on the card's bottom edge and whatever the
          drawing has below its doorstep is clipped by the card. */}
      <header className="fade-up relative overflow-hidden rounded-[22px] border border-line/50 bg-accent-soft/60">
        <span aria-hidden className="pointer-events-none absolute -bottom-[340px] right-[330px] hidden h-[420px] w-[520px] rounded-[50%] bg-white/45 xl:block 2xl:right-[380px] 2xl:w-[600px]" />
        <div className="relative grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-7 xl:grid-cols-[minmax(0,1fr)_280px_300px] 2xl:grid-cols-[minmax(0,1fr)_380px_340px]">
          <div className="min-w-0 pb-1">
            <p className={eyebrow}>Market appraisal · stage {at + 1} of {spine.length}</p>
            <h1 className="hand mt-2 text-[30px] leading-[1.1] sm:text-[34px]">{ma.address}</h1>
            <p className="mt-1.5 text-[13px] text-muted">
              {ma.postcode}
              {ma.valuation ? ` · valued ${gbp(ma.valuation)} pcm` : ""}
            </p>
            {ma.stageWhy && <p className="mt-4 text-[13px] leading-relaxed">{ma.stageWhy}</p>}
            {/* The stage is read from the record; these are the two hand moves. */}
            {!ma.archivedAt && <AppraisalOutcome id={ma.id} stage={live} why={null} size="large" />}
            {/* Off the board without losing it, or a test file gone (23 Oct 2026). */}
            <AppraisalTidy
              id={ma.id}
              archivedAt={ma.archivedAt}
              archivedBy={ma.archivedBy}
              archivedWhy={ma.archivedWhy}
              onLost={async () => {
                await fetch("/api/appraisals", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ma.id, outcome: "lost" }) }).catch(() => null);
                window.location.reload();
              }}
            />
          </div>

          {/* The house, from xl up. */}
          <div className="relative hidden self-stretch xl:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/art/appraisal-house.webp"
              alt=""
              className="pointer-events-none absolute bottom-[-56px] left-1/2 w-[330px] max-w-none -translate-x-1/2 2xl:w-[420px] 2xl:bottom-[-70px]"
            />
          </div>

          {/* At a glance. */}
          <aside className="rounded-2xl border border-line/40 bg-white p-5">
            <p className="hand flex items-center gap-2 text-[15px]">
              <DoodleIcon name="magic-wand" size={15} className="text-accent-dark" />
              At a glance
            </p>
            {/* Three facts chosen by the stage - see components/appraisal/glance. */}
            <ul className="mt-4 space-y-3.5">
              {glanceFor(ma, live, decks === undefined ? undefined : { deck: Boolean(deck), post: post ? { opens: post.opens } : null }, file).map((g, i) => (
                <Glance key={i} icon={g.icon} title={g.title} sub={g.sub} />
              ))}
            </ul>
          </aside>
        </div>
      </header>

      {/* ── 2. the three cards ──────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* The landlord */}
        <section className={`fade-up flex flex-col ${card} p-5`}>
          <CardTitle icon="user">The landlord</CardTitle>
          {/* Changeable here, and back to REX (James, 12 Oct 2026): the same
              block as every other person in the OS (components/ContactBlock). */}
          <ContactBlock
            className="mt-3 pb-4"
            role="landlord"
            person={{ name: ma.landlord, email: ma.landlordEmail ?? null, phone: ma.landlordMobile ?? null }}
            personRef={ma.landlordRef ?? null}
            home={{ propertyAddress: [ma.address, ma.postcode && !ma.address.includes(ma.postcode) ? ma.postcode : null].filter(Boolean).join(", ") }}
            onSaved={() => reload()}
            onWhatsAppSent={
              ma.leadId
                ? async (message) => {
                    /* The appraisal came from a lead, and the lead keeps the log. No
                       Try again: a log that landed before the connection dropped
                       would go down twice. */
                    const settle = saves.reporter.begin("WhatsApp log");
                    let problem: string | null;
                    try {
                      const r = await fetch(`/api/leads/${encodeURIComponent(ma.leadId as string)}/touches`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ kind: "whatsapp", outcome: "sent", body: message }),
                      });
                      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
                      problem = j?.ok ? null : (j?.error ?? "That didn't save.");
                    } catch {
                      problem = "That didn't save - the connection dropped.";
                    }
                    settle(problem ? { ok: false, problem } : { ok: true });
                    return problem;
                  }
                : undefined
            }
          />
          {/* Another owner, or who we deal with instead (James, 20 Oct 2026):
              the same section as the let, the listing and the home's page,
              kept on the home once it has a REX property, else on the appraisal. */}
          <HomeLandlords
            className="mb-4"
            heading={null}
            homeKey={ma.rexPropertyId ?? `appraisal:${ma.id}`}
            address={[ma.address, ma.postcode && !ma.address.includes(ma.postcode) ? ma.postcode : null].filter(Boolean).join(", ")}
            main={[]}
            requireOne={false}
          />
          {/* Their ID, AML and bank details already held from their other
              homes (Jade Grewal, 14 Oct 2026). Nothing shown when there are none. */}
          <LandlordOnFile
            className="pb-4"
            email={ma.landlordEmail ?? null}
            name={ma.landlord}
            propertyAddress={[ma.address, ma.postcode].filter(Boolean).join(", ")}
            appraisalId={ma.id}
          />
          {/* Which REX property this is, captured at the booking stage — long
              before terms are signed, and by a person rather than by matching
              an address. See RexPropertyPicker for why that distinction matters. */}
          <div className="mt-auto border-t border-line/50 pt-3.5">
            <RexPropertyPicker appraisal={ma} onSaved={saved} />
          </div>
        </section>

        {/* The appointment */}
        <section className={`fade-up flex flex-col ${card} p-5`}>
          <CardTitle icon="calendar">The appointment</CardTitle>
          {when ? (
            <>
              <p className="mt-4 text-[14px]">{longDate(ma.appointmentAt!)}</p>
              <div className="mt-3 flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${past ? "text-white" : "border border-line/70 text-muted"}`}
                  style={past ? { background: SAGE_INK } : undefined}
                >
                  {past ? "✓" : "…"}
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">{past ? "Visit completed" : "Still to come"}</p>
                  <p className="text-[12px] text-muted">
                    {past ? "Been and gone" : "In the diary"}
                    {ma.agent ? ` · with ${ma.agent}` : ""}
                  </p>
                </div>
              </div>
              {past && (
                <p className="mt-3 text-[12px] leading-relaxed text-muted">
                  {missingFigure ? "No figure recorded yet - the post-appraisal deck waits on it." : "The figure is recorded, so the post-appraisal deck can go."}
                </p>
              )}
            </>
          ) : ma.cancelledAt ? (
            /* Cancelled (James, 15 Oct 2026): the file and everything on it
               stay; Rebook puts it back in the diary. */
            <div className="mt-4">
              <span className="inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-dark">Cancelled</span>
              {ma.cancelledWas && <p className="mt-2.5 text-[14px] text-muted line-through">{longDate(ma.cancelledWas)}</p>}
              <p className="mt-1.5 text-[12px] text-muted">
                Cancelled{ma.cancelledBy ? ` by ${ma.cancelledBy}` : ""} on{" "}
                {new Date(ma.cancelledAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}. Nothing is in the diary for it.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              No date on this appraisal. It was booked without one - worth chasing, because the
              pre-appraisal deck is scheduled from the appointment.
            </p>
          )}
          {/* Rearrange and Cancel, the same as from the diary (James, 15 Oct
              2026). A visit that has been is written up, not moved. */}
          {(ma.cancelledAt || (when && !past)) && (
            <div className="mt-4 flex flex-wrap gap-2">
              <AppraisalChange
                appraisalId={ma.id}
                appraisal={ma}
                buttonClass="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-white px-3.5 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-50"
                noteClass="w-full text-[11.5px] leading-snug text-accent-dark"
                onChanged={(next) => {
                  if (next) saved(next as MarketAppraisal);
                  else reload();
                }}
              />
            </div>
          )}
          {/* What the landlord has been sent: the confirmation until it has
              gone, then the latest thing sent, and the rest one press away.
              The video reminder box that sat under it is gone (James, 17 Sep
              2026): the reminder goes on its own two days out if there is no
              video, and nobody needs to send it to themselves. */}
          {when && <ConfirmLine appraisalId={ma.id} appointmentAt={ma.appointmentAt!} />}
        </section>

        {/* Next up: the one box that changes with the stage. */}
        <div className="fade-up">
          <NextUp
            ma={ma}
            decks={decks}
            onSaved={saved}
            onDecksChanged={() => {
              loadDecks();
              reload();
            }}
            onAttach={openFile}
          />
        </div>
      </div>

      {/* ── 3. where it's up to ─────────────────────────────────────────── */}
      <section className={`fade-up ${card} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle icon="target">
            Where it&apos;s up to
            <span className="mt-0.5 block text-[12px] font-normal text-muted">
              Track progress through the {spine.length} stages of a market appraisal.
            </span>
          </CardTitle>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent-dark">
            Stage {at + 1} of {spine.length}
          </span>
        </div>

        {/* ACROSS, not down (James, 28 Aug): a spine is a journey, and a
            journey reads left to right. It scrolls sideways rather than
            wrapping, so "Won" never sits underneath "Booked". */}
        <div className="-mx-2 mt-5 overflow-x-auto px-2 pb-1">
          <ol className="grid min-w-[760px]" style={{ gridTemplateColumns: `repeat(${spine.length}, minmax(0, 1fr))` }}>
            {spine.map((s, i) => {
              const done = i < at;
              const here = s.id === live;
              return (
                <li key={s.id} className="relative flex flex-col items-center px-1 text-center">
                  {i > 0 && (
                    <span
                      aria-hidden
                      className={`absolute left-[-50%] right-[50%] top-[13px] ${i <= at ? "h-0.5" : "h-0 border-t-2 border-dashed border-line/80"}`}
                      style={i <= at ? { background: SAGE_INK } : undefined}
                    />
                  )}
                  <span
                    className={`relative z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-semibold ${
                      done ? "text-white" : here ? "bg-accent-dark text-white" : "border-[1.5px] border-line/80 bg-white text-muted"
                    }`}
                    style={done ? { background: SAGE_INK } : undefined}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <p className={`mt-2.5 text-[12px] leading-tight ${here ? "font-semibold" : "text-muted"}`}>{s.label}</p>
                </li>
              );
            })}
          </ol>

          {/* The small ticks: have I sent this, done this, made this. Read
              from the record (lib/appraisal-stage), never typed. */}
          <ol className="mt-4 grid min-w-[760px] gap-2" style={{ gridTemplateColumns: `repeat(${spine.length}, minmax(0, 1fr))` }}>
            {spine.map((s, i) => {
              const here = s.id === live;
              const done = i < at;
              const ticks = (ma.ticks ?? []).filter((t) => t.stage === s.id);
              return (
                <li
                  key={s.id}
                  className={`rounded-2xl border p-3 ${here ? "border-accent/60 bg-accent-soft/40" : "border-line/50"}`}
                  style={done ? { background: SAGE_WASH, borderColor: "transparent" } : undefined}
                >
                  <p className={`text-[11.5px] ${here ? "font-semibold" : "text-muted"}`}>{s.label}</p>
                  {here && <p className="mt-1 text-[10.5px] leading-snug text-muted">{s.blurb}</p>}
                  {ticks.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5">
                      {ticks.map((t) => (
                        <li key={t.id} className="flex items-start gap-1.5 text-[10.5px] leading-snug" title={t.at ? new Date(t.at).toLocaleString("en-GB") : undefined}>
                          <span
                            className={`mt-[1px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[8px] ${t.done ? "text-white" : "border border-line/80 bg-white text-transparent"}`}
                            style={t.done ? { background: done ? SAGE_INK : "var(--accent-dark)" } : undefined}
                          >
                            ✓
                          </span>
                          <span className={t.done ? "text-ink" : "text-muted"}>
                            {t.label}
                            {t.detail ? (
                              <span className="text-muted"> · {t.detail}</span>
                            ) : t.done && t.at ? (
                              <span className="text-muted"> · {new Date(t.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-4 flex items-start gap-2 border-t border-line/50 pt-3 text-[11.5px] leading-relaxed text-muted">
          <DoodleIcon name="info" size={13} className="mt-[2px]" />
          <span>
            Once terms are signed this stops being an appraisal and becomes a{" "}
            <span className="font-semibold text-ink">listing</span>.
          </span>
        </p>
      </section>

      {/* What the landlord will be asked for, beyond the five (Susan, 19 Sep 2026). */}
      <RequiredDocs appraisalId={ma.id} address={ma.address} postcode={ma.postcode} propertyType={propertyType} />

      {wizard && <TakeOnWizard ma={ma} onClose={() => setWizard(false)} onSaved={reload} />}

      {showPhotos && (
        <div id="photos" className="fade-up scroll-mt-6">
          <PhotosPanel ma={ma} />
        </div>
      )}

      {showMessages && (
        <div id="messages" className="fade-up scroll-mt-6">
          <AppraisalMessages appraisalId={ma.id} landlord={ma.landlord} onRead={markRead} />
        </div>
      )}

      {/* ── the property file, when asked for ───────────────────────────── */}
      {/* Certificates the landlord hands over at the appraisal are filed NOW,
          against the address, and are on the REX property the day it is
          linked or instructed (James, 6 Sep). Opened from the quick link or
          the AML step rather than always on the page. */}
      {showDocs && (
        <section id="documents" className="fade-up scroll-mt-6 rounded-[22px] border border-line/50 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Documents</p>
            <button type="button" onClick={() => setShowDocs(false)} className="text-[12px] text-muted hover:text-ink">Hide</button>
          </div>
          <FileDocuments
            address={ma.postcode && !ma.address.toUpperCase().includes(ma.postcode.toUpperCase()) ? `${ma.address}, ${ma.postcode}` : ma.address}
            propertyId={ma.rexPropertyId ?? null}
            from={{ kind: "appraisal", id: ma.id }}
            sides={["landlord", "home"]}
          />
        </section>
      )}

      {showFile && (
        <div id="property-file" className="fade-up scroll-mt-6 [&>section]:rounded-[22px] [&>section]:border-line/50 [&>section]:bg-white [&>section]:p-5">
          <PropertyFile
            propertyId={ma.rexPropertyId}
            address={ma.address}
            screen="the market appraisal"
            onLink={async (rexPropertyId) => {
              await fetch("/api/appraisals", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: ma.id, rexPropertyId }),
              }).catch(() => null);
              reload();
            }}
          />
        </div>
      )}
    </div>
    </SaveScopeProvider>
  );
}

type NlTab = "overview" | "messages" | "photos" | "documents" | "file" | "presentation";

/* ── small pieces ─────────────────────────────────────────────────────── */

function CardTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h2 className="hand flex items-start gap-3 text-[17px] leading-tight">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name={icon} size={16} />
      </span>
      <span className="min-w-0 pt-1.5">{children}</span>
    </h2>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[60px_minmax(0,1fr)] items-baseline gap-3">
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Glance({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/50 bg-white text-accent-dark">
        <DoodleIcon name={icon} size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold leading-snug">{title}</span>
        {sub && <span className="block text-[12px] leading-snug text-muted">{sub}</span>}
      </span>
    </li>
  );
}
