"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * The pre-launch pilot.
 *
 * Three questions on one screen, because they are the same question asked
 * three ways: is this thing ready?
 *
 *   who is on it      — pick from REX, invite, watch them accept
 *   what do they use  — and, more usefully, what has nobody EVER opened
 *   what is broken    — straight from the button in their corner
 *
 * Adding somebody and emailing them are deliberately separate acts, so a list
 * can be built up over a week and fired in one go — and so a mis-click adds a
 * row rather than an email somebody has to be told to ignore.
 */

type Candidate = {
  rexId: string;
  name: string;
  email: string;
  invited: boolean;
  sentAt: string | null;
  hasAccount: boolean;
};
type Usage = { path: string; label: string; views: number; people: number; lastAt: string | null };
type Bug = {
  id: string;
  reporterEmail: string;
  body: string;
  path: string;
  kind: string;
  state: string;
  createdAt: string;
};

const when = (iso: string | null) =>
  !iso
    ? "—"
    : new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

export default function PreLaunch() {
  const [d, setD] = useState<{ candidates: Candidate[]; usage: Usage[]; bugs: Bug[] } | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/pilot")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then(setD)
      .catch(() => setDenied(true));
  }, []);
  useEffect(load, [load]);

  async function invite(c: Candidate, send: boolean) {
    setBusy(c.email);
    const r = await fetch("/api/admin/pilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: c.email, name: c.name, rexUserId: c.rexId, send }),
    });
    const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
    setBusy(null);
    setFlash(j.ok ? (j.message ?? "Done.") : (j.error ?? "That didn't work."));
    load();
  }

  async function setBug(id: string, state: string) {
    await fetch("/api/bugs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, state }),
    });
    load();
  }

  if (denied) {
    return (
      <div className="py-16 text-center">
        <p className="hand text-[20px]">Nothing here</p>
      </div>
    );
  }
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;

  const unused = d.usage.filter((u) => u.views === 0);
  const onPilot = d.candidates.filter((c) => c.invited);

  return (
    <>
      <PageHeader title="Pre-launch" blurb="Who's testing, what they use, and what they've found." />

      {flash && (
        <p className="fade-up mt-8 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">
          {flash}
        </p>
      )}

      <div className="fade-up mt-8 grid gap-3 sm:grid-cols-4">
        {(
          [
            ["On the pilot", onPilot.length],
            ["Signed up", d.candidates.filter((c) => c.hasAccount).length],
            ["Tabs never opened", unused.length],
            ["Open reports", d.bugs.length],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line/80 bg-panel p-4">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</p>
            <p className="figures mt-1.5 text-[24px] leading-none">{v}</p>
          </div>
        ))}
      </div>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Who&apos;s on it</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          Adding somebody doesn&apos;t email them. Send the invite when you&apos;re ready.
        </p>
        <ul className="mt-3.5 space-y-2">
          {d.candidates.map((c) => (
            <li
              key={c.email}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 p-3"
            >
              <span className="min-w-0">
                <span className="text-[13px]">{c.name}</span>
                <span className="ml-2 text-[11.5px] text-muted">{c.email}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {c.hasAccount ? (
                  <Pill tone="accent">Signed up</Pill>
                ) : c.sentAt ? (
                  <Pill tone="neutral">Invited {when(c.sentAt)}</Pill>
                ) : c.invited ? (
                  <Pill tone="neutral">On the list</Pill>
                ) : null}
                {!c.hasAccount && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => invite(c, c.invited)}
                    className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40"
                  >
                    {c.invited ? "Send invite" : "Add to pilot"}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">What they actually use</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          The zeroes are the point. A tab nobody has opened is either a feature nobody needs or
          one nobody can find — and both are worth knowing before launch.
        </p>
        <ul className="mt-3.5 space-y-1">
          {d.usage.map((u) => (
            <li
              key={u.path}
              className="flex items-baseline justify-between gap-3 border-b border-line/40 py-1.5 text-[12px]"
            >
              <span className={u.views === 0 ? "text-accent-dark" : ""}>{u.label}</span>
              <span className="shrink-0 text-muted">
                {u.views === 0
                  ? "never opened"
                  : `${u.views} views · ${u.people} ${u.people === 1 ? "person" : "people"} · ${when(u.lastAt)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">What they&apos;ve found</h2>
        {d.bugs.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Nothing reported yet. The button sits in the bottom-right of every screen.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.bugs.map((b) => (
              <li key={b.id} className="rounded-xl border border-line/70 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[12.5px]">
                    <Pill tone={b.kind === "bug" ? "accent" : "neutral"}>{b.kind}</Pill>
                    <span className="ml-2 text-muted">
                      {b.reporterEmail} on {b.path || "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{when(b.createdAt)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">{b.body}</p>
                <div className="mt-2 flex gap-2">
                  {(["ack", "fixed", "wontfix"] as const)
                    .filter((s) => s !== b.state)
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setBug(b.id, s)}
                        className="rounded-lg border border-line/80 px-2.5 py-1 text-[11px]"
                      >
                        {s === "ack" ? "Seen it" : s === "fixed" ? "Fixed" : "Won't fix"}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
