"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * What's armed — the page that turns sending on and off.
 *
 * James, 29 Aug: "rather than me having to go in and do variables, I should
 * have toggles in my settings... at the moment I'm going to have to sit down on
 * the day it goes live and type in a tonne of variables."
 *
 * ── Why this is not on the Wiring page ────────────────────────────────────
 *
 * Wiring says of itself: "This page reports; it never changes anything - a page
 * that could arm a send is a page that can arm one by accident." That is still
 * right, so it keeps reporting and this does the arming. Two pages, two jobs:
 * one you can leave open on a call, one you cannot.
 *
 * ── Arming is deliberately harder than disarming ──────────────────────────
 *
 * Turning something ON asks you to type a phrase, checked on the server rather
 * than here. Turning it OFF is one click. The costs are not symmetrical: a
 * hasty off is a missed morning, a hasty on is mail nobody can unsend.
 *
 * ── It says WHO receives something ────────────────────────────────────────
 *
 * Every switch names its audience, because that is the fact worth reading twice
 * and the one a label like "campaign sending" hides completely. One of these
 * writes to landlords with no agent in the loop, and it should be impossible to
 * arm that without having read so.
 */

type SwitchState = {
  key: string;
  label: string;
  what: string;
  who: string;
  confirm: string;
  legacyEnv: string;
  on: boolean;
  fromEnv: boolean;
  changedBy: string | null;
  changedAt: string | null;
};

export default function AdminSwitches() {
  const [rows, setRows] = useState<SwitchState[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [denied, setDenied] = useState(false);
  const [arming, setArming] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/switches")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((d: { switches: SwitchState[]; locked: boolean }) => {
        setRows(d.switches);
        setLocked(d.locked);
      })
      .catch(() => setDenied(true));
  }, []);
  useEffect(load, [load]);

  async function change(key: string, on: boolean, phrase: string) {
    setBusy(true);
    setFlash(null);
    try {
      const r = await fetch("/api/admin/switches", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, on, typed: phrase }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (j.ok) {
        setFlash(on ? "Armed." : "Turned off.");
        setArming(null);
        setTyped("");
        load();
      } else {
        setFlash(j.error ?? "That didn't work.");
      }
    } catch {
      setFlash("That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (denied) {
    return (
      <div className="py-16 text-center">
        <p className="hand text-[20px]">Nothing here</p>
      </div>
    );
  }
  if (!rows) return <p className="text-[12.5px] text-muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Switches"
        blurb="What the system is allowed to send. Nothing here is on until you turn it on."
      />

      {locked && (
        <p className="fade-up mt-6 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px] leading-relaxed">
          <span className="font-semibold">Everything is held by SENDING_LOCKED.</span> That
          variable is set in Railway and overrides every switch below, whatever they say.
          It is the brake for when something has gone wrong and it cannot be released from
          in here - clear it in Railway.
        </p>
      )}

      {flash && (
        <p className="fade-up mt-4 rounded-xl border border-line/80 bg-panel p-3 text-[12.5px]">
          {flash}
        </p>
      )}

      <ul className="fade-up mt-6 space-y-2">
        {rows.map((s) => (
          <li key={s.key} className="rounded-2xl border border-line/80 bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13.5px]">{s.label}</span>
              <Pill tone={s.on ? "accent" : "neutral"}>{s.on ? "on" : "off"}</Pill>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{s.what}</p>
            <p className="mt-1 text-[12px] leading-relaxed">
              <span className="text-muted">Goes to: </span>
              <span className="font-medium">{s.who}</span>
            </p>

            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {s.fromEnv ? (
                <>
                  Still decided by <span className="font-semibold">{s.legacyEnv}</span> in
                  Railway. The first time you use this toggle it takes over.
                </>
              ) : (
                <>
                  Last changed by {s.changedBy || "somebody"}
                  {s.changedAt ? ` on ${new Date(s.changedAt).toLocaleString("en-GB")}` : ""}.
                </>
              )}
            </p>

            {arming === s.key ? (
              <div className="mt-3 rounded-xl border border-accent-dark/40 bg-accent-soft/30 p-3">
                {/* Reads back WHAT it will do and WHO it reaches, rather than
                    assuming every switch sends mail — one of them writes into
                    REX and emails nobody, and "this will start sending to
                    nobody is emailed" is how a warning stops being read. */}
                <p className="text-[12px] leading-relaxed">
                  Once armed: {s.what}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed">
                  <span className="text-muted">Reaches: </span>
                  <span className="font-semibold">{s.who}</span>
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed">
                  Type <span className="font-semibold">{s.confirm}</span> to arm it.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    autoFocus
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={s.confirm}
                    className="min-w-[160px] flex-1 rounded-lg border border-line/80 bg-panel px-2.5 py-1.5 text-[12.5px]"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => change(s.key, true, typed)}
                    className="rounded-lg bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  >
                    Arm it
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setArming(null);
                      setTyped("");
                    }}
                    className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                {s.on ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => change(s.key, false, "")}
                    className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px] disabled:opacity-40"
                  >
                    Turn off
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || locked}
                    onClick={() => {
                      setArming(s.key);
                      setTyped("");
                      setFlash(null);
                    }}
                    className="rounded-lg border border-accent-dark/50 px-3 py-1.5 text-[12px] text-accent-dark disabled:opacity-40"
                  >
                    Turn on…
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Turning something off takes one click. Turning it on asks you to type the phrase,
        and that is checked on the server rather than in this page - the costs are not the
        same in both directions.
      </p>
    </>
  );
}
