"use client";

import { useCallback, useEffect, useState } from "react";
import { LOOK_LEVELS, type LookLevel, type LookScreen } from "@/lib/new-look";

/**
 * The new look, screen by screen (lib/new-look). Each reskinned screen has its
 * own position, so the team meets one new screen at a time and any of them can
 * be put back the way it was with one press.
 */

type Row = { id: LookScreen; label: string; what: string; level: LookLevel; changedBy: string | null; changedAt: string | null };

export default function NewLookSwitches() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/new-look", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((j: { screens: Row[] }) => setRows(j.screens))
      .catch(() => setFlash("The new-look switches could not be read."));
  }, []);
  useEffect(load, [load]);

  async function move(screen: LookScreen, level: LookLevel) {
    setBusy(screen);
    setFlash(null);
    try {
      const r = await fetch("/api/admin/new-look", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ screen, level }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "That did not save.");
      setRows(j.screens);
      /* This browser's kept answer is now out of date: drop it, so the next
         page load asks again instead of painting yesterday's choice. */
      try {
        window.localStorage.removeItem("os-new-look-v1");
      } catch {
        /* fine */
      }
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="fade-up mt-8 rounded-[22px] border border-line/60 bg-white p-5">
      <h2 className="hand text-[18px]">The New Look</h2>
      <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
        The redesign, one screen at a time. Each screen keeps its old look until you move it, and
        moves back with one press. It changes what people see, never what a button does.
      </p>
      {flash && <p className="mt-3 text-[12px] text-accent-dark">{flash}</p>}
      {!rows ? (
        <p className="mt-4 text-[12.5px] text-muted">Loading…</p>
      ) : (
        <ul className="mt-4 divide-y divide-line/60">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3.5">
              <span className="min-w-0 flex-1 basis-[300px]">
                <span className="block text-[13px] font-semibold">{r.label}</span>
                <span className="block text-[11.5px] leading-snug text-muted">{r.what}</span>
                {r.changedBy && (
                  <span className="mt-0.5 block text-[10.5px] text-muted">
                    Last moved by {r.changedBy}
                    {r.changedAt ? `, ${new Date(r.changedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                  </span>
                )}
              </span>
              <span className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={r.label}>
                {LOOK_LEVELS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={r.level === l.id}
                    title={l.says}
                    disabled={busy === r.id}
                    onClick={() => r.level !== l.id && void move(r.id, l.id)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                      r.level === l.id ? "border-ink bg-ink text-page" : "border-line text-muted hover:border-ink/40 hover:text-ink"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
