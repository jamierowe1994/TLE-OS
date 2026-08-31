"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import PlcWizard from "@/components/PlcWizard";
import { ComplianceSide, Note, type Loaded } from "@/components/PlcReview";
import { missingDocuments, PLC_CHECKS, type PlcCase } from "@/lib/plc";
import {
  DEMO_PREFILL,
  DEMO_SCANNED,
  DEMO_SUBMITTED,
  DEMO_SUMMARY,
} from "@/lib/plc-demo";

/**
 * The compliance handover, both halves, for somebody with the share link.
 *
 * ── The real screens, not a mock-up ───────────────────────────────────────
 *
 * `PlcWizard` and `ComplianceSide` are the components the product uses. They
 * take a narrow demo prop that replaces the four places they would reach for
 * the network - the REX prefill, creating the case, attaching a document, and
 * the decision - and nothing else about them changes. So what Susan sees here
 * is what an agent and Kirstie actually see, and it stays that way when
 * somebody edits those screens next month.
 *
 * ── Nothing is real and nothing is written ────────────────────────────────
 *
 * The pack is invented (lib/plc-demo.ts): an address that says Sample in it,
 * two tenants called Sample, and one deliberate blocker - a gas certificate
 * that expires eleven days after the move-in date. That blocker is the demo.
 * It is the thing a person reading nine PDFs at half past four does not
 * catch, and it is also the thing the scan is not allowed to decide about.
 */

/** The scan, as a beat rather than an API call. */
const SCAN_MS = 1500;

type Side = "agent" | "compliance";

export default function PreviewPlc({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [side, setSide] = useState<Side>("agent");
  const [kase, setKase] = useState<PlcCase>(DEMO_SUBMITTED);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Bumped by "Start again". The wizard holds its own progress, so remounting
     it is the honest way to put it back to the beginning. */
  const [run, setRun] = useState(0);

  const loaded: Loaded = {
    case: kase,
    checks: PLC_CHECKS,
    missing: missingDocuments(kase).map((c) => c.id),
    summary: kase.scannedAt ? DEMO_SUMMARY : null,
    /* True, so the panel offers the reading rather than explaining that it is
       switched off. The reading itself is faked below. */
    scanConfigured: true,
  };

  /**
   * What a button does here.
   *
   * Same actions the real panel sends to the API, answered locally. `decide`
   * is the one worth noting: in the product it is terminal and recorded
   * against a real person's name, and here it changes a variable.
   */
  const perform = useCallback(
    async (action: string, extra: Record<string, unknown>) => {
      if (action === "scan") {
        setScanning(true);
        await new Promise((r) => setTimeout(r, SCAN_MS));
        setScanning(false);
        setKase(DEMO_SCANNED);
        return;
      }
      if (action === "skip-scan") {
        setKase({ ...kase, state: "reviewing" });
        return;
      }
      if (action === "decide") {
        const decision = String(extra.decision ?? "approved");
        setKase({
          ...kase,
          state: decision as PlcCase["state"],
          decidedAt: new Date().toISOString(),
          decidedBy: "You, in the preview",
          decisionNote: String(extra.note ?? ""),
        });
      }
    },
    [kase]
  );

  const restart = useCallback(() => {
    setKase(DEMO_SUBMITTED);
    setError(null);
    setSide("agent");
    setRun((n) => n + 1);
  }, []);

  return (
    /* No horizontal padding on the main element.
       PlcWizard brings its own `mx-auto max-w-3xl px-4 sm:px-6` and
       /plc/start mounts it bare for exactly that reason. Wrapping it in a
       second padded column double-padded it and pushed the page wider than
       the phone. So the header gets its own padded block and the panels
       below manage their own. */
    <main className="py-8">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 sm:px-6">
        <div className="min-w-0">
          <p className="hand text-[11px] uppercase tracking-[0.2em] text-muted">A look at</p>
          <h1 className="hand mt-1 text-[26px] leading-tight">The Compliance Handover</h1>
        </div>
        <Link
          href={`/preview/${token}`}
          className="ml-auto shrink-0 rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
        >
          Back
        </Link>
      </div>

      <p className="mx-auto mt-3 max-w-5xl px-4 text-[12.5px] leading-relaxed text-muted sm:px-6">
        When an application is accepted it stops being the agent&apos;s file and
        becomes a submission to compliance. This is both halves of that: what
        the agent does, and what Kirstie sees when it lands. Everything here is
        invented, including the property and the people.
      </p>

      {/* A bordered box needs the padding on a WRAPPER, not on itself - its
          own p-3.5 is the inside of the box, and without this the border sat
          flush against both edges of a phone. */}
      <div className="mx-auto mt-3 max-w-5xl px-4 sm:px-6">
        <p className="rounded-xl border border-line/80 bg-box p-3.5 text-[12px] leading-relaxed">
          The rule underneath it: <span className="font-semibold">the scan never decides.</span>{" "}
          It reads the documents and says what it found. A person approves,
          defers or declines, and their name goes on it.
        </p>
      </div>

      {/* The switch. One browser playing two people, which is the only way to
          show a handover without two logins. */}
      <div className="mx-auto mt-7 flex max-w-5xl flex-wrap items-center gap-2 px-4 sm:px-6">
        <span className="text-[11px] uppercase tracking-wider text-muted">You are</span>
        {(
          [
            ["agent", "The agent"],
            ["compliance", "Kirstie, compliance"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSide(id)}
            aria-pressed={side === id}
            className={`rounded-full px-3.5 py-1.5 text-[12px] transition-colors ${
              side === id
                ? "bg-accent-dark font-semibold text-white"
                : "border border-line/80 hover:border-ink/40"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={restart}
          className="ml-auto text-[11.5px] text-muted underline transition-colors hover:text-ink"
        >
          Start again
        </button>
      </div>

      {/* The wizard is NOT wrapped in the padded column above.
          /plc/start mounts it bare, because it supplies its own
          `mx-auto max-w-3xl px-4 sm:px-6` - nesting it inside another padded
          container double-padded it and pushed the page two pixels wide on a
          phone. The compliance panel is the opposite: /pre-tenancy/plc mounts
          it inside a padded column, so it keeps one here. */}
      <div className="mt-6">
        {side === "agent" ? (
          /* Keyed on the side so leaving and coming back replays the opening
             beat rather than dropping somebody mid-wizard on a screen they
             have not seen the start of. */
          <PlcWizard
            key={`agent-${run}`}
            demo={{
              prefill: DEMO_PREFILL,
              onSeeCompliance: () => setSide("compliance"),
              onRestart: restart,
            }}
          />
        ) : (
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            {error && (
              <div className="mb-4">
                <Note>{error}</Note>
              </div>
            )}
            {scanning && (
              <p className="mb-4 rounded-xl border border-line/80 bg-box p-3.5 text-[12.5px]">
                Reading the pack…
              </p>
            )}
            <ComplianceSide
              data={loaded}
              perform={perform}
              reload={async () => {}}
              onDecided={() => {}}
              say={setError}
            />
          </div>
        )}
      </div>

      <p className="mt-10 text-center text-[11px] text-muted">The Lettings Experts</p>
    </main>
  );
}
