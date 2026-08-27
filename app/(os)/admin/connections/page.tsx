"use client";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * The switches — moved here off Profile, where an agent could see them.
 *
 * Reads /api/os-health, which reports booleans and names and never a key,
 * a token or a connection string. Safe to have open while on a call.
 */

type Health = {
  db: { connected: boolean; users?: number | null; verificationsPending?: number | null };
  resend: { configured: boolean; canSend: boolean; from: string | null; verdict: string };
  rex: { configured: boolean; writesLocked: boolean };
  docuseal: { configured: boolean; canSend: boolean };
  emailPolicy: { internalDomains: string[]; note: string };
};

export default function AdminConnections() {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch("/api/os-health").then((r) => (r.ok ? r.json() : Promise.reject(new Error()))).then(setH).catch(() => setErr(true));
  }, []);

  if (err) return <p className="mt-6 text-[12.5px] text-accent-dark">Couldn&apos;t read the wiring.</p>;
  if (!h) return <p className="text-[12.5px] text-muted">Loading…</p>;

  const rows: Array<[string, boolean, string]> = [
    ["Database", h.db.connected, h.db.connected ? `${h.db.users ?? 0} accounts · ${h.db.verificationsPending ?? 0} live links` : "Not connected"],
    ["Resend (email)", h.resend.configured && h.resend.canSend, h.resend.verdict],
    ["REX", h.rex.configured, h.rex.writesLocked ? "Connected · writes LOCKED" : "Connected · writes unlocked"],
    ["DocuSeal", h.docuseal.configured, h.docuseal.configured ? (h.docuseal.canSend ? "Connected and unlocked" : "Connected, sending locked") : "Not connected"],
  ];

  return (
    <>
      <PageHeader title="Connections" blurb="What's wired up, and what's armed." />
      <ul className="fade-up mt-8 space-y-2">
        {rows.map(([name, ok, detail]) => (
          <li key={name} className="rounded-2xl border border-line/80 bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13.5px]">{name}</span>
              <Pill tone={ok ? "accent" : "neutral"}>{ok ? "on" : "off"}</Pill>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{detail}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-2xl border border-line/80 bg-panel p-4 text-[11.5px] leading-relaxed text-muted">
        <span className="font-semibold">Email from this domain goes to colleagues only</span> —
        {" "}{h.emailPolicy.internalDomains.map((d) => `@${d}`).join(", ")}. Anything else is refused
        at the send path. {h.emailPolicy.note}
      </p>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Switches live in Railway, not here. This page reports; it never changes anything — a page
        that could arm a send is a page that can arm one by accident.
      </p>
    </>
  );
}
