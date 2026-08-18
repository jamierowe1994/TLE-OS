"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import PropertyPhoto from "@/components/PropertyPhoto";
import ApplicationDrawer, { type AppActivity } from "@/components/ApplicationDrawer";
import { ColumnCustomiser, DataTable, useColumns, type ColumnDef } from "@/components/TableColumns";
import { FlowTag, Pill } from "@/components/Wire";

/**
 * Applications: the pre-tenancy pipeline, lifted from the TLE portal so the
 * two products speak the same language on merge day.
 *
 * The eight stages and the nine checklist items are the PORTAL's, verbatim —
 * they came out of Kirstie's real process. Propoly only tracks five statuses;
 * the other three (PLC, Deposit, Move day) are portal-side stages someone
 * moves a deal into by hand, which is why this overlay has to own them.
 */

const STAGES = [
  { key: "deal_started", label: "Deal started", blurb: "Terms agreed — rent, dates and tenant details being set up." },
  { key: "holding_fee", label: "Holding fee", blurb: "Collecting the fee that takes the property off the market." },
  { key: "referencing", label: "Referencing", blurb: "Credit, employer and previous-landlord checks." },
  { key: "plc", label: "PLC", blurb: "Pre-let compliance — Right to Rent, gas/EICR/EPC and licensing." },
  { key: "deposit", label: "Deposit", blurb: "Collecting the deposit and registering it with the scheme." },
  { key: "tenancy_agreement", label: "Tenancy agreement", blurb: "Drawn up with the agreed clauses and signed by all parties." },
  { key: "rent_payment", label: "Rent payment", blurb: "First month's rent collected, standing order set up." },
  { key: "move_day", label: "Move day", blurb: "Keys, inventory and check-in." },
];

/** Kirstie's spreadsheet, one tick each — the portal's CHECKLIST_ITEMS. */
const CHECKLIST = [
  "Holding fee received",
  "References passed",
  "Right to Rent verified",
  "Tenancy agreement sent",
  "Agreement signed by all parties",
  "Deposit registered",
  "Move-in monies received",
  "Standing order set up",
  "Keys & inventory arranged",
];

type App = {
  id: string;
  tenant: string;
  property: string;
  locality: string;
  image: string | null;
  rent: string;
  moveIn: string;
  stageKey: string;
  ticked: number;
  agent: string;
  flag?: string;
  /** The running account of the deal. Sample until the back office is joined. */
  activity?: AppActivity[];
};

const APPS: App[] = [
  {
    id: "a1", tenant: "Marcus Bell", property: "7 Station Approach", locality: "Luton LU1",
    image: null, rent: "£1,150 pcm", moveIn: "1 Sep 2026", stageKey: "holding_fee",
    ticked: 1, agent: "Kirstie",
    activity: [
      { when: "3 days ago", what: "Offer accepted by the landlord at £1,150.", by: "Kirstie" },
      { when: "3 days ago", what: "Holding fee request sent.", by: "System" },
      { when: "yesterday", what: "Tenant says he'll pay Friday when he's paid. Told him the property stays live until it lands.", by: "Kirstie", note: true },
    ],
  },
  {
    id: "a2", tenant: "Sophie Turner", property: "Flat 2, Mercer Street", locality: "Manchester M4",
    image: null, rent: "£995 pcm", moveIn: "12 Sep 2026", stageKey: "referencing",
    ticked: 2, agent: "Kirstie", flag: "Stalled 6 days",
    activity: [
      { when: "12 days ago", what: "Holding fee received.", by: "System" },
      { when: "9 days ago", what: "Referencing started with Goodlord.", by: "Kirstie" },
      { when: "6 days ago", what: "Employer reference outstanding — chased the provider.", by: "Kirstie", note: true },
      { when: "2 days ago", what: "Chased again. Provider says the employer hasn't responded. Sophie is going to call them herself.", by: "Kirstie", note: true },
    ],
  },
  {
    id: "a3", tenant: "Priya Shah", property: "12 Elm Gardens", locality: "Didsbury M20",
    image: null, rent: "£1,750 pcm", moveIn: "1 Oct 2026", stageKey: "plc",
    ticked: 3, agent: "Michael",
    activity: [
      { when: "8 days ago", what: "References passed.", by: "System" },
      { when: "5 days ago", what: "Right to Rent verified in branch.", by: "Michael" },
      { when: "2 days ago", what: "Gas certificate expires 14 Mar — fine. EICR on file. Waiting on the EPC from the landlord.", by: "Michael", note: true },
    ],
  },
  {
    id: "a4", tenant: "Liam Doyle", property: "88 Kelvin Way", locality: "Glasgow G12",
    image: null, rent: "£1,300 pcm", moveIn: "20 Aug 2026", stageKey: "tenancy_agreement",
    ticked: 5, agent: "Kirstie",
    activity: [
      { when: "6 days ago", what: "Deposit registered with the scheme.", by: "System" },
      { when: "4 days ago", what: "Tenancy agreement sent for signature.", by: "System" },
      { when: "yesterday", what: "Liam has signed. Waiting on the landlord — he's away until Tuesday.", by: "Kirstie", note: true },
    ],
  },
  {
    id: "a5", tenant: "Hannah Price", property: "5 Orchard Close", locality: "St Albans AL1",
    image: null, rent: "£1,700 pcm", moveIn: "14 Aug 2026", stageKey: "move_day",
    ticked: 8, agent: "Michael", flag: "Friday",
    activity: [
      { when: "last week", what: "All parties signed.", by: "System" },
      { when: "4 days ago", what: "First month's rent and deposit cleared.", by: "System" },
      { when: "2 days ago", what: "Inventory booked for Friday morning, keys ready at the office.", by: "Michael", note: true },
    ],
  },
];

const stageIdx = (k: string) => STAGES.findIndex((s) => s.key === k);

export default function Applications() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = APPS.find((a) => a.id === openId) ?? null;

  const defs = useMemo<ColumnDef<App>[]>(
    () => [
      {
        key: "applicant", label: "Applicant", required: true,
        render: (a) => (
          <>
            <span className="hand block whitespace-nowrap text-[13px]">{a.tenant}</span>
            {a.flag && (
              <span className="mt-1 inline-block">
                <Pill tone="accent">{a.flag}</Pill>
              </span>
            )}
          </>
        ),
      },
      {
        key: "property", label: "Property",
        render: (a) => (
          <span className="flex items-center gap-2.5">
            <PropertyPhoto src={a.image} className="h-9 w-11 shrink-0 rounded-md" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap">{a.property}</span>
              <span className="block whitespace-nowrap text-[10.5px] text-muted">
                {a.locality}
              </span>
            </span>
          </span>
        ),
      },
      { key: "rent", label: "Rent", cell: "figures whitespace-nowrap", render: (a) => a.rent },
      { key: "moveIn", label: "Move-in", cell: "whitespace-nowrap text-muted", render: (a) => a.moveIn },
      {
        key: "stage", label: "Stage", cell: "whitespace-nowrap",
        render: (a) => <Pill tone="neutral">{STAGES[stageIdx(a.stageKey)].label}</Pill>,
      },
      {
        key: "checklist", label: "Checklist", cell: "whitespace-nowrap",
        render: (a) => (
          <span className="flex items-center gap-1">
            {CHECKLIST.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${i < a.ticked ? "bg-accent" : "bg-line"}`}
              />
            ))}
            <span className="ml-1.5 text-[10px] text-muted">
              {a.ticked}/{CHECKLIST.length}
            </span>
          </span>
        ),
      },
      { key: "agent", label: "With", cell: "whitespace-nowrap text-muted", render: (a) => a.agent },
    ],
    []
  );
  const cols = useColumns<App>("applications", defs);

  return (
    <>
      <PageHeader
        title="Applications"
        blurb="Every application from offer to keys, on the eight stages the business actually runs. Stage changes are written back to REX."
        /* She hangs off the rule by one fist, swinging — which is why the
           pipeline below was pulled in: her body dangles down that gutter.
           0.05 is where her fist is in the artwork, measured off the frames. */
        sprite={{ src: "/illustrations/hanging-strip.webp", frames: 30, aspect: 0.653, fps: 12 }}
        illustrationHeight={300}
        grip={0.0428}
        /* The line sags where she grips it — she is hanging off it, so it
           should give. The trough is centred on the wrapper, which is centred
           on her fist. */
        lineBreak="dip"
      />

      <div className="mt-10">
        <FlowTag from="Propoly + REX" to="REX" />
      </div>

      {/* ── The pipeline: how many sit at each stage.

          The box itself stops after the eighth stage rather than running the
          full width, so the woman hanging off the header rule has clear air to
          swing her legs in. */}
      <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5 lg:max-w-[80%]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px]">Pipeline</h2>
          <p className="text-[11px] text-muted">{APPS.length} live applications</p>
        </div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {STAGES.map((s, i) => {
            const n = APPS.filter((a) => a.stageKey === s.key).length;
            return (
              <div key={s.key} title={s.blurb}>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${n ? "bg-accent" : "bg-line"}`}
                  />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
                    {i + 1}
                  </span>
                </div>
                <p className="figures mt-1.5 text-[22px] leading-none">{n || "—"}</p>
                <p className="mt-1 text-[10px] leading-tight text-muted">{s.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── The applications. The open one takes the full pop-out. */}
      <div className="mt-4">
        <div className="fade-up min-w-0 rounded-2xl border border-line/80 bg-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
            <h2 className="text-[15px]">Live applications</h2>
            <ColumnCustomiser cols={cols} />
          </div>
          <DataTable
            cols={cols}
            rows={APPS}
            activeId={openId}
            onRowClick={(a) => setOpenId(a.id === openId ? null : a.id)}
          />
        </div>

      </div>

      {open && (
        <ApplicationDrawer
          app={open}
          stages={STAGES}
          checklist={CHECKLIST}
          onClose={() => setOpenId(null)}
        />
      )}

      <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
        <li>
          The eight stages and nine checklist items are the TLE portal&apos;s, verbatim —
          so the two products speak one language when they merge.
        </li>
        <li>
          Propoly tracks only five statuses. <span className="font-semibold">PLC,
          Deposit and Move day are portal-side stages</span> someone moves a deal into
          by hand, which is why the overlay has to own them rather than mirror Propoly.
        </li>
        <li>
          <span className="font-semibold">Referencing has no API source anywhere</span> —
          The Lettings Hub isn&apos;t connected in REX and Propoly carries no reference
          status field. That stage is manual until someone connects it.
        </li>
      </ul>
    </>
  );
}
