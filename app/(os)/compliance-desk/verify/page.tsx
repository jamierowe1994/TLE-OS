"use client";

import PageHeader from "@/components/PageHeader";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import CheckRow, { GREEN } from "@/components/compliance-desk/CheckRow";
import { useDesk } from "@/components/compliance-desk/useDesk";

/**
 * To verify: every document that has come in, until Michael has looked at it.
 *
 * James, 20 Sep 2026: "all of the new files are onto the systems when the
 * landlord, contractor, or agent uploads them, and that they get verified and
 * taken off the list." Michael, 7 Sep: "I like to check them first to make
 * sure it's all compliant and they haven't uploaded some dodgy document."
 *
 * Oldest first. A renewed gas certificate has to reach the landlord and the
 * tenant inside 30 days, so the one that has waited longest is the one nearest
 * being a problem; a week waiting goes red.
 */
const LATE_AFTER_DAYS = 7;

export default function ToVerify() {
  const { desk, error, busy, check } = useDesk();
  if (!desk && !error) return <WorkspaceLoading />;
  const rows = desk?.verify ?? [];
  const queried = rows.filter((r) => r.queried).length;

  return (
    <>
      <PageHeader
        title="To Verify"
        blurb="Every certificate an agent, a contractor or a landlord has uploaded, until you have checked it. Oldest first."
        search={false}
      />
      {error && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-[#9d4340]">{error}</p>}
      {desk && !desk.stored && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-muted">{desk.reason}</p>}

      {desk?.stored && rows.length === 0 && (
        <div className="fade-up mt-5 flex items-center gap-3 rounded-[22px] border border-line/70 bg-card p-5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${GREEN}`}><span className="h-2.5 w-2.5 rounded-full bg-[#56634a]" /></span>
          <p className="text-[13.5px]">Nothing waiting. Every document that has come in has been checked.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <p className="fade-up mt-4 text-[12.5px] text-muted">
            {rows.length} waiting{queried ? `, ${queried} of them queried and not yet put right` : ""}.
          </p>
          <ul className="fade-up mt-3 space-y-3">
            {rows.map((r) => (
              <CheckRow
                key={`${r.kind}-${r.id}`}
                title={`${r.what} - ${r.property}`}
                sub={`${r.door === "Landlord" ? `Uploaded by ${r.by}` : `Filed by ${r.by || "somebody"}`}, ${r.source}.${r.agent && r.door !== "Agent" ? ` Agent: ${r.agent}.` : ""}`}
                chips={[r.door, r.expiry ? `Expires ${new Date(`${r.expiry}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "", r.fileName]}
                files={r.fileKey ? [{ key: r.fileKey, name: r.fileName }] : []}
                addedAt={r.addedAt}
                lateAfterDays={LATE_AFTER_DAYS}
                queried={r.queried}
                okLabel="Verified"
                busy={busy === r.id}
                onVerify={() => check(r.kind, r.id, "verified")}
                onQuery={(note) => check(r.kind, r.id, "queried", note)}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}
