"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import RexPropertyPicker from "@/components/RexPropertyPicker";
import PropertyFile from "@/components/PropertyFile";
import VideoChaseControl from "@/components/VideoChaseControl";
import AppraisalOutcome from "@/components/AppraisalOutcome";
import WelcomeVideoRecorder from "@/components/WelcomeVideoRecorder";
import NextUp, { SAGE_INK, SAGE_WASH, type SentDeck } from "@/components/appraisal/NextUp";
import {
  MA_STAGES,
  effectiveStage,
  needsValuation,
  type MarketAppraisal,
} from "@/lib/market-appraisal";

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

const longDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

interface FileRow {
  state: string;
  files: { key: string }[];
}

export default function AppraisalFile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  /* `undefined` means we have not looked yet and `null` means we looked and it
     is not there — the two must stay separate, or the page flashes "No such
     appraisal" at somebody who has just this second booked one. */
  const [booked, setBooked] = useState<MarketAppraisal | null | undefined>(undefined);
  const ma = booked ?? null;

  const reload = useCallback(() => {
    let gone = false;
    fetch(`/api/appraisals`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (gone) return;
        const list: MarketAppraisal[] = Array.isArray(j?.appraisals) ? j.appraisals : [];
        setBooked(list.find((m) => m.id === id) ?? null);
      })
      .catch(() => {
        if (!gone) setBooked(null);
      });
    return () => {
      gone = true;
    };
  }, [id]);
  useEffect(() => reload(), [reload]);

  /* The decks, read once here for the quick links and the Next up box. */
  const refId = ma ? (ma.leadId ?? ma.id) : null;
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
  useEffect(() => {
    if (!ma) return;
    let live = true;
    const key = ma.rexPropertyId ? `property=${encodeURIComponent(ma.rexPropertyId)}` : `address=${encodeURIComponent(ma.address)}`;
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
  }, [ma]);

  /* A save hands back the bare row; the ticks, the live stage and the
     "why" line only come with the list read, so re-read after every save. */
  const saved = useCallback(
    (next: MarketAppraisal) => {
      setBooked((prev) => (prev ? { ...prev, ...next } : next));
      reload();
    },
    [reload]
  );

  /* The property file panel, shown when asked for. */
  const [showFile, setShowFile] = useState(false);

  if (booked === undefined) {
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
  const openFile = () => {
    setShowFile(true);
    setTimeout(() => document.getElementById("property-file")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="space-y-5">
      {/* ── 0. back, and the quick links ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/market-appraisals" className="mr-auto inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
          <span aria-hidden>←</span> Market Appraisals
        </Link>
        {pre && (
          <a href={pre.url} target="_blank" rel="noreferrer" className={pill}>
            <DoodleIcon name="mail" size={13} className="text-accent-dark" /> Pre-appraisal deck
          </a>
        )}
        {deck ? (
          <a href={deck.url} target="_blank" rel="noreferrer" className={pill}>
            <DoodleIcon name="magic-wand" size={13} className="text-accent-dark" /> View presentation
          </a>
        ) : (
          <Link href={`/market-appraisals/${ma.id}/build`} className={pill}>
            <DoodleIcon name="magic-wand" size={13} className="text-accent-dark" /> Build presentation
          </Link>
        )}
        {post && (
          <a href={post.url} target="_blank" rel="noreferrer" className={pill}>
            <DoodleIcon name="file-contract" size={13} className="text-accent-dark" /> Post-appraisal deck
          </a>
        )}
        {/* The welcome video, recorded against the pre-appraisal deck. */}
        {pre && (
          <span className="[&>button]:!border-line/70 [&>button]:!bg-white [&>button]:!px-3.5 [&>button]:!py-2 [&>button]:!text-[12px] [&>button]:!font-semibold">
            <WelcomeVideoRecorder compact token={pre.token} address={ma.address} />
          </span>
        )}
        <button type="button" onClick={openFile} className={pill}>
          <DoodleIcon name="folder" size={13} className="text-accent-dark" /> Property file
        </button>
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
            <AppraisalOutcome id={ma.id} stage={live} why={null} size="large" />
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
            <ul className="mt-4 space-y-3.5">
              <Glance
                icon="calendar"
                title={!when ? "No date on this appraisal" : past ? "Visit completed" : "Visit still to come"}
                sub={when ? longDate(ma.appointmentAt!) : "Booked without one - worth chasing"}
              />
              <Glance
                icon="doc"
                title={ma.valuation != null ? `${gbp(ma.valuation)} pcm recorded` : "No figure recorded yet"}
                sub={
                  ma.valuation != null
                    ? `Valued${ma.valuedAt ? ` ${new Date(ma.valuedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : ""}${ma.valuedBy ? ` by ${ma.valuedBy}` : ""}`
                    : past
                      ? "Add a figure to move to the next stage"
                      : "Comes from the visit"
                }
              />
              <Glance
                icon="folder"
                title={
                  file === undefined
                    ? "Reading the property file…"
                    : file === null
                      ? "Property file unavailable"
                      : file.held === 0
                        ? "No property file"
                        : `${file.held} certificate${file.held === 1 ? "" : "s"} on file`
                }
                sub={
                  file === undefined
                    ? ""
                    : file === null
                      ? "The file could not be read"
                      : file.outstanding > 0
                        ? `${file.outstanding} still outstanding`
                        : file.held === 0
                          ? "Attach any relevant documents"
                          : "Everything required is in date"
                }
              />
            </ul>
          </aside>
        </div>
      </header>

      {/* ── 2. the three cards ──────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* The landlord */}
        <section className={`fade-up flex flex-col ${card} p-5`}>
          <CardTitle icon="user">The landlord</CardTitle>
          <dl className="mt-4 space-y-2.5 text-[13px]">
            <Row k="Name">{ma.landlord}</Row>
            <Row k="Email">
              {ma.landlordEmail ? (
                <a href={`mailto:${ma.landlordEmail}`} className="block truncate hover:underline">
                  {ma.landlordEmail}
                </a>
              ) : (
                <span className="text-muted">Not recorded</span>
              )}
            </Row>
            <Row k="Mobile">
              {ma.landlordMobile ? (
                <a href={`tel:${ma.landlordMobile}`} className="hover:underline">
                  {ma.landlordMobile}
                </a>
              ) : (
                <span className="text-muted">Not recorded</span>
              )}
            </Row>
          </dl>
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
          ) : (
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              No date on this appraisal. It was booked without one - worth chasing, because the
              pre-appraisal deck is scheduled from the appointment.
            </p>
          )}
          {/* The video nudge, while there is still time for one. */}
          {(live === "booked" || live === "pre_appraisal") && (
            <div className="mt-auto border-t border-line/50 pt-3.5">
              <VideoChaseControl appraisalId={ma.id} />
            </div>
          )}
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

      {/* ── the property file, when asked for ───────────────────────────── */}
      {/* Certificates the landlord hands over at the appraisal are filed NOW,
          against the address, and are on the REX property the day it is
          linked or instructed (James, 6 Sep). Opened from the quick link or
          the AML step rather than always on the page. */}
      {showFile && (
        <div id="property-file" className="fade-up scroll-mt-6 [&>section]:rounded-[22px] [&>section]:border-line/50 [&>section]:bg-white [&>section]:p-5">
          <PropertyFile propertyId={ma.rexPropertyId} address={ma.address} screen="the market appraisal" />
        </div>
      )}
    </div>
  );
}

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
