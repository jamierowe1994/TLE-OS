"use client";

import { useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import StageTabs from "@/components/StageTabs";
import PropertyPhoto from "@/components/PropertyPhoto";
import ApplicationDrawer, { type Check } from "@/components/ApplicationDrawer";
import HandoffPanel from "@/components/HandoffPanel";
import { ColumnCustomiser, DataTable, useColumns, type ColumnDef } from "@/components/TableColumns";
import { Pill } from "@/components/Wire";
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
  { key: "received", label: "Received", icon: "message", blurb: "In, and not yet put to the landlord." },
  { key: "communicated", label: "Communicated", icon: "mail", blurb: "With the landlord, waiting on their decision." },
  { key: "accepted", label: "Accepted", icon: "checklist", blurb: "Landlord has said yes — the deal opens from here." },
  { key: "unsuccessful", label: "Unsuccessful", icon: "cross", blurb: "Turned down, or the applicant withdrew." },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

const gbp = (n: number | null) => (n == null ? "—" : `£${n.toLocaleString("en-GB")}`);

/**
 * One fetch, however many times this mounts.
 *
 * The call takes ~3 seconds against 200 applications, and the component
 * mounts more than once on the way to a settled page — the dev double-invoke,
 * then the shell. Each mount was starting its own copy of the same request.
 *
 * Holding the PROMISE rather than the result means a later mount joins the
 * call already in flight instead of racing it.
 */
let inFlight: Promise<{ applications?: Application[]; error?: string; scope?: string; everything?: boolean }> | null = null;
function book() {
  inFlight ??= fetch("/api/applications?limit=200")
    .then((r) => r.json())
    // A failure must not be cached — the next mount should try again.
    .catch((e: Error) => {
      inFlight = null;
      throw e;
    });
  return inFlight;
}

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
  /* ?open=<id>: the PLC wizard sends people back here to a named
     application, and this is what opens it. Read once, on arrival. */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("open");
    if (wanted) setOpenId(wanted);
  }, []);
  /* "open" is every application still in play. Unsuccessful is a stage like
     any other now, reached by clicking it, so the old show/hide toggle went
     with it - two ways to say the same thing, one of which was a link. */
  const [stage, setStage] = useState<StageKey | "open">("open");
  /* Whose book this is - "the whole business" for an owner, the agent's own
     name otherwise - so the page can say so rather than leave somebody to
     wonder why they see less than they used to. */
  const [scope, setScope] = useState<{ label: string; everything: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    book()
      .then((d) => {
        if (!live) return;
        if (d.error) setError(d.error);
        if (d.scope) setScope({ label: d.scope, everything: Boolean(d.everything) });
        setApps(d.applications ?? []);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const all = apps ?? [];
  const rows = useMemo(
    () =>
      stage === "open"
        ? all.filter((a) => a.status !== "unsuccessful")
        : all.filter((a) => a.status === stage),
    [all, stage]
  );
  const open = all.find((a) => a.id === openId) ?? null;

  /* The right-to-rent banner that used to sit here - "34 of 120 people on
     the 92 open applications have no recorded right-to-rent answer" - was
     removed on 10 Sep 2026. James: "that's a me problem, not an agent
     problem". It measured a gap in how the JotForm collects the answer, not
     anything the agent reading the screen could act on, and a permanent red
     panel about somebody else's plumbing is how a screen teaches people to
     ignore its warnings. The per-application check on each row stays, because
     that one IS theirs to chase. */

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
        /* The photograph was 36x44 - James, 10 Sep 2026: "the photos are tiny,
           you can barely see the property, and it's all very statistical."
           Listings comes down a little and this comes up, so a property looks
           like a property on both, and both read photo-first, left to right. */
        render: (a) => (
          <span className="flex items-center gap-3">
            <PropertyPhoto src={a.image} className="h-24 w-32 shrink-0 rounded-lg" />
            {/* Truncated, not nowrap: a long address used to push the whole
                table past the panel's edge and the Status column off the
                screen (James, 6 Sep 2026). */}
            <span className="min-w-0 max-w-[240px]">
              <span className="block truncate" title={a.property}>{a.property}</span>
              <span className="block truncate text-[10.5px] text-muted">{a.locality}</span>
            </span>
          </span>
        ),
      },
      {
        key: "offer", label: "Offer", cell: "figures whitespace-nowrap",
        render: (a) => (a.offerAmount ? `${gbp(a.offerAmount)} pcm` : "—"),
      },
      {
        key: "moveIn", label: "Move-in", cell: "whitespace-nowrap text-muted",
        /* "28 Sep 2026", not the ISO string REX hands back - it read as a
           database field, and it was the widest thing in the column. */
        render: (a) => (a.startDate ? new Date(a.startDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"),
      },
      {
        key: "stage", label: "Status", cell: "whitespace-nowrap",
        /* stageLabel is where the DEAL has got to; statusLabel is REX's
           four-bucket answer, kept only as the fallback for a record the list
           route could not describe. */
        render: (a) => (
          <Pill tone={a.status === "accepted" ? "accent" : "neutral"}>
            {a.stageLabel ?? a.statusLabel}
          </Pill>
        ),
      },
    ],
    []
  );
  const cols = useColumns<Application>("applications", defs);

  return (
    <>
      <PageHeader
        title="Applications"
        blurb={
          scope && !scope.everything
            ? `${scope.label}'s applications, live. Status is where the deal has actually got to, not which of REX's four buckets it sits in.`
            : "Every application, live. Status is where the deal has actually got to, not which of REX's four buckets it sits in."
        }
        /* The line runs THROUGH her, at the waist. She is drawn full length
           and set at twice the shared height, so 250 still shows above the
           rule - the same as every other screen - and the rest is cut off
           rather than hanging below it. No dip and no shadow: the line is not
           bearing her weight, it is crossing her. */
        illustration="/illustrations/applicant.webp"
        illustrationHeight={500}
        illustrationAspect={0.34}
        seat={0.5}
        illustrationCrop
        lineBreak="none"
      />

      {/* ── The pipeline, and the filter for it. Same shape as Market
             Appraisals and Listings - see components/StageTabs. It used to be
             four numbers that looked clickable and were not. ── */}
      <StageTabs
        label="Application statuses"
        allId="open"
        value={stage}
        onChange={setStage}
        stages={[
          {
            id: "open" as const,
            label: "All open",
            icon: "analytics",
            count: all.filter((a) => a.status !== "unsuccessful").length,
            blurb: "Everything still in play",
          },
          ...STAGES.map((st) => ({
            id: st.key,
            label: st.label,
            icon: st.icon,
            count: all.filter((a) => a.status === st.key).length,
            blurb: st.blurb,
          })),
        ]}
      />

      {/* ── The applications. The open one takes the full pop-out. ── */}
      <div className="mt-4">
        <div className="fade-up min-w-0 rounded-2xl border border-line/80 bg-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
            <h2 className="text-[15px]">
              {stage === "open"
                ? "Open applications"
                : STAGES.find((st) => st.key === stage)?.label}
              <span className="figures ml-1.5 text-muted">({rows.length})</span>
            </h2>
            <div className="flex items-center gap-3">
              {stage !== "open" && (
                <button
                  type="button"
                  onClick={() => setStage("open")}
                  className="text-[11.5px] text-muted underline transition-colors hover:text-ink"
                >
                  Show all open
                </button>
              )}
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
            applicants: open.applicants.map((p) => ({
              name: p.name,
              contactId: p.contactId,
              email: p.email,
              phone: p.phone,
              isPrimary: p.isPrimary,
            })),
            property: open.property,
            propertyId: open.propertyId,
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
          stages={[...STAGES]}
          checklist={checksFor(open)}
          // Only once the landlord has said yes. Before that there is no deal
          // to hand over, and offering one invites somebody to jump the gun.
          aside={open.status === "accepted" ? <HandoffPanel applicationId={open.id} /> : undefined}
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
