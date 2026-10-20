"use client";

import { useCallback, useEffect, useState } from "react";
import { PropolyLine, type Party, type Picture } from "@/components/LetPeople";

/**
 * Add a tenant to a let in progress (Kirstie 6a2dc73c, 19 Oct 2026;
 * lib/let-tenants). Sits under the applicants beside Guarantors, and works
 * the same way: one short screen, kept in the OS. Says plainly whether the
 * person reaches Propoly with the push or has to be added there by hand.
 */

type Added = { id: string; name: string; email: string | null; phone: string | null; reference: boolean; by: string; at: string };
type Propoly = "pushed" | "held" | "with-push" | "to-deal" | "to-deal-practice";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHERE: Record<Propoly, string> = {
  "with-push": "Goes to Propoly with Push to Propoly, with everyone else.",
  held: "Not sent to Propoly from here yet: add them to the deal in Propoly by hand.",
  pushed: "The deal is already in Propoly: add them to it there by hand.",
  "to-deal": "The deal is in Propoly: they go onto it straight away.",
  "to-deal-practice": "The deal is in Propoly. Practice mode: what would go is shown on them, nothing is sent yet.",
};

export default function LetTenants({ letId, className = "", onChange, picture = null, people = null }: {
  letId: string;
  className?: string;
  /** Told after an add or a take-off, so the let reads its people again. */
  onChange?: () => void;
  /** Each added tenant against the let's Propoly deal (lib/let-propoly-sync). */
  picture?: Picture | null;
  people?: Party[] | null;
}) {
  const [rows, setRows] = useState<Added[] | null>(null);
  const [where, setWhere] = useState<Propoly>("held");
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ name: "", email: "", phone: "", reference: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const take = (j: { ok?: boolean; tenants?: Added[]; propoly?: Propoly }) => {
    if (!j?.ok) return false;
    setRows(j.tenants ?? []);
    if (j.propoly) setWhere(j.propoly);
    return true;
  };
  const load = useCallback(() => {
    fetch(`/api/let-tenants?let=${encodeURIComponent(letId)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (!take(j)) setRows([]); })
      .catch(() => setRows([]));
  }, [letId]);
  useEffect(load, [load]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function send(method: "POST" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    const j = await fetch("/api/let-tenants", { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ let: letId, ...body }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!take(j)) { setMsg(j?.error ?? "That didn't save. Try again."); return false; }
    /* What went to Propoly shows on their row, from the let's people. */
    onChange?.();
    return true;
  }
  async function save() {
    if (!d.name.trim()) return setMsg("What is their name?");
    if (d.email.trim() && !EMAIL.test(d.email.trim())) return setMsg("That email doesn't look right.");
    if (d.reference && !d.email.trim()) return setMsg("They need an email address to be referenced.");
    if (await send("POST", d)) { setOpen(false); setD({ name: "", email: "", phone: "", reference: true }); }
  }

  const field = "mt-1 w-full rounded-xl border border-line/80 bg-white px-3 py-2 text-[13px] outline-none focus:border-ink/40";
  const label = "block text-[11px] font-semibold text-muted";
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{rows?.length ? "Tenants added on this let" : "Someone else moving in?"}</p>
        <button type="button" onClick={() => setOpen(true)} disabled={rows === null} className="inline-flex items-center gap-1.5 rounded-full border border-accent-dark/50 bg-white px-3 py-1 text-[11.5px] font-semibold text-accent-dark transition-colors hover:bg-accent-soft disabled:opacity-50">
          + Add a tenant
        </button>
      </div>
      {rows && rows.length > 0 && (
        <div className="rounded-xl border border-line/50 bg-white p-3.5">
          <ul className="space-y-2">
            {rows.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{t.name}</span>
                  <span className="block truncate text-[11.5px] text-muted">{[t.email, t.phone].filter(Boolean).join(" · ") || "No email or mobile"}</span>
                  <span className="block text-[11px] text-muted">{t.reference ? "To be referenced" : "No references"} · added by {t.by}</span>
                  {(() => {
                    const party = people?.find((p) => p.key === `let-tenant:${t.id}`);
                    return party && onChange ? <PropolyLine letId={letId} party={party} picture={picture} onAnswer={() => onChange()} /> : null;
                  })()}
                </span>
                <button type="button" disabled={busy} onClick={() => void send("DELETE", { id: t.id })} className="shrink-0 text-[11.5px] font-semibold text-muted hover:text-ink">Take off</button>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-lg bg-card px-3 py-2 text-[11.5px] leading-relaxed">{WHERE[where]}</p>
        </div>
      )}
      {msg && !open && <p className="mt-2 text-[12px] text-muted">{msg}</p>}

      {open && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
          <button type="button" aria-label="Cancel" onClick={() => !busy && setOpen(false)} className="absolute inset-0 cursor-default bg-ink/45" />
          <div role="dialog" aria-label="Add a tenant" className="fade-up relative w-full max-w-md rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
            <div className="px-6 pb-2 pt-5">
              <h2 className="text-[20px] font-normal tracking-normal">Add a Tenant</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Someone else moving in on this let. Kept on the let in the OS; nothing is sent to anyone.</p>
              <div className="mt-4 space-y-3" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type !== "checkbox") { e.preventDefault(); void save(); } }}>
                <label className="block"><span className={label}>Full name</span><input autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className={field} placeholder="As on their ID" /></label>
                <label className="block"><span className={label}>Email</span><input type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} className={field} placeholder="name@example.com" /></label>
                <label className="block"><span className={label}>Mobile</span><input type="tel" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} className={field} placeholder="07..." /></label>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {([[true, "Reference them", "Like the other applicants"], [false, "No references", "Added to the deal only"]] as const).map(([v, t, sub]) => (
                    <button key={t} type="button" onClick={() => setD({ ...d, reference: v })} aria-pressed={d.reference === v}
                      className={`rounded-xl border px-3 py-2 text-left text-[12.5px] ${d.reference === v ? "border-accent-dark bg-accent-soft/60 font-semibold" : "border-line/70 bg-white"}`}>
                      {t}
                      <span className="block text-[11px] font-normal text-muted">{sub}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11.5px] leading-relaxed text-muted">{WHERE[where]}</p>
              </div>
              {msg && <p className="mt-3 text-[12.5px] font-semibold text-accent-dark">{msg}</p>}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line/60 px-6 py-4">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold hover:border-ink/40 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void save()} disabled={busy} className="rounded-full bg-accent-dark px-5 py-2 text-[12.5px] font-semibold text-page disabled:opacity-50">{busy ? "Saving…" : "Add them"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
