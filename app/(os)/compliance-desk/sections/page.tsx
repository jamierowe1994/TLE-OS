"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import Segmented from "@/components/Segmented";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import { GREEN, RED, waited } from "@/components/compliance-desk/CheckRow";
import DeskNoticeReview, { riskCount } from "@/components/sections/DeskNoticeReview";
import { fetchMe } from "@/lib/me";
import { SPECS, dayLabel, increaseOf, money, pounds, type Notice, type NoticeKind, type NoticeStatus } from "@/lib/section-notices-spec";

/**
 * SECTIONS: Michael's Section 13s and Section 8s (James, 7 Oct 2026).
 *
 * "We're going to create him a new tab called Sections. It'll be split
 * between a few tabs where he'll have section 13, section 8." The agents fill
 * his checklist in on the home's file; it arrives here. He checks it, decides,
 * and serves the approved ones through PayProp by hand ("Serving notices
 * through PayProp stays manual for now, not automated" - the 7 Oct meeting).
 *
 * Two tabs, one per kind, each counting what is waiting on him. Under each,
 * the states as the jobs they are: waiting for you, approved and still to
 * serve, referred for legal review, back with the agent, and done.
 */

type Bucket = "waiting" | "serve" | "legal" | "returned" | "done";

const BUCKET_OF: Record<NoticeStatus, Bucket | null> = {
  draft: null, withdrawn: null,
  submitted: "waiting", approved: "serve", legal: "legal", returned: "returned", declined: "done", served: "done",
};
const BUCKET_LABEL: Record<Bucket, string> = {
  waiting: "Waiting for you",
  serve: "Approved, to serve",
  legal: "Legal review",
  returned: "With the agent",
  done: "Done",
};
const BUCKET_EMPTY: Record<Bucket, string> = {
  waiting: "Nothing waiting. Every one that has come in has been decided.",
  serve: "Nothing approved and waiting to be served.",
  legal: "Nothing referred for legal review.",
  returned: "Nothing sent back to an agent.",
  done: "Nothing served or declined yet.",
};
const LATE_AFTER_DAYS = 3;

export default function Sections() {
  const [list, setList] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [kind, setKind] = useState<NoticeKind>("s13");
  const [bucket, setBucket] = useState<Bucket>("waiting");
  const [open, setOpen] = useState<Notice | null>(null);
  const [me, setMe] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch("/api/section-notices/desk", { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => null) }))
      .then(({ ok, j }) => {
        if (!ok || !j?.ok) { setError(j?.error ?? "Could not read the notices."); return; }
        if (!j.stored) setReason(j.reason ?? "Nothing is kept on this environment.");
        setList(j.notices as Notice[]);
      })
      .catch(() => setError("Could not read the notices."));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetchMe().then((m) => setMe(m?.actor?.name || m?.user?.name || ""));
    /* ?open=<id> from the bell. */
    const want = new URLSearchParams(window.location.search).get("open");
    if (want) setOpenId(want);
  }, []);
  useEffect(() => {
    if (!openId || !list) return;
    const n = list.find((x) => x.id === openId);
    if (n) { setKind(n.kind); setBucket(BUCKET_OF[n.status] ?? "waiting"); setOpen(n); }
    setOpenId(null);
  }, [openId, list]);

  const counts = useMemo(() => {
    const c: Record<NoticeKind, Record<Bucket, number>> = {
      s13: { waiting: 0, serve: 0, legal: 0, returned: 0, done: 0 },
      s8: { waiting: 0, serve: 0, legal: 0, returned: 0, done: 0 },
    };
    for (const n of list ?? []) { const b = BUCKET_OF[n.status]; if (b) c[n.kind][b] += 1; }
    return c;
  }, [list]);

  const rows = useMemo(() => {
    const r = (list ?? []).filter((n) => n.kind === kind && BUCKET_OF[n.status] === bucket);
    /* Waiting: oldest first, the one that has waited longest is the next job. */
    if (bucket === "waiting" || bucket === "legal") r.sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
    return r;
  }, [list, kind, bucket]);

  const onChange = useCallback((n: Notice) => setList((l) => (l ?? []).map((x) => (x.id === n.id ? n : x))), []);

  if (!list && !error) return <WorkspaceLoading />;

  const tabLabel = (k: NoticeKind) => {
    const w = counts[k].waiting + counts[k].legal;
    return (
      <span className="flex items-center gap-2">
        {SPECS[k].short}
        <span className="hidden opacity-60 sm:inline">· {k === "s13" ? "Rent increase" : "Possession"}</span>
        {w > 0 && <span className="rounded-full bg-accent-dark px-2 py-0.5 text-[10.5px] font-bold text-white">{w}</span>}
      </span>
    );
  };

  const buckets: Bucket[] = kind === "s8" ? ["waiting", "serve", "legal", "returned", "done"] : ["waiting", "serve", "returned", "done"];

  return (
    <>
      <PageHeader
        title="Sections"
        blurb="Section 13 rent increases and Section 8 possession notices, sent in by the agents. Check each one, decide, and serve the approved ones through PayProp."
        search={false}
      />
      {error && (
        <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-[#9d4340]">
          {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </p>
      )}
      {reason && <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-muted">{reason}</p>}

      {list && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Segmented value={kind} onChange={(k) => { setKind(k); if (k === "s13" && bucket === "legal") setBucket("waiting"); }} options={[{ id: "s13" as const, label: tabLabel("s13") }, { id: "s8" as const, label: tabLabel("s8") }]} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {buckets.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBucket(b)}
                className={`rounded-full border px-3.5 py-2 text-[12px] transition-colors ${bucket === b ? "border-accent-dark bg-accent-soft font-semibold text-accent-dark" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"}`}
              >
                {BUCKET_LABEL[b]} · {counts[kind][b]}
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <div className="fade-up mt-5 flex items-center gap-3 rounded-[22px] border border-line/70 bg-card p-5">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${GREEN}`}><span className="h-2.5 w-2.5 rounded-full bg-[#56634a]" /></span>
              <p className="text-[13.5px]">{BUCKET_EMPTY[bucket]}</p>
            </div>
          ) : (
            <ul className="fade-up mt-4 space-y-3">
              {rows.map((n) => {
                const w = n.submittedAt ? waited(n.submittedAt) : null;
                const risks = riskCount(n);
                const inc = increaseOf(n.answers);
                const cur = money(n.answers.fields.current_rent);
                const late = Boolean(w && w.days > LATE_AFTER_DAYS && (bucket === "waiting" || bucket === "serve"));
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => setOpen(n)} className="w-full rounded-[18px] border border-line/70 bg-card p-4 text-left transition-colors hover:border-ink/30">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-[min(100%,260px)] flex-1">
                          <p className="text-[14px] font-semibold leading-snug">{n.answers.fields.address || n.propertyLabel}</p>
                          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
                            {n.answers.fields.tenants ? `${n.answers.fields.tenants} · ` : ""}{n.agentName}
                            {n.kind === "s13" && inc != null ? ` · ${pounds(cur ?? 0)} to ${pounds((cur ?? 0) + inc)} from ${dayLabel(n.answers.fields.new_rent_start)}` : ""}
                            {n.kind === "s8" && n.answers.fields.grounds ? ` · ${n.answers.fields.grounds}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {n.submittedAt && <span className="rounded-full bg-page px-2.5 py-1 text-[11px] text-muted">Submitted {dayLabel(n.submittedAt.slice(0, 10))}</span>}
                            {w && (bucket === "waiting" || bucket === "legal" || bucket === "serve") && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${late ? RED : GREEN}`}>Waiting {w.label}</span>}
                            {n.kind === "s8" && risks > 0 && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${RED}`}>{risks} risk{risks === 1 ? "" : "s"} ticked</span>}
                            {n.history.some((h) => h.what.startsWith("Returned")) && bucket === "waiting" && <span className="rounded-full bg-page px-2.5 py-1 text-[11px] text-muted">Sent back once already</span>}
                            {n.status === "served" && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${GREEN}`}>Served {dayLabel(n.postService.servedOn)}</span>}
                            {n.status === "declined" && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${RED}`}>Declined</span>}
                            {n.test && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-dark">Test</span>}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white">
                          {bucket === "waiting" || bucket === "legal" ? "Review" : bucket === "serve" ? "Record service" : "Open"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {open && <DeskNoticeReview key={open.id} notice={open} me={me} onClose={() => setOpen(null)} onChange={onChange} />}
    </>
  );
}
