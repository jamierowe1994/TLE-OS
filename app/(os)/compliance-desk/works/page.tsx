"use client";

import PageHeader from "@/components/PageHeader";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import CheckRow, { GREEN } from "@/components/compliance-desk/CheckRow";
import { useDesk } from "@/components/compliance-desk/useDesk";

/**
 * Works orders: every finished job, until Michael has checked it.
 *
 * James, 20 Sep 2026: "Any works orders need to go through him to check
 * because he will need to put them on properly... He would need to be notified
 * towards the back end of that process." The email he gets when a job is
 * marked done (lib/works-compliance) points here.
 *
 * Open jobs are not his and are not listed - the agent is still working them
 * on Maintenance. The job sheet is one click away for the whole story.
 */
const LATE_AFTER_DAYS = 3;

export default function WorksToCheck() {
  const { desk, error, busy, check } = useDesk();
  if (!desk && !error) return <WorkspaceLoading />;
  const rows = desk?.works ?? [];

  return (
    <>
      <PageHeader
        title="Works Orders"
        blurb="Finished jobs, until you have checked them and what they produced. Oldest first."
        search={false}
      />
      {error && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-[#9d4340]">{error}</p>}
      {desk && !desk.stored && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-muted">{desk.reason}</p>}

      {desk?.stored && rows.length === 0 && (
        <div className="fade-up mt-5 flex items-center gap-3 rounded-[22px] border border-line/70 bg-card p-5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${GREEN}`}><span className="h-2.5 w-2.5 rounded-full bg-[#56634a]" /></span>
          <p className="text-[13.5px]">Nothing waiting. Every finished job has been checked.</p>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="fade-up mt-4 space-y-3">
          {rows.map((o) => (
            <CheckRow
              key={o.id}
              title={`#${o.ref} ${o.title} - ${o.property}`}
              sub={`${o.contractor ? `${o.contractor}. ` : ""}Raised by ${o.raisedBy || "somebody"}.${o.completionNote ? ` "${o.completionNote}"` : ""}`}
              chips={[o.kind === "planned" ? "Planned" : "Repair", o.category, o.status === "done" ? "No invoice yet" : o.status === "invoiced" ? "Invoiced" : o.status === "paid" ? "Paid" : o.status, o.files.length ? "" : "No files on the job"]}
              files={o.files.map((f) => ({ key: f.key, name: f.name }))}
              openHref={`/maintenance?open=${encodeURIComponent(o.id)}`}
              openLabel="Open the job"
              addedAt={o.completedAt}
              lateAfterDays={LATE_AFTER_DAYS}
              queried={o.queried}
              okLabel="Checked"
              busy={busy === o.id}
              onVerify={() => check("works_order", o.id, "verified")}
              onQuery={(note) => check("works_order", o.id, "queried", note)}
            />
          ))}
        </ul>
      )}
    </>
  );
}
