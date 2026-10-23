"use client";

import Link from "next/link";
import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import BentoDash from "@/components/BentoDash";
import PageHeader from "@/components/PageHeader";
import {
  FINANCE_DEFAULT_LAYOUT, FINANCE_TRAY_GROUPS, FINANCE_WIDGETS,
} from "@/components/widgets-finance";
import { useNewLook } from "@/lib/use-new-look";
import { Mast, Ico } from "@/components/new-look/Parts";
import { useForecast } from "@/components/widgets-forecast";
import { Stat, Bars, Card, Failed, Loading } from "@/components/new-look/backoffice/Bits";

/**
 * The money page, as a board the agent owns: the same bento machine as the
 * dashboard, pointed at fees, take-home, the platform and the year ahead.
 * Customise rides the search row like the home screen, so the two feel like
 * one product. Everything on the board is live at the rates an owner sets.
 */
export default function Finances() {
  const [customising, setCustomising] = useState(false);
  const look = useNewLook("finances");

  /* ── THE NEW LOOK (lib/new-look "finances", 23 Oct 2026) ──────────────────
     The design's Finance on the same live forecast the board reads: three
     figures, the fees month by month, this month's make-up. The board itself
     stays underneath, customisable as before, so no tile is lost. */
  if (look === null) {
    return <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />Opening Finances…</p>;
  }
  if (look) {
    return (
      <div data-look="new" className="nl-page nl-rise nl-bo">
        <Mast
          title="Finances"
          blurb="What the book earns this month, what comes to you, and where next month lands. Live off the book at the rates an owner sets."
          actions={
            <>
              <Link href="/finances/statement" className="nl-btn nl-btn--secondary"><Ico name="arrow" /> Statement</Link>
              <button type="button" className={`nl-btn ${customising ? "nl-btn--sage" : "nl-btn--quiet"}`} aria-pressed={customising} onClick={() => setCustomising((c) => !c)}>
                {customising ? "Done" : <><Ico name="grid" /> Customise the board</>}
              </button>
            </>
          }
        />
        <FinanceSummary />
        <div className="nl-bo-boardhead">
          <h2 className="nl-bo-card-title">Your Board</h2>
          <p className="nl-meta">Every finance tile, laid out your way. Press Customise the board to add, move or take one off.</p>
        </div>
        <div className="nl-bo-legacy nl-bo-board">
          <BentoDash
            registry={FINANCE_WIDGETS}
            defaultLayout={FINANCE_DEFAULT_LAYOUT}
            trayGroups={FINANCE_TRAY_GROUPS}
            storeKey="tle-finance-layout-v2"
            control={{ on: customising, set: setCustomising }}
          />
        </div>
      </div>
    );
  }
  return (
    <>
      <PageHeader
        title="Finances"
        blurb="Your money, as a second dashboard: what the book earns this month, what comes to you, and where next month lands. Customise it like the home screen."
        /* Her own desk, the "Progress looks good on you" mug: the one scene
           in the set that is about the person's own numbers rather than a
           property. Not used anywhere else in the OS (James, 11 Sep 2026:
           "it shouldn't be an image that we've already used"). */
        illustration="/brand/art/agent-desk.png"
        /* Measured at 390px on 14 Sep 2026: the artwork landed on the blurb, 58px across it.
           The masthead's phone reserve is one measured guess and it does not
           hold here, so on a phone the drawing goes and the words keep the
           width. Nine other pages were checked and keep theirs. */
        hideArtOnPhone
        illustrationHeight={330}
        illustrationAspect={1.2604}
        /* The desk front runs into the line, so she sits in the page rather
           than on the rule - the same trick as the armchair on the dashboard. */
        seat={0.93}
        illustrationCrop
        lineBreak="none"
        illustrationNudge={-34}
        actions={
          <div className="flex items-center gap-2">
          {/* The agents' call, 19 Oct 2026: a statement for any period, when they want it. */}
          <Link
            href="/finances/statement"
            className="flex items-center gap-1.5 rounded-full border border-line/80 bg-page px-4 py-2 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink"
          >
            <DoodleIcon name="file-contract" size={13} />Statement
          </Link>
          <button
            type="button"
            onClick={() => setCustomising((c) => !c)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium transition-colors ${
              customising
                ? "bg-accent-dark font-semibold text-page"
                : "border border-line/80 bg-page text-muted hover:border-ink hover:text-ink"
            }`}
          >
            {customising ? "Done" : (
              /* An icon from our own set, not an emoji (Rig run 4, P-087). */
              <span className="inline-flex items-center gap-1.5"><DoodleIcon name="magic-wand" size={13} />Customise</span>
            )}
          </button>
          </div>
        }
      />

      <BentoDash
        registry={FINANCE_WIDGETS}
        defaultLayout={FINANCE_DEFAULT_LAYOUT}
        trayGroups={FINANCE_TRAY_GROUPS}
        /* v2: the board was redrawn on 11 Sep 2026, so everybody opens on the
           new default once; a board saved under v1 is left where it was. */
        storeKey="tle-finance-layout-v2"
        control={{ on: customising, set: setCustomising }}
      />
    </>
  );
}

/* ── The new look's summary ─────────────────────────────────────────────── */

const gbp = (pence: number | null | undefined) => (pence == null ? "-" : `£${Math.round(pence / 100).toLocaleString("en-GB")}`);
/** Pence as £k to one place: 4823000 is "48.2". */
const kShort = (pence: number) => (pence / 100000).toFixed(1).replace(/\.0$/, "");
/* Month names come off the clock, never typed in, so they roll over by themselves. */
const monthName = (offset = 0) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).toLocaleDateString("en-GB", { month: "long" });
};

function FinanceSummary() {
  const { data, loading, error, reload } = useForecast();
  const past = data?.past ?? [];
  const m = past[past.length - 1];
  const prev = past[past.length - 2];
  const six = past.slice(-6);
  const rates = !!data?.basisSet;
  const pct = m?.totalPence != null && prev?.totalPence ? Math.round(((m.totalPence - prev.totalPence) / prev.totalPence) * 100) : null;
  const waiting = "waiting on the rates we charge";
  const val = (v: string) => (error ? "-" : loading ? null : v);

  const paid = !data ? null : data.whole
    ? { label: "Paid to partners", value: "-", note: "worked per partner: view as a partner to see theirs" }
    : !rates ? { label: `Paid to you · ${monthName()}`, value: "-", note: waiting }
    : !data.mine.package ? { label: `Paid to you · ${monthName()}`, value: "-", note: "no package on the Hub for you" }
    : data.mine.sharePct == null ? { label: `Paid to you · ${monthName()}`, value: "-", note: `waiting on the ${data.mine.package} share` }
    : { label: `Paid to you · ${monthName()}`, value: gbp(data.paidThisMonthPence), note: `${data.mine.sharePct}% of ${gbp(m?.totalPence)}${data.mine.licencePence ? `, less the ${gbp(data.mine.licencePence)} licence` : ""}` };

  return (
    <>
      {error && <Failed onRetry={reload}>{error}</Failed>}
      <div className="nl-bo-stats is-3">
        <Stat
          label={`Fees · ${monthName()}`}
          value={val(rates ? gbp(m?.totalPence) : "-")}
          trend={rates && six.length > 1 ? six.map((x) => (x.totalPence ?? 0) / 100) : null}
          delta={rates && pct != null ? `${pct > 0 ? "+" : ""}${pct}%` : undefined}
          deltaTone={pct == null || pct === 0 ? "quiet" : pct > 0 ? "good" : "bad"}
          note={!data ? undefined : !rates ? waiting : pct != null ? `vs ${monthName(-1)}` : `${data.whole ? "the whole business" : "your book"}, net of VAT`}
        />
        <Stat label={paid?.label ?? `Paid to you · ${monthName()}`} value={val(paid?.value ?? "-")} note={paid?.note} />
        <Stat
          label={`Forecast · ${monthName(1)}`}
          value={val(rates ? gbp(data?.nextMonthPence) : "-")}
          delta={rates && m?.totalPence != null && data?.nextMonthPence != null ? `${data.nextMonthPence >= m.totalPence ? "up" : "down"} ${gbp(Math.abs(data.nextMonthPence - m.totalPence))}` : undefined}
          deltaTone={rates && m?.totalPence != null && data?.nextMonthPence != null ? (data.nextMonthPence >= m.totalPence ? "good" : "bad") : "quiet"}
          note={!data ? undefined : !rates ? waiting : "on this month"}
        />
      </div>

      <div className="nl-bo-g2">
        {/* Before an owner sets the rates there are no fees to draw, so the card shows
            what drives them instead: the rent roll month by month, live off the book. */}
        <Card title={rates || !data ? "Fees by Month (£k)" : "Rent Roll by Month (£k)"} aside={data ? <span className="nl-meta">{data.whole ? "The whole business" : "Your book"}</span> : null}>
          {loading ? (
            <Loading>Reading the book…</Loading>
          ) : error || !data ? (
            <p className="nl-bo-err">{error ?? "No answer from the book."}</p>
          ) : six.length === 0 ? (
            <p className="nl-meta">Nothing on the book to chart yet.</p>
          ) : (
            <>
              <Bars
                items={six.map((x, i) => {
                  const v = rates ? x.totalPence : x.feeableRentPence;
                  return { key: x.month, label: x.label, value: Math.max(0, v ?? 0), shown: v == null ? "-" : kShort(v), now: i === six.length - 1 };
                })}
              />
              {!rates && <p className="nl-meta mt-3">The fees come alive once an owner sets the rates we charge on The year ahead, on the board below.</p>}
            </>
          )}
        </Card>
        <Card title={`This Month`}>
          {loading ? (
            <Loading>Reading the book…</Loading>
          ) : error || !data || !m ? (
            <p className="nl-bo-err">{error ?? "No answer from the book."}</p>
          ) : (
            <ul className="nl-bo-list is-first">
              <li><span className="min-w-0 flex-1">Management fees</span><span className="nl-bo-money">{rates ? gbp(m.managementFeePence) : "-"}</span></li>
              <li><span className="min-w-0 flex-1">Set-up fees · {m.newLets} new let{m.newLets === 1 ? "" : "s"}</span><span className="nl-bo-money">{rates ? gbp(m.setupFeePence) : "-"}</span></li>
              <li><span className="min-w-0 flex-1">Rent roll · {m.managed} on a monthly fee</span><span className="nl-bo-money">{gbp(m.feeableRentPence)}</span></li>
              <li><span className="min-w-0 flex-1">{monthName(-1)} in fees</span><span className="nl-bo-money is-quiet">{rates ? gbp(prev?.totalPence) : "-"}</span></li>
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
