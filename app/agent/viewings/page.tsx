"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { feedbackLabel, type Appt } from "@/lib/diary";
import { ErrorLine, Spinner, TopBar, HomeHero } from "../bits";
import { endOf, loadDiary, nowHm } from "../diary-bits";
import SlideTabs from "@/components/app/SlideTabs";
import FloatSearch from "@/components/app/FloatSearch";
import { searchMatches } from "@/lib/search-match";

/**
 * VIEWINGS (3 Oct 2026), the app's own page - James: "build the viewings page
 * next". The agent's own viewings from the same diary Home's tile counts
 * (/api/diary through loadDiary: fourteen days back, ninety ahead), drawn like
 * Leads and Applications: the same header, four tabs, search, and rows
 * grouped under the day they fall on.
 *
 * "7 Days" is exactly Home's figure: today and the six days after it. Past
 * viewings carry their feedback, so the ones REX holds nothing for read
 * "Feedback Due". A row opens the appointment screen (/agent/event), which
 * already has the viewer, the access, the tenants, the landlord and Scan ID.
 * READ ONLY - booking and moving viewings stays on the desk for now.
 */

type Tab = "today" | "week" | "later" | "past";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 Days" },
  { id: "later", label: "Later" },
  { id: "past", label: "Past" },
];

function inTab(a: Appt, t: Tab): boolean {
  if (t === "today") return a.day === 0;
  if (t === "week") return a.day >= 0 && a.day <= 6;
  if (t === "later") return a.day > 6;
  return a.day < 0;
}

function dayDate(offset: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

function dayHeading(offset: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return dayDate(offset).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export default function PhoneViewings() {
  const router = useRouter();
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("week");
  const [needle, setNeedle] = useState("");

  const load = () => {
    setError(null);
    setAppts(null);
    loadDiary()
      .then(({ appts, note }) => {
        setAppts(appts.filter((a) => a.kind === "viewing" && !a.allDay));
        setNote(note);
      })
      .catch((e: Error) => setError(e.message || "Your viewings did not load."));
  };

  useEffect(() => {
    load();
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "today" || t === "later" || t === "past") setTab(t);
  }, []);

  /* Grouped by day: soonest first ahead, most recent first behind. */
  const groups = useMemo(() => {
    const n = needle.trim();
    const hits = (appts ?? []).filter((a) => inTab(a, tab) && (!n || searchMatches(n, a.who, a.where, a.what)));
    const past = tab === "past";
    hits.sort((x, y) => (past ? y.day - x.day || y.start.localeCompare(x.start) : x.day - y.day || x.start.localeCompare(y.start)));
    const out: Array<{ day: number; rows: Appt[] }> = [];
    for (const a of hits) {
      const last = out[out.length - 1];
      if (last && last.day === a.day) last.rows.push(a);
      else out.push({ day: a.day, rows: [a] });
    }
    return out;
  }, [appts, tab, needle]);

  const count = groups.reduce((s, g) => s + g.rows.length, 0);
  const due = tab === "past" ? groups.reduce((s, g) => s + g.rows.filter((a) => a.feedback === null).length, 0) : 0;
  const now = nowHm();

  return (
    <main>
      <TopBar />

      <HomeHero title="Viewings" line="Who you are showing round, and where." src="/illustrations/app/home-bungalow.webp" />

      <div className="relative z-[1] -mt-5 flex">
        <FloatSearch
          value={needle}
          onChange={setNeedle}
          placeholder="Viewer or address..."
          items={appts ? groups.flatMap((g) => g.rows.map((a) => ({ key: a.id, title: a.who || "No viewer named", line: `${dayHeading(g.day)} ${a.start} · ${a.where || a.what}`, onPick: () => router.push(`/agent/event/${encodeURIComponent(a.id)}?from=viewings`) }))) : null}
        />
      </div>

      <SlideTabs className="mt-4" value={tab} onChange={setTab} options={TABS.map((t) => ({ id: t.id, label: t.label }))} />

      <p className="mt-5 px-1 text-[15px] font-medium">
        {appts ? `${count} ${count === 1 ? "Viewing" : "Viewings"}` : "Viewings"}
        {due > 0 && <span style={{ color: "var(--m-coral)" }}>{` · ${due} feedback due`}</span>}
      </p>
      {note && <p className="mt-1 px-1 text-[13px] text-muted">{note}</p>}

      {error ? (
        <div className="mt-2">
          <ErrorLine text={error} onRetry={load} />
        </div>
      ) : !appts ? (
        <Spinner label="Loading your viewings" className="py-6" />
      ) : count === 0 ? (
        <div className="mt-2 flex flex-col items-center rounded-[22px] px-6 py-8 text-center" style={{ background: "var(--m-card)" }}>
          <img src="/illustrations/app/empty-armchair.webp" alt="" className="h-[120px] w-auto" />
          <p className="mt-2 text-[16px] font-medium">Nothing Here</p>
          <p className="mt-1 text-[14px] text-muted">{needle.trim() ? `No viewing matches "${needle.trim()}".` : tab === "today" ? "No viewings booked today." : "No viewings in this group."}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.day}>
            <p className="m-eyebrow mb-2 mt-5 px-1">{dayHeading(g.day)}</p>
            <ul className="grid grid-cols-1 gap-2.5">
              {g.rows.map((a) => (
                <li key={a.id}>
                  <Row a={a} done={g.day < 0 || (g.day === 0 && endOf(a) <= now)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

function Row({ a, done }: { a: Appt; done: boolean }) {
  /* Past rows say where the feedback stands; ahead, only the unusual. */
  const chip =
    a.day < 0
      ? a.feedback === null
        ? { text: "Feedback Due", bg: "var(--m-pink-wash)", ink: "var(--m-coral)" }
        : { text: cap(feedbackLabel(a.feedback)), bg: "var(--m-green-wash)", ink: "var(--m-sage-ink)" }
      : a.unaccompanied
        ? { text: "Unaccompanied", bg: "var(--m-fill)", ink: "var(--m-muted)" }
        : done
          ? { text: "Done", bg: "var(--m-fill)", ink: "var(--m-muted)" }
          : null;
  return (
    <Link
      data-morph
      href={`/agent/event/${encodeURIComponent(a.id)}?from=viewings`}
      className="m-press flex w-full items-center gap-3.5 rounded-[22px] px-4 py-3.5"
      style={{ background: "var(--m-card)" }}
    >
      <span
        className="flex h-[52px] w-[58px] shrink-0 flex-col items-center justify-center rounded-[16px]"
        style={done ? { background: "var(--m-fill)", color: "var(--m-muted)" } : { background: "var(--m-green-wash)", color: "var(--m-sage-ink)" }}
      >
        <span className="text-[16px] font-semibold leading-none">{a.start}</span>
        <span className="mt-1 text-[11.5px] leading-none">{a.mins} min</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="m-title block truncate text-[18px]">{a.who || "No viewer named"}</span>
        <span className="mt-0.5 block truncate text-[14px] text-muted">{a.where || a.what}</span>
        {/* Its own line, so a name is never cut short by the chip. */}
        {chip && (
          <span className="mt-1.5 inline-block whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: chip.bg, color: chip.ink }}>
            {chip.text}
          </span>
        )}
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-on-card)" }}>
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}

const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
