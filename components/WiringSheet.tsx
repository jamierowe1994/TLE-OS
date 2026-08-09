"use client";

import { useEffect, useState } from "react";
import { SYSTEMS, WIRING, WIRING_STATES, type SystemKey, type WiringState } from "@/lib/wiring";

/**
 * The wiring sheet: what's actually connected — PER SYSTEM.
 *
 * Each system (REX, PayProp, Storage…) gets its own card: a live strip at
 * the top where the server probes that system right now on this
 * environment's credentials, and the settled ledger underneath. Systems
 * wire up individually — one going down or missing its keys never greys
 * out another.
 */

interface LiveCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

/** One system's live status, normalised from whichever endpoint shape. */
interface LiveStatus {
  state: "loading" | "ok" | "partial" | "down" | "unconfigured" | "none";
  checks: LiveCheck[];
  note?: string;
}

function normalise(system: SystemKey, j: unknown): LiveStatus {
  if (system === "payprop") {
    const d = j as {
      configured?: boolean;
      note?: string;
      accounts?: { label: string; hasKey: boolean; checks: LiveCheck[] }[];
    };
    if (!d.configured) return { state: "unconfigured", checks: [], note: d.note };
    const checks = (d.accounts ?? []).flatMap((a) =>
      a.checks.map((c) => ({ ...c, key: `${a.label}-${c.key}`, label: `${a.label} — ${c.label}` }))
    );
    return { state: checks.every((c) => c.ok) ? "ok" : "partial", checks };
  }
  if (system === "foundations") {
    const d = j as {
      connected?: boolean;
      error?: string;
      tables?: string[];
      users?: number;
      serverVersion?: string;
      authSecretSet?: boolean;
    };
    if (!d.connected) return { state: "unconfigured", checks: [], note: d.error };
    return {
      state: d.authSecretSet ? "ok" : "partial",
      checks: [
        {
          key: "db",
          label: "Database",
          ok: true,
          detail: `${d.serverVersion ?? "Postgres"} — ${d.tables?.length ?? 0} tables, ${d.users ?? 0} people registered`,
        },
        {
          key: "authsecret",
          label: "Session signing key",
          ok: Boolean(d.authSecretSet),
          detail: d.authSecretSet
            ? "AUTH_SECRET set — sessions can be signed"
            : "AUTH_SECRET missing — sign-in can't issue tokens until it's set in Railway",
        },
      ],
    };
  }
  if (system === "storage") {
    const d = j as { ok?: boolean; bucket?: string; jurisdiction?: string; objectCount?: number; stage?: string };
    if (d.ok) {
      return {
        state: "ok",
        checks: [
          {
            key: "bucket",
            label: "Bucket answering",
            ok: true,
            detail: `${d.bucket} (${d.jurisdiction}) — ${d.objectCount ?? 0} objects visible`,
          },
        ],
      };
    }
    return {
      state: d.stage === "config" ? "unconfigured" : "down",
      checks: [],
      note:
        d.stage === "config"
          ? "Storage credentials aren't on this environment (local dev runs without them — Railway has the real set)."
          : "Credentials present but the bucket didn't answer.",
    };
  }
  // rex
  const d = j as { configured?: boolean; note?: string; checks?: LiveCheck[] };
  if (!d.configured) return { state: "unconfigured", checks: [], note: d.note };
  const checks = d.checks ?? [];
  return { state: checks.every((c) => c.ok) ? "ok" : "partial", checks };
}

const STATE_DOT: Record<LiveStatus["state"], { tone: string; label: string }> = {
  loading: { tone: "#c9c5be", label: "Checking…" },
  ok: { tone: "#4c9a6e", label: "All answering" },
  partial: { tone: "#c9a24c", label: "Partly connected" },
  down: { tone: "#c05f5f", label: "Not answering" },
  unconfigured: { tone: "#c05f5f", label: "No keys here yet" },
  none: { tone: "#8a867f", label: "Nothing to probe" },
};

export default function WiringSheet() {
  const [live, setLive] = useState<Partial<Record<SystemKey, LiveStatus>>>({});
  const [open, setOpen] = useState<SystemKey | null>("rex");

  useEffect(() => {
    let gone = false;
    for (const sys of SYSTEMS) {
      if (!sys.endpoint) {
        setLive((cur) => ({ ...cur, [sys.key]: { state: "none", checks: [] } }));
        continue;
      }
      setLive((cur) => ({ ...cur, [sys.key]: { state: "loading", checks: [] } }));
      fetch(sys.endpoint)
        .then((r) => r.json())
        .then((j) => { if (!gone) setLive((cur) => ({ ...cur, [sys.key]: normalise(sys.key, j) })); })
        .catch(() => {
          if (!gone) setLive((cur) => ({ ...cur, [sys.key]: { state: "down", checks: [], note: "The check endpoint didn't answer." } }));
        });
    }
    return () => { gone = true; };
  }, []);

  return (
    <div className="max-w-3xl">
      {/* ── The legend ── */}
      <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1.5">
        {(Object.keys(WIRING_STATES) as WiringState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: WIRING_STATES[s].tone }} />
            {WIRING_STATES[s].label}
          </span>
        ))}
      </div>

      <div className="space-y-4">
        {SYSTEMS.map((sys) => {
          const status = live[sys.key] ?? { state: "loading" as const, checks: [] };
          const dot = STATE_DOT[status.state];
          const rows = WIRING.filter((r) => r.system === sys.key);
          const areas = Array.from(new Set(rows.map((r) => r.area)));
          const isOpen = open === sys.key;
          return (
            <div key={sys.key} className="overflow-hidden rounded-2xl border border-line/70">
              {/* ── The system header: name, blurb, live dot. ── */}
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : sys.key)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-box"
              >
                <span>
                  <span className="text-[16px] font-semibold">{sys.label}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted">{sys.blurb}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${status.state === "loading" ? "animate-pulse" : ""}`}
                    style={{ backgroundColor: dot.tone }}
                  />
                  <span className="text-[11px] font-semibold text-muted">{dot.label}</span>
                  <span className="ml-1 text-[12px] text-muted">{isOpen ? "−" : "+"}</span>
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-line/60 px-5 pb-5">
                  {/* ── The live strip. ── */}
                  {sys.endpoint && (
                    <div className="mt-4 rounded-xl border border-line/60 bg-box p-4">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
                        Right now, on this environment&apos;s credentials
                      </p>
                      {status.state === "loading" && (
                        <p className="mt-2 flex items-center gap-2 text-[12px] text-muted">
                          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
                          Probing…
                        </p>
                      )}
                      {status.checks.length > 0 && (
                        <ul className="mt-2.5 space-y-2">
                          {status.checks.map((c) => (
                            <li key={c.key} className="flex items-start gap-2.5">
                              <span
                                className="mt-[3px] inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: c.ok ? "#4c9a6e" : "#c05f5f" }}
                              />
                              <span className="text-[12px] leading-snug">
                                <span className="font-semibold">{c.label}</span>
                                <span className="text-muted"> — {c.detail}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {status.state !== "loading" && !status.checks.length && (
                        <p className="mt-2 text-[12px] leading-relaxed text-muted">
                          {status.note ?? "Nothing came back."}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── The ledger. ── */}
                  {areas.map((area) => (
                    <div key={area} className="mt-5">
                      <h3 className="text-[14px]">{area}</h3>
                      <ul className="mt-2 space-y-2">
                        {rows.filter((r) => r.area === area).map((r) => (
                          <li key={r.item} className="rounded-xl border border-line/60 p-3.5">
                            <p className="flex items-start justify-between gap-3">
                              <span className="text-[12.5px] font-semibold leading-snug">{r.item}</span>
                              <span
                                className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white"
                                style={{ backgroundColor: WIRING_STATES[r.state].tone }}
                              >
                                {WIRING_STATES[r.state].label}
                              </span>
                            </p>
                            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{r.note}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-[10.5px] leading-relaxed text-muted">
        &quot;Needs one careful test&quot; means the method is exposed to our API user but has
        never been executed — the first run of each should be supervised, on a
        throwaway record, one at a time. Live dots are re-probed every time this
        tab opens.
      </p>
    </div>
  );
}
