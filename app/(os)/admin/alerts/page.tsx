"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import type { AlertRule, AlertTypeDef } from "@/lib/alert-types";

/**
 * Phone alerts, kind by kind (5 Oct 2026).
 *
 * James: "I need to be able to control what notifications come through, and
 * I think we should also allow them to control what notifications come
 * through on the app." Each kind has three settings:
 *
 *   Off        nobody's phone gets it
 *   On         everybody's does, and each person may switch it off for their
 *              own phone (app > Profile > Choose Your Alerts)
 *   Always     everybody's does, and nobody may switch it off
 *
 * The master switch (Switches > Phone alerts) still decides whether anything
 * is sent at all; this page says so at the top rather than looking armed.
 */

type Row = AlertTypeDef & { rule: AlertRule; optedOut: number };
type Data = { armed: boolean; people: number; phones: number; types: Row[] };

const RULES: Array<{ id: AlertRule; label: string }> = [
  { id: "off", label: "Off" },
  { id: "on", label: "On" },
  { id: "always", label: "Always" },
];

export default function AdminAlerts() {
  const [data, setData] = useState<Data | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/alerts", { cache: "no-store" })
      .then((r) => {
        if (r.status === 404) {
          setDenied(true);
          return null;
        }
        return r.json();
      })
      .then((j: ({ ok?: boolean; error?: string } & Partial<Data>) | null) => {
        if (!j) return;
        if (j.ok && j.types) setData(j as Data);
        else setError(j.error ?? "The alert rules did not load.");
      })
      .catch(() => setError("The alert rules did not load."));
  }, []);
  useEffect(load, [load]);

  async function set(type: string, rule: AlertRule) {
    setBusy(type);
    setError(null);
    try {
      const r = await fetch("/api/admin/alerts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, rule }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string } & Partial<Data>;
      if (j.ok && j.types) setData(j as Data);
      else setError(j.error ?? "That did not save.");
    } catch {
      setError("That did not save.");
    } finally {
      setBusy(null);
    }
  }

  if (denied) {
    return (
      <div className="py-16 text-center">
        <p className="hand text-[20px]">Nothing here</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        illustration="/illustrations/people/happy-call.svg"
        illustrationAspect={1.0}
        lineBreak="none"
        title="Phone Alerts"
        blurb="What buzzes people's phones through the TLE OS app. Leave a kind On and each person can switch it off for themselves, or set it to Always so nobody can."
      />

      {!data && !error && (
        <div className="mt-8 flex items-center gap-2 text-[12.5px] text-muted" aria-label="Loading">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading the alert rules
        </div>
      )}

      {error && <p className="fade-up mt-4 rounded-[18px] border border-accent-dark/40 bg-accent-soft/30 p-3 text-[12.5px]">{error}</p>}

      {data && (
        <>
          <div className="fade-up mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-line/50 bg-white p-4">
            <div className="min-w-0">
              <p className="text-[13.5px]">
                {data.armed ? "Phone alerts are on" : "Phone alerts are switched off"}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                {data.armed
                  ? `Sent every five minutes. ${data.people} ${data.people === 1 ? "person has" : "people have"} alerts set up on ${data.phones} ${data.phones === 1 ? "phone" : "phones"}.`
                  : "Nothing below is sent until the Phone alerts switch is on. A test to your own phone still works."}
              </p>
            </div>
            <Link href="/admin/switches" className="shrink-0 rounded-lg border border-line/80 px-3 py-1.5 text-[12px]">
              Open Switches
            </Link>
          </div>

          <ul className="fade-up mt-4 space-y-2">
            {data.types.map((t) => (
              <li key={t.key} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[22px] border border-line/50 bg-white p-4">
                <div className="min-w-0 flex-1 basis-[280px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px]">{t.label}</span>
                    {t.rule === "on" && t.optedOut > 0 && <Pill tone="neutral">{`${t.optedOut} switched off`}</Pill>}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">{t.what}</p>
                  <p className="mt-1 text-[12px] leading-relaxed">
                    <span className="text-muted">Goes to: </span>
                    <span className="font-medium">{t.who}</span>
                  </p>
                </div>
                <div role="radiogroup" aria-label={t.label} className="flex shrink-0 rounded-full border border-line/80 p-0.5">
                  {RULES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={t.rule === r.id}
                      disabled={busy === t.key}
                      onClick={() => t.rule !== r.id && set(t.key, r.id)}
                      className={`rounded-full px-3.5 py-1.5 text-[12px] transition-colors disabled:opacity-50 ${
                        t.rule === r.id ? (r.id === "off" ? "bg-ink text-white" : "bg-accent-dark text-white") : "text-muted hover:text-ink"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            The bell on every screen still shows everything. These settings only decide what is sent to a phone.
          </p>
        </>
      )}
    </>
  );
}
