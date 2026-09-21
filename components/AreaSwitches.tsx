"use client";

import { useCallback, useEffect, useState } from "react";
import { AREA_LEVELS, type AreaLevel } from "@/lib/area-map";

/**
 * The area switches, on Admin, Switches.
 *
 * One row per screen, four positions, and the testers underneath. Moving a
 * position is one click with no typed phrase: it changes what a colleague can
 * see and do, not what reaches a customer - the send switches below keep their
 * confirmations. The scoped pilot's switch ladder says which to move, and when.
 */

type Area = {
  id: string;
  label: string;
  phase: 1 | 2;
  canHide: boolean;
  parent: string | null;
  level: AreaLevel;
  changedBy: string | null;
  changedAt: string | null;
};
/* What each position means for a single button rather than a whole screen. */
const BUTTON_SAYS: Record<AreaLevel, string> = {
  hidden: "The button is not there for agents.",
  look: "Agents see the button, and it will not press.",
  practice: "It presses on an agent's own test file, and nowhere else.",
  testers: "Testers can press it. Every other agent sees it and cannot.",
  everyone: "Live for every agent.",
};

type Tester = { email: string; addedBy: string; addedAt: string };

export default function AreaSwitches() {
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [testers, setTesters] = useState<Tester[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/areas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then((j: { areas: Area[]; testers: Tester[] }) => {
        setAreas(j.areas);
        setTesters(j.testers);
      })
      .catch(() => setFlash("The area switches could not be read."));
  }, []);
  useEffect(load, [load]);

  async function call(method: "PATCH" | "POST" | "DELETE", body: Record<string, string>, key: string) {
    setBusy(key);
    setFlash(null);
    try {
      const r = await fetch("/api/admin/areas", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; areas?: Area[]; testers?: Tester[] };
      if (!j.ok) return setFlash(j.error ?? "That did not save.");
      if (j.areas) setAreas(j.areas);
      if (j.testers) setTesters(j.testers);
      if (method === "PATCH") setFlash("Saved. Agents see it within a few seconds, on their next click.");
    } catch {
      setFlash("That did not save - the connection dropped.");
    } finally {
      setBusy(null);
    }
  }

  if (!areas) return <p className="mt-6 text-[12.5px] text-muted">{flash ?? "Reading the areas…"}</p>;

  return (
    <section className="fade-up mt-6">
      <h2 className="text-[17px]">Areas</h2>
      <p className="mt-1 max-w-[70ch] text-[12.5px] leading-relaxed text-muted">
        How far each screen is switched on for agents. Kirstie, Michael and marketing keep their own screens whatever
        these say, and you always see everything. An area nobody has set is on for everyone.
      </p>

      {flash && <p className="mt-3 rounded-[14px] border border-line/60 bg-white p-2.5 text-[12px]">{flash}</p>}

      <ul className="mt-3 space-y-2">
        {areas.map((a) => (
          <li key={a.id} className={`rounded-[18px] border border-line/50 bg-white p-3.5 ${a.parent ? "ml-6 border-dashed" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[13.5px]">{a.label}</span>
                <span className="ml-2 text-[10.5px] uppercase tracking-wider text-muted">
                  {a.parent ? `Button in ${areas.find((x) => x.id === a.parent)?.label ?? a.parent}` : a.phase === 1 ? "Core" : "Secondary"}
                </span>
                <p className="mt-0.5 text-[11px] text-muted">
                  {a.changedAt
                    ? `${AREA_LEVELS.find((l) => l.id === a.level)?.label} since ${new Date(a.changedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, by ${a.changedBy || "somebody"}`
                    : "Never set, so on for everyone"}
                </p>
                {a.parent && (
                  <p className="mt-0.5 text-[11px] text-muted">
                    {BUTTON_SAYS[a.level]} Never further on than {areas.find((x) => x.id === a.parent)?.label ?? "its screen"}.
                  </p>
                )}
              </div>
              {/* A segmented control rather than a dropdown: the position is the
                  one thing worth reading at a glance down the list. */}
              <div role="radiogroup" aria-label={`${a.label} position`} className="flex overflow-hidden rounded-lg border border-line/80">
                {AREA_LEVELS.map((l) => {
                  const disabled = busy !== null || (l.id === "hidden" && !a.canHide);
                  const on = a.level === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      title={l.id === "hidden" && !a.canHide ? "The dashboard is where everybody lands, so it cannot be hidden." : a.parent ? BUTTON_SAYS[l.id] : l.says}
                      disabled={disabled}
                      onClick={() => !on && call("PATCH", { area: a.id, level: l.id }, a.id)}
                      className={`border-l border-line/80 px-3 py-1.5 text-[11.5px] first:border-l-0 disabled:opacity-35 ${
                        on ? "bg-ink font-semibold text-page" : "bg-white text-muted hover:text-ink"
                      }`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-[18px] border border-line/50 bg-white p-3.5">
        <p className="text-[13.5px]">Testers</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
          Where an area is set to Testers, these people can act in it and every other agent can only look.
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {testers.map((t) => (
            <li key={t.email} className="flex items-center gap-2 rounded-full border border-line/80 py-1 pl-3 pr-1 text-[12px]">
              {t.email}
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => call("DELETE", { email: t.email }, t.email)}
                aria-label={`Stop ${t.email} being a tester`}
                className="rounded-full px-2 text-muted hover:text-ink disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
          {!testers.length && <li className="text-[12px] text-muted">Nobody yet.</li>}
        </ul>
        <form
          className="mt-2.5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) void call("POST", { email: email.trim() }, "tester").then(() => setEmail(""));
          }}
        >
          <input
            id="area-tester-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="howard@…"
            className="min-w-[200px] flex-1 rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12.5px]"
          />
          <button type="submit" disabled={busy !== null || !email.trim()} className="rounded-lg border border-line/80 px-3 py-1.5 text-[12px] disabled:opacity-40">
            Add tester
          </button>
        </form>
      </div>

      <h2 className="mt-8 text-[17px]">What the system can send and write</h2>
    </section>
  );
}
