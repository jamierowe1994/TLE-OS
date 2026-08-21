"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import PropertyPhoto from "@/components/PropertyPhoto";
import ApplicationDrawer, { type Check } from "@/components/ApplicationDrawer";
import { ColumnCustomiser, DataTable, useColumns, type ColumnDef } from "@/components/TableColumns";
import { FlowTag, Pill } from "@/components/Wire";
import type { Application } from "@/lib/applications";

/**
 * Applications — REX's own book, live.
 *
 * This page used to show five invented rows on the eight pre-tenancy stages.
 * Those eight stages are real, but they belong to the PROPOLY deal that exists
 * only after an application is accepted. The record that exists *before* that,
 * and the one this page is named for, is REX's TenancyApplication — 576 of
 * them, 457 made this year, most by Howard's JotForm flow.
 *
 * So the stages here are REX's four, verbatim, and the checklist is the four
 * checks a letting actually turns on. Nothing is mapped onto anything.
 *
 * The banner is the point of the exercise. Right to Rent is a statutory check
 * on every adult who will live in the property, and the JotForm only ever asks
 * the lead applicant — so a third of the people on these applications have no
 * recorded answer. The number is counted from the live data, not asserted.
 */

const STAGES = [
  { key: "received", label: "Received", blurb: "In, and not yet put to the landlord." },
  { key: "communicated", label: "Communicated", blurb: "With the landlord, waiting on their decision." },
  { key: "accepted", label: "Accepted", blurb: "Landlord has said yes — the deal opens from here." },
  { key: "unsuccessful", label: "Unsuccessful", blurb: "Turned down, or the applicant withdrew." },
];

const stageIdx = (k: string) => Math.max(0, STAGES.findIndex((s) => s.key === k));
const gbp = (n: number | null) => (n == null ? "—" : `£${n.toLocaleString("en-GB")}`);

/** The four checks, read off the live record rather than counted. */
function checksFor(a: Application): Check[] {
  const lead = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
  const k = lead?.keyInfo;
  const everyone = a.applicants.length;
  const answered = a.applicants.filter((p) => p.keyInfo?.rightToRent === true).length;
  return [
    {
      label: `Right to rent — ${answered} of ${everyone} applicant${everyone === 1 ? "" : "s"}`,
      done: everyone > 0 && answered === everyone,
      note:
        answered < everyone
          ? "The form only ever asks the lead applicant. The others were never asked."
          : undefined,
    },
    {
      label: "Landlord reference, last 2 years",
      done: k?.landlordRef === true,
      note: k?.landlordRef === false ? "None available — worth a guarantor conversation." : undefined,
    },
    {
      label: "Guarantor available if needed",
      done: k?.guarantor === true,
      note:
        k?.guarantor === true && lead?.guarantorCount === 0
          ? "Offered, but nobody has been recorded. REX's guarantor list is empty on every application."
          : undefined,
    },
    {
      label: "No adverse credit",
      done: k?.adverseCredit === false,
      note: k?.adverseCredit === true ? k.adverseCreditNote?.slice(0, 180) ?? "Disclosed." : undefined,
    },
  ];
}

export default function Applications() {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/applications?limit=200")
      .then((r) => r.json())
      .then((d: { applications?: Application[]; error?: string }) => {
        if (!live) return;
        if (d.error) setError(d.error);
        setApps(d.applications ?? []);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const all = apps ?? [];
  const rows = useMemo(
    () => (showClosed ? all : all.filter((a) => a.status !== "unsuccessful")),
    [all, showClosed]
  );
  const open = all.find((a) => a.id === openId) ?? null;

  /* The measurement, live. Counted over the applications on screen so the
     number always agrees with what's in front of you. */
  const rtr = useMemo(() => {
    const live = all.filter((a) => a.status === "received" || a.status === "communicated");
    const people = live.flatMap((a) => a.applicants);
    return {
      applications: live.length,
      unanswered: people.filter((p) => p.keyInfo?.rightToRent !== true).length,
      people: people.length,
    };
  }, [all]);

  const defs = useMemo<ColumnDef<Application>[]>(
    () => [
      {
        key: "applicant", label: "Applicant", required: true,
        render: (a) => {
          const lead = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
          const others = a.applicants.length - 1;
          return (
            <>
              <span className="hand block whitespace-nowrap text-[13px]">
                {lead?.name ?? "—"}
              </span>
              {others > 0 && (
                <span className="block whitespace-nowrap text-[10.5px] text-muted">
                  + {others} other{others === 1 ? "" : "s"}
                </span>
              )}
            </>
          );
        },
      },
      {
        key: "property", label: "Property",
        render: (a) => (
          <span className="flex items-center gap-2.5">
            <PropertyPhoto src={a.image} className="h-9 w-11 shrink-0 rounded-md" />
            <span className="min-w-0">
              <span className="block whitespace-nowrap">{a.property}</span>
              <span className="block whitespace-nowrap text-[10.5px] text-muted">{a.locality}</span>
            </span>
          </span>
        ),
      },
      {
        key: "offer", label: "Offer", cell: "figures whitespace-nowrap",
        render: (a) => (a.offerAmount ? `${gbp(a.offerAmount)} pcm` : "—"),
      },
      {
        key: "affordability", label: "Rent / income", cell: "figures whitespace-nowrap",
        render: (a) =>
          a.affordabilityPct == null ? (
            <span className="text-muted">—</span>
          ) : (
            <span className={a.affordabilityPct > 40 ? "text-accent-dark" : undefined}>
              {a.affordabilityPct.toFixed(0)}%
            </span>
          ),
      },
      { key: "moveIn", label: "Move-in", cell: "whitespace-nowrap text-muted", render: (a) => a.startDate ?? "—" },
      {
        key: "stage", label: "Status", cell: "whitespace-nowrap",
        render: (a) => (
          <Pill tone={a.status === "accepted" ? "accent" : "neutral"}>{a.statusLabel}</Pill>
        ),
      },
      {
        key: "checks", label: "Checks", cell: "whitespace-nowrap",
        render: (a) => {
          const checks = checksFor(a);
          const done = checks.filter((c) => c.done).length;
          return (
            <span className="flex items-center gap-1">
              {checks.map((c, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${c.done ? "bg-accent" : "bg-line"}`}
                />
              ))}
              <span className="ml-1.5 text-[10px] text-muted">{done}/{checks.length}</span>
            </span>
          );
        },
      },
      { key: "agent", label: "With", cell: "whitespace-nowrap text-muted", render: (a) => a.agent ?? "—" },
    ],
    []
  );
  const cols = useColumns<Application>("applications", defs);

  return (
    <>
      <PageHeader
        title="Applications"
        blurb="Every application on REX's four statuses, live. The eight pre-tenancy stages open once one is accepted."
        /* She hangs off the rule by one fist, swinging — which is why the
           pipeline below was pulled in: her body dangles down that gutter.
           0.05 is where her fist is in the artwork, measured off the frames. */
        sprite={{ src: "/illustrations/hanging-strip.webp", frames: 30, aspect: 0.653, fps: 12 }}
        illustrationHeight={300}
        grip={0.0428}
        lineBreak="dip"
      />

      <div className="mt-10">
        <FlowTag from="REX" to="REX" />
      </div>

      {/* ── The gap worth acting on, counted live. ── */}
      {rtr.unanswered > 0 && (
        <div className="fade-up mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-5 lg:max-w-[80%]">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-accent-dark">
            Right to rent
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed">
            <span className="figures font-semibold">{rtr.unanswered}</span> of {rtr.people} people
            on the {rtr.applications} open applications have no recorded right-to-rent answer.
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            The JotForm asks the lead applicant only, and writes the answer as prose into the
            notes field rather than a column. Everyone who applies through the portal form is
            asked individually.
          </p>
        </div>
      )}

      {/* ── The pipeline: how many sit at each status. ── */}
      <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5 lg:max-w-[80%]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px]">Pipeline</h2>
          <p className="text-[11px] text-muted">
            {apps === null ? "loading…" : `${all.length} applications`}
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {STAGES.map((s, i) => {
            const n = all.filter((a) => a.status === s.key).length;
            return (
              <div key={s.key} title={s.blurb}>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${n ? "bg-accent" : "bg-line"}`} />
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

      {/* ── The applications. The open one takes the full pop-out. ── */}
      <div className="mt-4">
        <div className="fade-up min-w-0 rounded-2xl border border-line/80 bg-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
            <h2 className="text-[15px]">
              {showClosed ? "All applications" : "Open applications"}
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowClosed((v) => !v)}
                className="text-[11.5px] text-muted underline transition-colors hover:text-ink"
              >
                {showClosed ? "Hide unsuccessful" : "Show unsuccessful"}
              </button>
              <ColumnCustomiser cols={cols} />
            </div>
          </div>

          {apps === null ? (
            <p className="py-8 text-center text-[12.5px] text-muted">Pulling from REX…</p>
          ) : error ? (
            <p className="py-8 text-center text-[12.5px] text-muted">{error}</p>
          ) : (
            <DataTable
              cols={cols}
              rows={rows}
              activeId={openId}
              onRowClick={(a) => setOpenId(a.id === openId ? null : a.id)}
            />
          )}
        </div>
      </div>

      {open && (
        <ApplicationDrawer
          app={{
            id: open.id,
            tenant: (open.applicants.find((p) => p.isPrimary) ?? open.applicants[0])?.name ?? "—",
            property: open.property,
            locality: open.locality,
            image: open.image,
            rent: open.offerAmount ? `${gbp(open.offerAmount)} pcm` : "—",
            moveIn: open.startDate ?? "—",
            stageKey: open.status,
            ticked: 0,
            agent: open.agent ?? "—",
            flag:
              open.affordabilityPct != null && open.affordabilityPct > 40
                ? `Rent is ${open.affordabilityPct.toFixed(0)}% of income`
                : undefined,
            activity: [
              open.dateReceived
                ? { when: open.dateReceived, what: "Application received.", by: open.createdBy ?? "—" }
                : null,
              open.dateAccepted
                ? { when: open.dateAccepted, what: "Landlord accepted.", by: open.agent ?? "—" }
                : null,
              open.conditions
                ? { when: "with the application", what: open.conditions, by: "Applicant", note: true }
                : null,
            ].filter((x): x is NonNullable<typeof x> => x !== null),
          }}
          stages={STAGES}
          checklist={checksFor(open)}
          onClose={() => setOpenId(null)}
        />
      )}

      <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
        <li>
          These are REX&apos;s four application statuses, live. The{" "}
          <span className="font-semibold">eight pre-tenancy stages</span> — holding fee,
          referencing, PLC, deposit, move day — belong to the Propoly deal created once an
          application is accepted, and that record isn&apos;t joined in yet.
        </li>
        <li>
          <span className="font-semibold">Right to rent, landlord reference, guarantor and
          credit have no fields in REX.</span> They are written as one line of prose into the
          notes column, describing the lead applicant only. This page reads that line back out.
        </li>
        <li>
          <span className="font-semibold">REX&apos;s guarantor list is empty on every
          application</span> — including the hundred-odd where the applicant said they could
          provide one. We know a guarantor was offered; we have never recorded who.
        </li>
        <li>
          <span className="font-semibold">Referencing has no API source anywhere</span> — The
          Lettings Hub isn&apos;t connected in REX and Propoly carries no reference status
          field. That stage is manual until someone connects it.
        </li>
      </ul>
    </>
  );
}
