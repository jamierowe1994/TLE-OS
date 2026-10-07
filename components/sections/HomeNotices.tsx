"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { GREEN, RED } from "@/components/compliance-desk/CheckRow";
import NoticeForm, { type HomeFacts } from "@/components/sections/NoticeForm";
import { fetchMe } from "@/lib/me";
import {
  SPECS, STATUS_LABEL, dayLabel, todayIso,
  type Answers, type Notice, type NoticeKind, type NoticeStatus,
} from "@/lib/section-notices-spec";

/**
 * RENT REVIEW AND SERVE NOTICE, ON THE HOME'S FILE (James, 7 Oct 2026).
 *
 * "We'll have a button somewhere that says Rent Review, and then we'll also
 * have a section that says Serve Notice." Two buttons on every home in
 * Portfolio - the current landlord's file - each opening Michael's checklist
 * (components/sections/NoticeForm) with the home already filled in. Under
 * them, every notice the home has had and where it stands, so the next agent
 * to open the file sees a rent review is already with compliance before they
 * start another.
 *
 * One open notice of each kind per home: pressing the button again carries on
 * with that one rather than starting a second.
 */

const OPEN: NoticeStatus[] = ["draft", "submitted", "returned", "legal", "approved"];

const tone = (s: NoticeStatus) =>
  s === "returned" || s === "declined" || s === "legal" ? RED : s === "draft" || s === "withdrawn" ? "bg-panel text-muted" : GREEN;

export interface HomeNoticeFacts extends HomeFacts {
  address: string;
  landlord: string;
  tenants: string[];
  agent: string | null;
  /** Monthly equivalent, for the Section 13's current rent. */
  rentMonthly: number | null;
  /** ISO date: the let date as the record has it. */
  letSince: string | null;
}

function prefillFor(kind: NoticeKind, h: HomeNoticeFacts, me: string): Answers {
  const fields: Record<string, string> = {
    address: h.address,
    landlord: h.landlord,
    tenants: h.tenants.join(", "),
    agent: h.agent ?? me,
    submitted: todayIso(),
    tenancy_start: h.letSince && /^\d{4}-\d{2}-\d{2}/.test(h.letSince) ? h.letSince.slice(0, 10) : "",
  };
  if (kind === "s13" && h.rentMonthly != null) fields.current_rent = String(Math.round(h.rentMonthly * 100) / 100);
  for (const k of Object.keys(fields)) if (!fields[k]) delete fields[k];
  return { fields, checks: {}, signature: "", auto: Object.keys(fields) };
}

export default function HomeNotices({ home, className = "", stacked = false, start, bare = false, onDone }: {
  home: HomeNoticeFacts;
  className?: string;
  /** One button under the other, for a narrow box. */
  stacked?: boolean;
  /** Open this kind's checklist straight away - the open one if there is one,
   *  else a new one (the property page's Serve notice and Rent review tiles). */
  start?: NoticeKind;
  /** Draw nothing but the checklist itself. */
  bare?: boolean;
  /** The checklist was closed. */
  onDone?: () => void;
}) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState("");
  const [open, setOpen] = useState<{ kind: NoticeKind; notice: Notice | null } | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch(`/api/section-notices?listing=${encodeURIComponent(home.listingId)}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => null) }))
      .then(({ ok, j }) => {
        if (!ok || !j?.ok) { setError(j?.error ?? "Could not read this home's notices."); setNotices([]); return; }
        setNotices(j.notices as Notice[]);
      })
      .catch(() => { setError("Could not read this home's notices."); setNotices([]); });
  }, [home.listingId]);

  useEffect(() => {
    setNotices(null);
    load();
  }, [load]);
  useEffect(() => {
    let gone = false;
    fetchMe().then((m) => { if (!gone) setMe(m?.actor?.name || m?.user?.name || ""); });
    return () => { gone = true; };
  }, []);

  /* ?notice=<id> from the bell: open that one, once. */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !notices) return;
    const want = new URLSearchParams(window.location.search).get("notice");
    const n = want ? notices.find((x) => x.id === want) : null;
    if (n) { asked.current = true; setOpen({ kind: n.kind, notice: n }); }
  }, [notices]);

  /* Asked for a kind: open it once the home's notices are known, so an open
     one is carried on rather than a second started. */
  const started = useRef(false);
  useEffect(() => {
    if (!start || started.current || notices === null) return;
    started.current = true;
    setOpen({ kind: start, notice: notices.find((n) => n.kind === start && OPEN.includes(n.status)) ?? null });
  }, [start, notices]);

  const onChange = useCallback((n: Notice) => {
    setNotices((list) => {
      const rest = (list ?? []).filter((x) => x.id !== n.id);
      return n.status === "withdrawn" ? rest : [n, ...rest].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }, []);

  const openOf = (kind: NoticeKind) => (notices ?? []).find((n) => n.kind === kind && OPEN.includes(n.status)) ?? null;

  const button = (kind: NoticeKind) => {
    const spec = SPECS[kind];
    const current = openOf(kind);
    return (
      <button
        type="button"
        disabled={notices === null}
        onClick={() => setOpen({ kind, notice: current })}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-line/70 bg-white px-4 py-3.5 text-left transition-colors hover:border-ink/40 disabled:opacity-60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name={kind === "s13" ? "coin" : "file-contract"} size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-tight">{current ? (current.status === "draft" ? `Carry on: ${spec.button}` : spec.button) : spec.button}</span>
          <span className="mt-0.5 block truncate text-[11.5px] text-muted">
            {current ? STATUS_LABEL[current.status] : `${spec.short} · ${kind === "s13" ? "rent increase" : "possession notice"}`}
          </span>
        </span>
        <span aria-hidden className="text-muted transition-transform group-hover:translate-x-0.5">→</span>
      </button>
    );
  };

  if (bare) {
    return open ? (
      <NoticeForm
        key={open.notice?.id ?? `new-${open.kind}`}
        kind={open.kind}
        home={home}
        notice={open.notice}
        prefill={prefillFor(open.kind, home, me)}
        agentName={me}
        onClose={() => { setOpen(null); onDone?.(); }}
        onChange={onChange}
        stepped
      />
    ) : null;
  }

  return (
    <section className={className}>
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Rent review and notices</p>
      <div className={stacked ? "flex flex-col gap-2" : "flex flex-col gap-2 sm:flex-row"}>
        {button("s13")}
        {button("s8")}
      </div>

      {notices === null ? (
        <p className="mt-2 flex items-center gap-2 text-[12px] text-muted" role="status">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" /> Checking for notices on this home
        </p>
      ) : error ? (
        <p className="mt-2 text-[12px] text-[#9d4340]">
          {error}{" "}
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </p>
      ) : notices.length > 0 ? (
        <ul className="mt-2 overflow-hidden rounded-xl border border-line/50 bg-white">
          {notices.map((n) => (
            <li key={n.id} className="border-b border-line/40 last:border-0">
              <button type="button" onClick={() => setOpen({ kind: n.kind, notice: n })} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-[12.5px] transition-colors hover:bg-box">
                <span className="font-semibold">{SPECS[n.kind].short}</span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {n.submittedAt ? `Submitted ${dayLabel(n.submittedAt.slice(0, 10))}` : `Started ${dayLabel(n.createdAt.slice(0, 10))}`} by {n.agentName}
                  {n.test ? " · test" : ""}
                </span>
                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone(n.status)}`}>{STATUS_LABEL[n.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open && (
        <NoticeForm
          key={open.notice?.id ?? `new-${open.kind}`}
          kind={open.kind}
          home={home}
          notice={open.notice}
          prefill={prefillFor(open.kind, home, me)}
          agentName={me}
          onClose={() => setOpen(null)}
          onChange={onChange}
          stepped
        />
      )}
    </section>
  );
}
