"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/Wire";

/**
 * Tickets: what the pilot agents raise, sorted the way James sorts it.
 *
 *   A  broken - the bot found a fault, or a person says it is
 *   B  a decision, or anything that is not plainly broken
 *   C  a recommendation
 *
 * James, 22 Sep 2026: "if it's a recommendation, it should go as a C.
 * Anything that's broken needs to go as an A, and anything else can go
 * later." The letter is set from the bot's verdict and the kind of report
 * (lib/pilot priorityFor) and changed here by hand. State is the same as on
 * Pre-launch: open, acknowledged, fixed (the reporter is told), won't fix.
 */

type Bug = {
  id: string;
  reporterEmail: string;
  body: string;
  path: string;
  kind: string;
  state: string;
  createdAt: string;
  occurrences?: number;
  lastSeenAt?: string | null;
  botState?: string;
  botNote?: string;
  botAt?: string | null;
  media?: number;
  priority: "A" | "B" | "C" | null;
};

const when = (iso: string | null | undefined) =>
  !iso ? "—" : new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const LETTERS: Array<{ id: "A" | "B" | "C"; label: string; sub: string }> = [
  { id: "A", label: "A", sub: "Broken" },
  { id: "B", label: "B", sub: "Later" },
  { id: "C", label: "C", sub: "Recommendation" },
];

const verdict = (b: Bug) =>
  b.botState === "looking" ? "Bot is looking"
  : b.botState === "to_fix" ? "Bot: cause found, to fix"
  : b.botState === "fix_ready" ? "Bot: fix ready"
  : b.botState === "needs_you" ? "Bot: needs you"
  : b.botState === "not_a_bug" ? "Bot: not a fault"
  : "";

export default function Tickets() {
  const [bugs, setBugs] = useState<Bug[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [show, setShow] = useState<"open" | "all">("open");
  const [letter, setLetter] = useState<"A" | "B" | "C" | "none" | "all">("all");

  const load = () =>
    fetch("/api/bugs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { bugs: Bug[] }) => setBugs(j.bugs))
      .catch(() => setErr("Couldn't load the tickets."));
  useEffect(() => { void load(); }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch("/api/bugs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    await load();
  }

  if (err) return <p className="mt-6 text-[12.5px] text-accent-dark">{err}</p>;
  if (!bugs) return <p className="mt-6 text-[12.5px] text-muted">Loading the tickets…</p>;

  /* People first, then what the OS logged about itself. */
  const people = bugs.filter((b) => b.kind !== "auto");
  const auto = bugs.filter((b) => b.kind === "auto");
  const pick = (list: Bug[]) =>
    list
      .filter((b) => (show === "all" ? true : b.state === "open" || b.state === "ack"))
      .filter((b) => (letter === "all" ? true : letter === "none" ? !b.priority : b.priority === letter))
      .sort((a, b) => (a.priority ?? "Z").localeCompare(b.priority ?? "Z") || b.createdAt.localeCompare(a.createdAt));
  const counts = { A: people.filter((b) => b.priority === "A" && b.state !== "fixed" && b.state !== "wontfix").length,
                   B: people.filter((b) => b.priority === "B" && b.state !== "fixed" && b.state !== "wontfix").length,
                   C: people.filter((b) => b.priority === "C" && b.state !== "fixed" && b.state !== "wontfix").length,
                   none: people.filter((b) => !b.priority && b.state !== "fixed" && b.state !== "wontfix").length };

  const row = (b: Bug) => (
    <li key={b.id} className="rounded-xl border border-line/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <Pill tone={b.priority === "A" ? "accent" : "neutral"}>{b.priority ? `${b.priority} · ${LETTERS.find((l) => l.id === b.priority)?.sub}` : "Not sorted"}</Pill>
            <Pill tone={b.state === "open" ? "accent" : "neutral"}>{b.state === "ack" ? "acknowledged" : b.state}</Pill>
            <span className="text-muted">
              {b.kind === "auto" ? `${b.path || "on the server"}${(b.occurrences ?? 1) > 1 ? ` · seen ${b.occurrences} times` : ""}` : `${b.kind} · ${b.reporterEmail || "—"} on ${b.path || "—"}`}
              {b.media ? ` · ${b.media} attached` : ""}
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">{b.body}</p>
          {b.botState && (
            <p className={`mt-1.5 text-[11.5px] leading-relaxed ${b.botState === "to_fix" || b.botState === "fix_ready" ? "text-emerald-900" : b.botState === "needs_you" ? "text-amber-900" : "text-muted"}`}>
              <span className="font-semibold">{verdict(b)}</span>
              {b.botAt ? ` · ${when(b.botAt)}` : ""}
              {b.botNote ? ` - ${b.botNote.split("\n")[0]}` : ""}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-muted">{when(b.lastSeenAt && b.lastSeenAt !== b.createdAt ? b.lastSeenAt : b.createdAt)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
        {LETTERS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => void patch(b.id, { priority: b.priority === l.id ? null : l.id })}
            className={`rounded-full border px-2.5 py-1 font-semibold transition-colors ${b.priority === l.id ? "border-ink bg-ink text-page" : "border-line/80 hover:border-ink/40"}`}
            title={l.sub}
          >
            {l.label}
          </button>
        ))}
        <span className="mx-1 text-muted">·</span>
        {(["open", "ack", "fixed", "wontfix"] as const).filter((s) => s !== b.state).map((s) => (
          <button key={s} type="button" onClick={() => void patch(b.id, { state: s })} className="rounded-full border border-line/80 px-2.5 py-1 transition-colors hover:border-ink/40">
            {s === "ack" ? "Acknowledge" : s === "fixed" ? "Fixed, tell them" : s === "wontfix" ? "Won't fix" : "Reopen"}
          </button>
        ))}
        <Link href={`/admin/pre-launch#bug-${b.id}`} className="ml-auto text-muted underline underline-offset-2">Pictures on Pre-launch</Link>
      </div>
    </li>
  );

  return (
    <>
      <h1 className="hand text-[24px] leading-tight">Tickets</h1>
      <p className="mt-1 text-[12.5px] text-muted">
        What the pilot agents raise. A is broken, C is a recommendation, B is everything else. The bot sorts a fault when it has looked; an idea is a C the moment it lands. Change a letter by pressing it.
      </p>

      <div className="fade-up mt-4 grid gap-3 sm:grid-cols-4">
        {(["A", "B", "C", "none"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setLetter(letter === k ? "all" : k)}
            className={`rounded-[18px] border p-4 text-left transition-colors ${letter === k ? "border-ink" : "border-line/50 bg-white hover:border-ink/30"}`}
          >
            <p className="text-[11px] uppercase tracking-wide text-muted">{k === "none" ? "Not sorted" : `${k} · ${LETTERS.find((l) => l.id === k)?.sub}`}</p>
            <p className="hand mt-1 text-[26px] leading-none">{counts[k]}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-[12px]">
        <button type="button" onClick={() => setShow("open")} className={`rounded-full border px-3 py-1 ${show === "open" ? "border-ink bg-ink text-page" : "border-line/80"}`}>Open</button>
        <button type="button" onClick={() => setShow("all")} className={`rounded-full border px-3 py-1 ${show === "all" ? "border-ink bg-ink text-page" : "border-line/80"}`}>Everything</button>
      </div>

      <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="hand text-[17px] leading-tight">Raised by people</h2>
        {pick(people).length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Nothing here. Steve sits in the bottom-right of every screen; what they report through him lands here.</p>
        ) : (
          <ul className="mt-3 space-y-2">{pick(people).map(row)}</ul>
        )}
      </section>

      <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="hand text-[17px] leading-tight">Logged by the OS itself</h2>
        {pick(auto).length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Nothing open.</p>
        ) : (
          <ul className="mt-3 space-y-2">{pick(auto).map(row)}</ul>
        )}
      </section>
    </>
  );
}
