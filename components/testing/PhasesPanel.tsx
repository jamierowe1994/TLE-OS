"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The three pilot phases, as three buttons (lib/phases).
 *
 * James, 21 Sep 2026: "I just need them as really simple switches."
 *
 * Simple to press, not simple to press by accident. Each card says what the
 * phase is, then what pressing it would change RIGHT NOW - read off the live
 * switches and areas by the server, not remembered by this file - and takes a
 * typed word, because phase 1 emails a whole agency and phase 2 arms live
 * sends. Nothing here knows what a phase contains: it draws what
 * /api/admin/phases says, so the screen and the button cannot disagree.
 */

type Level = string;
type Preview = {
  areas: { id: string; label: string; from: Level; to: Level }[];
  switches: { key: string; label: string; from: boolean; to: boolean }[];
  roster: { email: string; name: string; rexId: string; hasAccount: boolean; invitedAt: string | null }[];
  announceTo: number;
  testFiles: number;
  sendingLocked: boolean;
};
type Phase = { id: 1 | 2 | 3; name: string; confirm: string; says: string; steps: string[]; preview: Preview };
type State = { phase: 0 | 1 | 2 | 3; at: string | null; by: string | null };
type Result = { phase: number; invited: string[]; inviteFailed: { email: string; why: string }[]; announced: number; filesRemoved: number };

const LEVEL_WORDS: Record<string, string> = {
  hidden: "Hidden", look: "Look only", practice: "Practice", testers: "Testers", everyone: "Everyone",
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "";

export default function PhasesPanel() {
  const [data, setData] = useState<{ state: State; phases: Phase[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [ticked, setTicked] = useState<Set<string> | null>(null);
  const [announce, setAnnounce] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/phases", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.ok) return setFailed(true);
        setData({ state: j.state, phases: j.phases });
        /* Everybody without an account, ticked. James unticks; nobody is
           invited that he did not leave ticked. */
        setTicked((t) => t ?? new Set((j.phases[0]?.preview.roster ?? []).filter((p: { hasAccount: boolean }) => !p.hasAccount).map((p: { email: string }) => p.email)));
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  async function press(p: Phase) {
    setBusy(p.id);
    setSaid(null);
    setResult(null);
    const j = await fetch("/api/admin/phases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phase: p.id, typed: typed[p.id] ?? "", invite: p.id === 1 ? [...(ticked ?? [])] : [], announce }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(null);
    if (j?.ok) {
      setResult(j.result);
      setSaid({ ok: true, text: `Phase ${p.id} is on.` });
      setTyped({});
      load();
    } else {
      setSaid({ ok: false, text: j?.error ?? "That did not go through. Nothing may have changed - check Admin, Switches." });
    }
  }

  if (failed) return <p className="mt-6 text-[12.5px] text-accent-dark">The phases could not be read. Nothing has been changed.</p>;
  if (!data) return <p className="mt-6 text-[12.5px] text-muted">Reading the switches and areas…</p>;

  const here = data.state.phase;

  return (
    <div className="mt-6">
      <div className="rounded-2xl border border-line/80 bg-panel p-4">
        <p className="text-[13px] font-semibold">
          {here === 0 ? "The pilot has not started." : `The pilot is in Phase ${here}.`}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          {here === 0
            ? "Nobody has been moved on by a phase yet. The switches and areas are as you last set them by hand."
            : `Started ${when(data.state.at)} by ${data.state.by}.`}{" "}
          Each phase sets Admin, Switches for you. You and Howard are owners, so none of this locks either of you out.
        </p>
      </div>

      {said && (
        <div className={`mt-3 rounded-2xl border p-4 text-[12.5px] leading-relaxed ${said.ok ? "border-line/80 bg-panel" : "border-accent-dark/50 bg-accent-soft/40 text-accent-dark"}`}>
          <p className="font-semibold">{said.text}</p>
          {result && (
            <ul className="mt-1.5 space-y-0.5 text-muted">
              {result.phase === 1 && <li>{result.invited.length} invited by email.</li>}
              {result.inviteFailed.map((f) => (
                <li key={f.email} className="text-accent-dark">{f.email}: {f.why}. Use Get a link on Pre-launch for this one.</li>
              ))}
              {result.phase === 2 && <li>{result.filesRemoved} test files removed.</li>}
              {result.phase !== 1 && <li>{result.announced} people told by email.</li>}
            </ul>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {data.phases.map((p) => {
          const current = here === p.id;
          const nothing = p.preview.areas.length === 0 && p.preview.switches.length === 0;
          const ready = (typed[p.id] ?? "").trim().toUpperCase() === p.confirm;
          const inviting = p.id === 1 ? (ticked?.size ?? 0) : 0;
          return (
            <section
              key={p.id}
              className={`flex flex-col rounded-2xl border p-5 ${current ? "border-accent-dark bg-accent-soft/30" : "border-line/80 bg-panel"}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[17px]">Phase {p.id} - {p.name}</h2>
                {current && (
                  <span className="rounded-full bg-accent-dark px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">You are here</span>
                )}
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{p.says}</p>

              <ol className="mt-3.5 space-y-1.5">
                {p.steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-[12px] leading-relaxed">
                    <span className="mt-[1px] grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full bg-[var(--brown)] text-[9.5px] font-semibold text-white">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 rounded-xl border border-line/70 bg-box p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">What pressing it changes right now</p>
                {nothing ? (
                  <p className="mt-1.5 text-[11.5px] text-muted">Nothing: every switch and area is already where this phase puts it.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1 text-[11.5px]">
                    {p.preview.switches.map((s) => (
                      <li key={s.key} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate">{s.label}</span>
                        <span className={`shrink-0 font-semibold ${s.to ? "text-accent-dark" : ""}`}>{s.from ? "On" : "Off"} → {s.to ? "ON" : "Off"}</span>
                      </li>
                    ))}
                    {p.preview.areas.map((a) => (
                      <li key={a.id} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate">{a.label}</span>
                        <span className="shrink-0 text-muted">{LEVEL_WORDS[a.from] ?? a.from} → <span className="font-semibold text-ink">{LEVEL_WORDS[a.to] ?? a.to}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
                {p.id === 2 && p.preview.testFiles > 0 && (
                  <p className="mt-2 border-t border-line/60 pt-2 text-[11.5px]">{p.preview.testFiles} test files will be removed, including your own.</p>
                )}
                {p.preview.sendingLocked && Object.values(p.preview.switches).some((s) => s.to) && (
                  <p className="mt-2 border-t border-line/60 pt-2 text-[11.5px] text-accent-dark">SENDING_LOCKED is set on Railway, so this phase will be refused until it is cleared.</p>
                )}
              </div>

              {p.id === 1 && (
                <div className="mt-3 rounded-xl border border-line/70 bg-box p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">Who is invited ({inviting})</p>
                    <button
                      type="button"
                      onClick={() => setTicked((t) => (t && t.size ? new Set() : new Set(p.preview.roster.filter((r) => !r.hasAccount).map((r) => r.email))))}
                      className="text-[11px] text-muted underline underline-offset-2 hover:text-ink"
                    >
                      {ticked && ticked.size ? "Untick all" : "Tick all"}
                    </button>
                  </div>
                  {p.preview.roster.length === 0 ? (
                    <p className="mt-1.5 text-[11.5px] text-muted">The lettings roster could not be read, so nobody would be invited.</p>
                  ) : (
                    <ul className="mt-1.5 max-h-[220px] space-y-0.5 overflow-y-auto pr-1">
                      {p.preview.roster.map((r) => (
                        <li key={r.email}>
                          <label className={`flex items-center gap-2 rounded-lg px-1 py-1 text-[11.5px] ${r.hasAccount ? "text-muted" : "cursor-pointer hover:bg-panel"}`}>
                            <input
                              type="checkbox"
                              disabled={r.hasAccount}
                              checked={!r.hasAccount && Boolean(ticked?.has(r.email))}
                              onChange={(e) =>
                                setTicked((t) => {
                                  const next = new Set(t ?? []);
                                  if (e.target.checked) next.add(r.email);
                                  else next.delete(r.email);
                                  return next;
                                })
                              }
                              className="h-3.5 w-3.5 accent-[var(--accent-dark)]"
                            />
                            <span className="min-w-0 flex-1 truncate">{r.name}</span>
                            <span className="shrink-0 text-[10.5px] text-muted">
                              {r.hasAccount ? "has an account" : r.invitedAt ? "invited before, sent again" : ""}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                    Our invitations sometimes land in Microsoft quarantine. Anybody who does not get theirs: Pre-launch, Get a link.
                  </p>
                </div>
              )}

              {p.id !== 1 && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11.5px]">
                  <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent-dark)]" />
                  Email the {p.preview.announceTo} {p.preview.announceTo === 1 ? "agent" : "agents"} with an account to say it has started
                </label>
              )}

              <div className="mt-auto pt-4">
                <input
                  value={typed[p.id] ?? ""}
                  onChange={(e) => setTyped((t) => ({ ...t, [p.id]: e.target.value }))}
                  placeholder={`Type ${p.confirm}`}
                  autoComplete="off"
                  className="w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] uppercase outline-none placeholder:normal-case focus:border-ink"
                />
                <button
                  type="button"
                  disabled={!ready || busy !== null}
                  onClick={() => void press(p)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--brown)] py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-35"
                >
                  {!ready && <DoodleIcon name="lock" size={12} />}
                  {busy === p.id
                    ? p.id === 1 ? "Locking down, then inviting…" : "Working…"
                    : current ? `Set Phase ${p.id} again` : `Start Phase ${p.id}`}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
