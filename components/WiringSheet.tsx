"use client";

import { useEffect, useState } from "react";
import { WIRING, WIRING_STATES, type WiringState } from "@/lib/wiring";

/**
 * The wiring sheet: what's actually connected.
 *
 * Two halves:
 *  - a LIVE strip at the top — the server probes REX right now, on this
 *    environment's credentials, and reports what it could genuinely reach
 *  - the ledger below — the settled knowledge, grouped by area, each row
 *    with an honest state (working / confirmed / needs a test / blocked)
 */

interface LiveCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

interface LiveResult {
  configured: boolean;
  note?: string;
  checks: LiveCheck[];
}

export default function WiringSheet() {
  const [live, setLive] = useState<LiveResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gone = false;
    fetch("/api/rex/wiring")
      .then((r) => r.json())
      .then((j) => { if (!gone) { setLive(j); setLoading(false); } })
      .catch(() => { if (!gone) { setLive(null); setLoading(false); } });
    return () => { gone = true; };
  }, []);

  const areas = Array.from(new Set(WIRING.map((r) => r.area)));

  return (
    <div className="max-w-3xl">
      {/* ── The live strip ── */}
      <div className="rounded-2xl border border-line/70 p-5">
        <p className="text-[14px] font-semibold">Right now, against the real REX</p>
        <p className="mt-0.5 text-[11px] text-muted">
          {loading
            ? "Asking REX what this environment can reach…"
            : live?.configured
              ? "Probed live just now, on this environment's credentials. All read-only."
              : (live?.note ?? "Couldn't reach the check endpoint.")}
        </p>
        {loading && (
          <div className="mt-4 flex items-center gap-2 text-[12px] text-muted">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
            Checking sign-in, leads, portals, publish, uploads, webhooks…
          </div>
        )}
        {!loading && live?.configured && (
          <ul className="mt-4 space-y-2.5">
            {live.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2.5">
                <span
                  className="mt-[3px] inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.ok ? "#4c9a6e" : "#c05f5f" }}
                />
                <span className="text-[12.5px] leading-snug">
                  <span className="font-semibold">{c.label}</span>
                  <span className="text-muted"> — {c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {!loading && live && !live.configured && (
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            The REX variables aren&apos;t on this environment yet — once they land on
            Railway this strip lights up by itself.
          </p>
        )}
      </div>

      {/* ── The legend ── */}
      <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5">
        {(Object.keys(WIRING_STATES) as WiringState[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[10.5px] text-muted">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: WIRING_STATES[s].tone }}
            />
            {WIRING_STATES[s].label}
          </span>
        ))}
      </div>

      {/* ── The ledger ── */}
      {areas.map((area) => (
        <div key={area} className="mt-6">
          <h3 className="text-[16px]">{area}</h3>
          <ul className="mt-2 space-y-2">
            {WIRING.filter((r) => r.area === area).map((r) => (
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

      <p className="mt-6 text-[10.5px] leading-relaxed text-muted">
        &quot;Needs one careful test&quot; means the method is exposed to our API user but has
        never been executed — the first run of each should be supervised, on a
        throwaway record, one at a time.
      </p>
    </div>
  );
}
