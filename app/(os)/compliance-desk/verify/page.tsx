"use client";

import PageHeader from "@/components/PageHeader";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import CheckRow, { GREEN } from "@/components/compliance-desk/CheckRow";
import { useDesk } from "@/components/compliance-desk/useDesk";
import RegisterCheck from "@/components/compliance-desk/RegisterCheck";
import VerifiedList, { useVerified } from "@/components/compliance-desk/VerifiedList";
import { useCallback, useEffect, useState } from "react";
import { searchMatches } from "@/lib/search-match";
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
 *
 * THREE TABS ON ONE PAGE (James, 22 Oct 2026, after Jo's first morning): "it
 * lands, it moves over into the next section, she clicks the tab, and then
 * sends it off straight away without having to click in the sidebar."
 *
 *   To Verify   waiting for the check
 *   Verified    checked, waiting to go to the tenants (Email Tenant)
 *   Sent        gone, with the record
 *
 * /compliance-desk/verified opens this page on Verified.
 *
 * GAS & ELECTRIC ON A TAB OF THEIR OWN (James, 27 Oct 2026): "the one where
 * he checks the gas safety certificates and the electrical safety
 * certificates, and then confirms them" could not be found among the EPCs and
 * landlord uploads, and "To verify" did not say what it was. So the queue is
 * two tabs: Gas & Electric (gas safety and EICR, the ones held out of REX until
 * he verifies them, each with its register check) first, and Other Documents.
 * An agent and a property filter sit over both: "if he's on the phone to them".
 */
const LATE_AFTER_DAYS = 7;

type Tab = "verify" | "other" | "verified" | "sent";
const TAB_IDS: Tab[] = ["verify", "other", "verified", "sent"];
const TAB_LABEL: Record<Tab, string> = { verify: "Gas & Electric", other: "Other Documents", verified: "Verified", sent: "Sent" };

/** Gas safety and EICR: exactly the ones that carry the engineer's register check (lib/cert-register `readable`). */
const isGasOrElectric = (r: VerifyItem) => Boolean(r.register);
const NO_AGENT = "\u0000none";

const BLURB: Record<Tab, string> = {
  verify: "Every gas safety certificate and EICR an agent, a contractor or a landlord has uploaded, or that was filed on REX, until you have checked it. They stay off REX and off the tenant's view until you do. The engineer's register number is read off for you: check it on the register, then verify. Verified, it moves to the Verified tab, ready to email the tenant; queried, the agent is emailed what you wrote. Oldest first.",
  other: "Everything else waiting for your check: EPCs, licences, legionella, alarms and the landlords' uploads. Verified, it moves to the Verified tab; queried, the agent is emailed what you wrote. Oldest first.",
  verified: "Certificates you have verified, waiting to go to the tenants. They must have the renewed certificate within 28 days of the work, counted from the date on it (or the day it came in, if no date was filed). Email Tenant opens the email with the certificate attached: check it, change the words if you need to, and send.",
  sent: "Every verified certificate that has gone to the tenants, newest first. Each email is kept on the home's file as the record: View Record shows it exactly as it went.",
};

export default function ToVerify() {
  const { desk, error, busy, said, check, readRegister } = useDesk();
  const verified = useVerified();
  const [tab, setTab] = useState<Tab>("verify");
  /* What the last Verified press did, with the way to the tab it went to. */
  const [moved, setMoved] = useState(false);
  const [agent, setAgent] = useState("");
  const [find, setFind] = useState("");
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (TAB_IDS.includes(t as Tab)) setTab(t as Tab);
    } catch { /* fine */ }
  }, []);
  const pick = useCallback((t: Tab) => {
    setTab(t);
    setMoved(false);
    try {
      const u = new URL(window.location.href);
      if (t === "verify") u.searchParams.delete("tab"); else u.searchParams.set("tab", t);
      window.history.replaceState(null, "", u.toString());
    } catch { /* fine */ }
  }, []);
  /* Verified, it leaves this list there and then and the Verified tab counts it. */
  const checkAndMove: typeof check = useCallback(async (...args) => {
    const ok = await check(...args);
    if (ok && args[2] === "verified") {
      verified.reload();
      setMoved(args[0] !== "works_order");
    } else setMoved(false);
    return ok;
  }, [check, verified.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!desk && !error) return <WorkspaceLoading />;
  const all = desk?.verify ?? [];
  const ofAgent = (list: VerifyItem[]) => (!agent ? list : list.filter((r) => (agent === NO_AGENT ? !r.agent : r.agent === agent)));
  const gas = ofAgent(all.filter(isGasOrElectric));
  const other = ofAgent(all.filter((r) => !isGasOrElectric(r)));
  const checking = tab === "verify" || tab === "other";
  const onTab = tab === "other" ? other : gas;
  const t = find.trim();
  const rows = t ? onTab.filter((r) => searchMatches(t, r.property, r.what, r.by, r.fileName)) : onTab;
  const queried = rows.filter((r) => r.queried).length;
  /* Every agent with something waiting, the most first. */
  const waitingBy = new Map<string, number>();
  for (const r of all) waitingBy.set(r.agent ?? NO_AGENT, (waitingBy.get(r.agent ?? NO_AGENT) ?? 0) + 1);
  const agents = [...waitingBy.entries()]
    .filter(([a]) => a !== NO_AGENT)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const counts: Record<Tab, number | null> = {
    verify: gas.length,
    other: other.length,
    verified: verified.items ? verified.waiting.length : null,
    sent: verified.items ? verified.sent.length : null,
  };

  return (
    <>
      <PageHeader title="Gas & Electric Check" blurb={BLURB[tab]} search={false} />

      <div role="tablist" aria-label="Certificates" className="fade-up mt-5 flex max-w-full gap-1 overflow-x-auto rounded-full border border-line/70 bg-card p-1 sm:inline-flex">
        {TAB_IDS.map((id) => [id, TAB_LABEL[id]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => pick(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition ${tab === id ? "bg-ink text-page" : "text-muted hover:text-ink"}`}
          >
            {label}
            {counts[id] != null && (
              <span className={`rounded-full px-1.5 text-[11px] ${tab === id ? "bg-page/20" : id === "verified" && (counts[id] ?? 0) > 0 ? "bg-accent-soft text-accent-dark" : "bg-page"}`}>{counts[id]}</span>
            )}
          </button>
        ))}
      </div>

      {checking && all.length > 0 && (
        <div className="fade-up mt-4 flex flex-wrap items-center gap-3">
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            aria-label="Agent"
            className="w-full rounded-full border border-line/80 bg-card px-3.5 py-1.5 text-[12.5px] sm:w-auto sm:max-w-[260px]"
          >
            <option value="">Every agent</option>
            {agents.map(([name, n]) => (
              <option key={name} value={name}>{name} ({n})</option>
            ))}
            {waitingBy.has(NO_AGENT) && <option value={NO_AGENT}>No agent on record ({waitingBy.get(NO_AGENT)})</option>}
          </select>
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Find a property"
            className="w-full rounded-full border border-line/80 bg-card px-3.5 py-1.5 text-[12.5px] sm:max-w-[300px]"
          />
          {(agent || find) && (
            <button type="button" onClick={() => { setAgent(""); setFind(""); }} className="text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline">
              Clear
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-[#9d4340]">{error}</p>}
      {checking && said && !error && (
        <div className={`mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl p-4 text-[12.5px] ${GREEN}`}>
          <span className="min-w-0 flex-1">{said}</span>
          {moved && (
            <button type="button" onClick={() => pick("verified")} className="shrink-0 rounded-full bg-[#56634a] px-3.5 py-1.5 text-[12px] font-semibold text-white">
              Open Verified
            </button>
          )}
        </div>
      )}
      {(!checking && verified.error) && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-[#9d4340]">{verified.error}</p>}
      {desk && !desk.stored && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-muted">{desk.reason}</p>}

      {checking && desk?.stored && rows.length === 0 && (
        <div className="fade-up mt-5 flex items-center gap-3 rounded-[22px] border border-line/70 bg-card p-5">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${GREEN}`}><span className="h-2.5 w-2.5 rounded-full bg-[#56634a]" /></span>
          <p className="text-[13.5px]">
            {agent || t
              ? "Nothing waiting matches that."
              : tab === "verify"
                ? "No gas or electrical certificates waiting. Every one that has come in has been checked."
                : "Nothing else waiting. Every document that has come in has been checked."}
          </p>
        </div>
      )}

      {checking && rows.length > 0 && (
        <>
          <p className="fade-up mt-4 text-[12.5px] text-muted">
            {rows.length} waiting{queried ? `, ${queried} of them queried and not yet put right` : ""}.
            {tab === "verify" && desk?.registerAccuracy && desk.registerAccuracy.checked > 0
              ? ` Engineer numbers read right ${desk.registerAccuracy.matched} of ${desk.registerAccuracy.checked} times so far.`
              : ""}
          </p>
          <ul className="fade-up mt-3 space-y-3">
            {rows.map((r, i) => (
              <VerifyRow key={`${r.kind}-${r.id}`} r={r} index={i} busy={busy === r.id} check={checkAndMove} readRegister={readRegister} />
            ))}
          </ul>
        </>
      )}

      {!checking && !verified.items && !verified.error && <p className="mt-5 text-[12.5px] text-muted">Reading the verified certificates…</p>}
      {(tab === "verified" || tab === "sent") && (
        <VerifiedList view={tab} waiting={verified.waiting} sent={verified.sent} ready={Boolean(verified.items) && verified.stored} reload={verified.reload} />
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
