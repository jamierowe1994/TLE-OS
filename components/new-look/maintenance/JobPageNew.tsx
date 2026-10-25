"use client";

import Link from "next/link";
import SaveChip, { SaveScopeProvider, type SaveScope } from "@/components/SaveChip";
import PhotoLightbox from "@/components/PhotoLightbox";
import { Ico } from "@/components/new-look/Parts";
import { Failed } from "@/components/new-look/backoffice/Bits";
import { StagePanel, StageTracker } from "@/components/maintenance/JobStages";
import { categoriesOf } from "@/lib/works-catalogue";
import type { StepId } from "@/lib/works-steps";
import type { Contractor, JobTenant, Move, WorksEvent, WorksOrder } from "@/lib/works-orders";
import type { ManagedProperty } from "@/lib/portfolio-types";
import { day, stamp, statusLabel } from "@/components/maintenance/works-ui";
import { titleCase, type Pop, type TabId, type TileGroup } from "@/components/maintenance/job-page";
import { JobGroups, JobRecord } from "@/components/new-look/maintenance/JobRecord";
import { JobSheets } from "@/components/new-look/maintenance/JobSheets";

/**
 * The job page in the new look (lib/new-look "job", James, 25 Oct 2026: "it
 * pulled through this old view of the old houses... can you please redesign
 * this with the new style in mind").
 *
 * Drawing only. Every read, every piece of state and every handler is the
 * page's own (app/(os)/maintenance/[id]/page.tsx), handed down as they are,
 * so a press here sends the same Move to the same API as the page as it is.
 *
 * Calm and type-led: no illustration, no blush hero, no dots. The job's name
 * and its status as plain words, four facts on hairlines, the stage it's on
 * as a card with its choices as cards, one stepper, and the record in text
 * tabs. The actions sit down the right in their groups as hairline rows, and
 * every form opens in the floating boxes (components/new-look/FloatSheet).
 * Styled from app/new-look/job.css, prefix nl-jb-.
 */

export type JobView = {
  o: WorksOrder;
  events: WorksEvent[];
  canPayrun: boolean;
  saves: SaveScope;
  home: ManagedProperty | null;
  shots: string[];
  /** The book read failed, so the home's page and photos can't be found. */
  bookFailed: string | null;
  contractor: Contractor | null;
  trades: { list: Contractor[]; canCorporate: boolean } | null;
  busy: boolean;
  err: string | null;
  popUp: Pop | null;
  openPop: (p: Pop) => void;
  closePop: () => void;
  picked: StepId | null;
  setPicked: (s: StepId | null) => void;
  here: StepId | null;
  stageShown: StepId | null;
  /** Where the shown stage sits on the stepper (-1 when it isn't on it), and how many there are. */
  shownAt: number;
  stageCount: number;
  shownMeta: { label: string; blurb?: string } | null;
  tab: TabId;
  setTab: (t: TabId) => void;
  groups: TileGroup[];
  nextTile: string | undefined;
  nextGroup: string | null;
  isOpen: (id: string) => boolean;
  toggleGroup: (id: string) => void;
  move: (m: Move, label?: string) => Promise<boolean>;
  popMove: (m: Move, label?: string) => Promise<boolean>;
  uploadFile: (file: File, kind?: "invoice" | "quote") => Promise<boolean>;
  certificate: (fd: FormData) => Promise<string | null>;
  invoiceLandlord: () => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  lightbox: { photos: string[]; start: number } | null;
  setLightbox: (l: { photos: string[]; start: number } | null) => void;
  tenants: JobTenant[];
  address: string;
  open: boolean;
  late: boolean;
  urgency: string | null;
  arrangedBy: string;
  dueIn: string | null;
  canResend: boolean;
  unsent: boolean;
  resendOrder: () => void;
  pickContractor: () => void;
};

/** While the job is being read. */
export function JobLoadingNew() {
  return (
    <div data-look="new" className="nl-page nl-jb">
      <p className="nl-jb-reading" role="status"><span className="nl-bo-spin" aria-hidden />Opening the job…</p>
    </div>
  );
}

/** The job could not be read: said plainly, with a way back and a way to ask again. */
export function JobFailedNew({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div data-look="new" className="nl-page nl-jb">
      <div className="nl-jb-top">
        <nav className="nl-crumbs" aria-label="Where you are">
          <Link href="/maintenance" className="nl-crumb"><Ico name="back" size={14} /> Maintenance</Link>
        </nav>
      </div>
      <h1 className="nl-jb-title">The Job Could Not Be Opened</h1>
      <div className="mt-6 max-w-[640px]"><Failed onRetry={onRetry}>{error}</Failed></div>
    </div>
  );
}

export default function JobPageNew(v: JobView) {
  const { o, saves, home, shots, bookFailed, here, picked, stageShown, shownAt, stageCount, shownMeta, popUp, err, busy } = v;
  const cancelled = o.status === "cancelled";
  const homeHref = home ? `/portfolio/${encodeURIComponent(String(home.listingId))}` : null;

  /* Status as plain words: what it is, where it is, how urgent, and late in clay. */
  const words: { text: string; hot?: boolean }[] = [
    { text: o.kind === "repair" ? "Repair" : "Planned" },
    { text: statusLabel(o) },
    ...(v.urgency && v.open ? [{ text: v.urgency, hot: o.urgency === "emergency" }] : []),
    ...(v.late ? [{ text: "Overdue", hot: true }] : []),
    ...(o.rehearsal ? [{ text: "Walkthrough" }] : []),
  ].filter((w) => w.text);

  const facts: { k: string; v: string; sub?: string | null; hot?: boolean; quiet?: boolean }[] = [
    { k: o.kind === "repair" ? "Attend By" : "Due By", v: o.dueAt ? (o.kind === "repair" ? stamp(o.dueAt) : day(o.dueAt)) : "Not set", sub: v.dueIn, hot: v.late, quiet: !o.dueAt },
    { k: "Contractor", v: o.contractorName || (o.quoteAsks.length ? `${o.quoteAsks.length} asked to quote` : "Not picked yet"), quiet: !o.contractorName },
    { k: "Booked", v: o.scheduledAt ? stamp(o.scheduledAt) : "Not booked yet", quiet: !o.scheduledAt },
    { k: "Arranged By", v: v.arrangedBy, quiet: !o.arranging },
  ];

  return (
    <SaveScopeProvider scope={saves}>
      <div data-look="new" className="nl-page nl-jb">
        {/* ── back, the save chip, the photos and the home ─────────────────── */}
        <div className="nl-jb-top">
          <nav className="nl-crumbs" aria-label="Where you are">
            <Link href={`/maintenance${o.kind === "planned" ? "?section=planned" : ""}`} className="nl-crumb"><Ico name="back" size={14} /> Maintenance</Link>
            <span className="nl-jb-slash" aria-hidden>/</span>
            <span className="nl-jb-ref">Job #{o.ref}</span>
          </nav>
          <SaveChip scope={saves} />
          <div className="nl-jb-top-r">
            {shots.length > 0 && (
              <button type="button" className="nl-btn nl-btn--sm nl-jb-quiet" onClick={() => v.setLightbox({ photos: shots, start: 0 })}>
                <Ico name="image" size={14} /> {shots.length} {shots.length === 1 ? "Photo" : "Photos"}
              </button>
            )}
            {homeHref && <Link href={homeHref} className="nl-btn nl-btn--sm nl-jb-quiet">The Property&apos;s Page <Ico name="arrow" size={14} /></Link>}
            {!home && bookFailed && <span className="nl-jb-said is-err">The home&apos;s page could not be read just now.</span>}
          </div>
        </div>

        <div className="nl-jb-grid">
          <div className="nl-jb-main nl-rise">
            {/* ── the job: words, title, address, facts ───────────────────── */}
            <header className="nl-jb-head">
              <p className="nl-jb-words">
                {words.map((w, i) => (
                  <span key={`${i}-${w.text}`} className={w.hot ? "is-hot" : ""}>
                    {i > 0 && <span className="nl-jb-sep" aria-hidden> · </span>}
                    {w.text}
                  </span>
                ))}
              </p>
              <h1 className="nl-jb-title">{o.title || o.category || "A job"}</h1>
              <p className="nl-jb-addr">
                {homeHref ? <Link href={homeHref} className="nl-jb-addr-link">{v.address}</Link> : <span>{v.address}</span>}
                {o.category && <span className="nl-jb-cat">{categoriesOf(o.category).join(", ")}</span>}
              </p>
              <dl className="nl-jb-facts">
                {facts.map((f) => (
                  <div key={f.k} className="nl-jb-fact">
                    <dt>{f.k}</dt>
                    <dd className={f.hot ? "is-hot" : f.quiet ? "is-quiet" : ""}>{f.v}</dd>
                    {f.sub && <dd className="nl-jb-fact-sub">{f.sub}</dd>}
                  </div>
                ))}
              </dl>
            </header>

            {/* ── the stage it's on, its question and its choices ─────────── */}
            <section className="nl-jb-stage" aria-labelledby="nl-jb-stage-h">
              <div className="nl-jb-stage-top">
                <span>{cancelled ? "Cancelled" : picked && picked !== here ? "Another stage" : "Current stage"}</span>
                {shownAt >= 0 && !cancelled && <span className="nl-jb-stepof">Step {shownAt + 1} of {stageCount}</span>}
              </div>
              <h2 id="nl-jb-stage-h" className="nl-jb-stage-h">{cancelled ? "The Job Is Cancelled" : shownMeta ? titleCase(shownMeta.label) : "Nothing Left to Do"}</h2>
              {cancelled ? (
                <p className="nl-jb-stage-q">{o.cancelledReason || "No reason given."} Reopen it from Edit Details.</p>
              ) : shownMeta?.blurb ? (
                <p className="nl-jb-stage-q">{shownMeta.blurb}</p>
              ) : null}
              {stageShown && !cancelled && (
                /* Today's stage forms, repainted (nl-jb-old): the choices as cards, coral for the main button. */
                <div className="nl-jb-stage-body nl-jb-old">
                  <StagePanel
                    bare
                    o={o}
                    stage={stageShown}
                    move={(m) => v.move(m)}
                    busy={busy}
                    err={popUp ? null : err}
                    canCorporate={v.trades?.canCorporate ?? false}
                    canPayrun={v.canPayrun}
                    onInvoiceLandlord={v.invoiceLandlord}
                    onCertificate={v.certificate}
                    onForm={(form) => v.openPop({ kind: "form", form })}
                  />
                </div>
              )}
              {picked && picked !== here && (
                <button type="button" className="nl-link nl-jb-stage-back" onClick={() => v.setPicked(null)}>
                  <Ico name="back" size={13} /> Back to the step it&apos;s on
                </button>
              )}
            </section>

            {/* ── the stepper ─────────────────────────────────────────────── */}
            <section className="nl-jb-sec" aria-labelledby="nl-jb-prog-h">
              <div className="nl-jb-sh">
                <h2 id="nl-jb-prog-h">Job Progress</h2>
                <span>Press a stage to open it</span>
              </div>
              <StageTracker look="new" o={o} picked={stageShown} onPick={(s) => v.setPicked(s === here ? null : s)} />
            </section>

            {/* ── updates, details, people and files ──────────────────────── */}
            <JobRecord v={v} />
          </div>

          {/* ── the actions, in their groups ──────────────────────────────── */}
          <aside className="nl-jb-side" aria-label="What you can do on this job">
            <JobGroups v={v} />
            <input ref={v.fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={v.onFile} />
            {err && !popUp && <p className="nl-jb-said is-err" role="alert">{err}</p>}
          </aside>
        </div>
      </div>

      <JobSheets v={v} />
      {v.lightbox && <PhotoLightbox photos={v.lightbox.photos} start={v.lightbox.start} name={o.title} onClose={() => v.setLightbox(null)} />}
    </SaveScopeProvider>
  );
}
