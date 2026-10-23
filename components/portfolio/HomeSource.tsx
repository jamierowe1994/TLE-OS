"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * How the landlord came to us, on the home's page (Sean McMahon, 21 Oct 2026:
 * the re-let of 68 Main Street was refused because the home had no Source,
 * and nobody but the office could add one). Read from the back-office record
 * and set from a list the back office accepts (/api/homes/source).
 */
export default function HomeSource({ propertyId }: { propertyId: string | number | null | undefined }) {
  const id = propertyId != null && /^\d+$/.test(String(propertyId)) ? String(propertyId) : null;
  const [source, setSource] = useState<string | null | undefined>(undefined);
  const [options, setOptions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    fetch(`/api/homes/source?property=${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; source?: string | null; options?: string[] }) => {
        if (!live) return;
        setSource(j.ok ? (j.source ?? null) : null);
        setOptions(j.options ?? []);
      })
      .catch(() => live && setSource(null));
    return () => {
      live = false;
    };
  }, [id]);

  if (!id) return null;

  async function pick(next: string) {
    if (!next || next === source) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/homes/source", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ property: id, source: next }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setBusy(false);
    if (!j?.ok) {
      setMsg({ ok: false, text: j?.error ?? "That didn't save. Try again." });
      return;
    }
    setSource(next);
    setMsg({ ok: true, text: "Saved." });
    window.setTimeout(() => setMsg((m) => (m?.ok ? null : m)), 4000);
  }

  return (
    <div className="flex min-w-0 items-start gap-2.5" data-steve="home.source">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name="user" size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Source</span>
        {source === undefined ? (
          <span className="block text-[13px] text-muted">Reading…</span>
        ) : options.length ? (
          <select
            value={source ?? ""}
            disabled={busy}
            onChange={(e) => void pick(e.target.value)}
            aria-label="How the landlord came to us"
            className={`mt-0.5 block w-full max-w-[220px] truncate rounded-lg border border-line/60 bg-white px-2 py-1 text-[13px] outline-none focus:border-ink/40 ${source ? "" : "text-accent-dark"}`}
          >
            <option value="">{source === null ? "Couldn't read it" : "None yet - pick one"}</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <span className="block truncate text-[13px] text-muted">Not available</span>
        )}
        {msg && <span className={`mt-0.5 block text-[11.5px] ${msg.ok ? "text-[#43513a]" : "text-red-700"}`}>{msg.text}</span>}
      </span>
    </div>
  );
}
