"use client";

import PageHeader from "@/components/PageHeader";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import CheckRow, { GREEN } from "@/components/compliance-desk/CheckRow";
import { useDesk } from "@/components/compliance-desk/useDesk";
import RegisterCheck from "@/components/compliance-desk/RegisterCheck";
import { useState } from "react";
import type { VerifyItem } from "@/lib/compliance-desk";

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
  const { desk, error, busy, said, check, readRegister } = useDesk();
  if (!desk && !error) return <WorkspaceLoading />;
  const rows = desk?.verify ?? [];
  const queried = rows.filter((r) => r.queried).length;

  return (
    <>
      <PageHeader
        title="To Verify"
        blurb="Every certificate an agent, a contractor or a landlord has uploaded, or that was filed on REX, until you have checked it. Verified, a certificate goes on to the landlord and tenants; queried, the agent is emailed what you wrote. Gas and electrical ones come with the engineer's register number read off for you. Oldest first."
        search={false}
      />
      {error && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-[#9d4340]">{error}</p>}
      {said && !error && <p className={`mt-4 rounded-2xl p-4 text-[12.5px] ${GREEN}`}>{said}</p>}
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
            {desk?.registerAccuracy && desk.registerAccuracy.checked > 0
              ? ` Engineer numbers read right ${desk.registerAccuracy.matched} of ${desk.registerAccuracy.checked} times so far.`
              : ""}
          </p>
          <ul className="fade-up mt-3 space-y-3">
            {rows.map((r, i) => (
              <VerifyRow key={`${r.kind}-${r.id}`} r={r} index={i} busy={busy === r.id} check={check} readRegister={readRegister} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** One row, holding the number he checked until he presses Verified. */
function VerifyRow({
  r,
  index,
  busy,
  check,
  readRegister,
}: {
  r: VerifyItem;
  index: number;
  busy: boolean;
  check: ReturnType<typeof useDesk>["check"];
  readRegister: ReturnType<typeof useDesk>["readRegister"];
}) {
  const [number, setNumber] = useState("");
  /* A landlord's certificate is filed as a real one on Verified: it needs the
     date it runs out, and the type where the kind covers more than one. */
  const [expiry, setExpiry] = useState("");
  const [issue, setIssue] = useState("");
  const [type, setType] = useState(r.fileAs?.types[0]?.id ?? "");
  const [needDate, setNeedDate] = useState(false);
  const onRegister = Boolean(r.register);
  const verify = () => {
    if (r.fileAs && !expiry) return setNeedDate(true);
    setNeedDate(false);
    void check(r.kind, r.id, "verified", undefined, onRegister ? number : undefined, r.fileAs ? { type, expiry, issue: issue || undefined } : null);
  };
  return (
    <CheckRow
      title={`${r.what} - ${r.property}`}
      sub={`${r.door === "Landlord" ? `Uploaded by ${r.by}` : r.door === "REX" ? `Filed on REX${r.by ? `, ${r.by}'s home` : ""}` : `Filed by ${r.by || "somebody"}`}, ${r.door === "REX" ? "picked up by the OS" : r.source}.${r.agent && r.door !== "Agent" && r.door !== "REX" ? ` Agent: ${r.agent}.` : ""}`}
      chips={[r.door, r.expiry ? `Expires ${new Date(`${r.expiry}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "", r.fileName]}
      files={r.fileKey ? [{ key: r.fileKey, name: r.fileName }] : []}
      addedAt={r.addedAt}
      lateAfterDays={LATE_AFTER_DAYS}
      queried={r.queried}
      okLabel={onRegister ? "On the register - verified" : "Verified"}
      busy={busy}
      onVerify={verify}
      onQuery={(note) => check(r.kind, r.id, "queried", note)}
    >
      {r.fileAs && (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-page px-3.5 py-3">
          <p className="w-full text-[12px] text-muted">Verified, this is filed as the home&apos;s certificate, so it needs its dates.</p>
          {r.fileAs.types.length > 1 && (
            <label className="text-[11.5px] font-semibold">
              Type
              <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 block rounded-lg border border-line/80 bg-card px-2.5 py-1.5 text-[12.5px] font-normal">
                {r.fileAs.types.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="text-[11.5px] font-semibold">
            Runs out
            <input type="date" value={expiry} onChange={(e) => { setExpiry(e.target.value); setNeedDate(false); }} className={`mt-1 block rounded-lg border bg-card px-2.5 py-1.5 text-[12.5px] font-normal ${needDate ? "border-[#9d4340]" : "border-line/80"}`} />
          </label>
          <label className="text-[11.5px] font-semibold">
            Issued <span className="font-normal text-muted">(if it says)</span>
            <input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} className="mt-1 block rounded-lg border border-line/80 bg-card px-2.5 py-1.5 text-[12.5px] font-normal" />
          </label>
          {needDate && <p className="w-full text-[12px] text-[#9d4340]">Put the date it runs out in first.</p>}
        </div>
      )}
      {onRegister && (
        <RegisterCheck
          item={r}
          number={number}
          setNumber={setNumber}
          delayMs={Math.min(index, 12) * 700}
          onRead={(again) => readRegister(r.kind, r.id, again)}
          onNotOnRegister={(note) => check(r.kind, r.id, "queried", note)}
          onNoNumber={(note) => check(r.kind, r.id, "queried", note)}
        />
      )}
    </CheckRow>
  );
}
