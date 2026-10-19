"use client";

import { useEffect, useState } from "react";
import { PressButton } from "@/components/Bits";

/**
 * One tenant's right to rent expiry, as a field (Kirstie Mulholland, 16 Oct
 * 2026, ticket 066bb29e: "myself and the agents need to be able to put in
 * expiry for right to rent if overseas so they can chase the renewals - I
 * will need to verify all").
 *
 * On the let's tenant and on a home's tenants on Portfolio. The date (or no
 * time limit), when the follow-up check is owed, and whether pre-tenancy has
 * checked it; Change for anybody on the file, Mark as checked for the office.
 * A new date waits to be checked again. The renewals list is /right-to-rent.
 */

export type RtrShown = {
  id: string;
  tenant: string;
  tenantEmail: string;
  rightUntil: string | null;
  noTimeLimit: boolean;
  followUpOn: string | null;
  by: string;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
};

const niceDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const daysTo = (ymd: string) => Math.round((new Date(`${ymd}T12:00:00Z`).getTime() - new Date(`${today()}T12:00:00Z`).getTime()) / 86_400_000);

export function rtrSoon(r: RtrShown): "gone" | "soon" | null {
  if (!r.rightUntil) return null;
  const d = daysTo(r.rightUntil);
  return d < 0 ? "gone" : d <= 60 ? "soon" : null;
}

export default function RightToRentField({
  record,
  save,
  canVerify,
  onVerified,
  className = "",
}: {
  record: RtrShown | null;
  /** Saves the date; the sentence that says what is wrong, or null when it saved. */
  save: (until: string | null, noTimeLimit: boolean) => Promise<string | null>;
  canVerify: boolean;
  onVerified: (r: RtrShown) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [until, setUntil] = useState(record?.rightUntil ?? "");
  const [noLimit, setNoLimit] = useState(record?.noTimeLimit ?? false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    if (!noLimit && !until) { setErr("Put the date in, or tick no time limit."); return; }
    setBusy(true);
    setErr(null);
    const e = await save(noLimit ? null : until, noLimit);
    setBusy(false);
    if (e) { setErr(e); return; }
    setEditing(false);
  }
  async function verify() {
    if (!record || busy) return;
    setBusy(true);
    setErr(null);
    const j = await fetch("/api/right-to-rent", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: record.id }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!j?.ok) { setErr(j?.error ?? "That couldn't be saved just now."); return; }
    onVerified(j.record as RtrShown);
  }

  if (editing || !record) {
    if (!editing) {
      return (
        <div className={`text-[12px] ${className}`}>
          <p className="text-muted">No expiry recorded. Overseas tenants with a time limit need one, so the renewal is chased.</p>
          <button type="button" onClick={() => { setEditing(true); setUntil(""); setNoLimit(false); }} className="mt-1.5 font-semibold text-accent-dark hover:underline">
            Add the expiry
          </button>
        </div>
      );
    }
    return (
      <form className={`space-y-2 rounded-xl bg-accent-soft/30 p-3 text-[12px] ${className}`} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label className="block text-[11.5px] text-muted">
          Right to rent until
          <input
            type="date"
            value={until}
            min={today()}
            disabled={noLimit}
            onChange={(e) => { setUntil(e.target.value); setErr(null); }}
            className="mt-1 block w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px] text-ink disabled:opacity-40 sm:w-56"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[12px]">
          <input type="checkbox" checked={noLimit} onChange={(e) => { setNoLimit(e.target.checked); setErr(null); }} className="h-4 w-4 accent-[var(--brown)]" />
          No time limit (settled status, a British or Irish passport)
        </label>
        <p className="text-[11px] text-muted">From the share code result or their document. Pre-tenancy checks it once it&apos;s saved.</p>
        {err && <p className="text-[11.5px] text-accent-dark">{err}</p>}
        <div className="flex items-center gap-3">
          <PressButton onClick={() => void submit()} disabled={busy} className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page">
            {busy ? "Saving…" : "Save"}
          </PressButton>
          <button type="button" onClick={() => { setEditing(false); setErr(null); }} className="text-[11.5px] text-muted underline">Cancel</button>
        </div>
      </form>
    );
  }

  const soon = rtrSoon(record);
  return (
    <div className={`text-[12px] ${className}`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`font-semibold ${soon ? "text-accent-dark" : ""}`}>
          {record.noTimeLimit ? "No time limit" : record.rightUntil ? `Until ${niceDay(record.rightUntil)}` : "Not recorded"}
        </span>
        {soon === "gone" && <span className="rounded-full bg-accent-dark px-2 py-0.5 text-[10.5px] font-semibold text-white">Run out</span>}
        {soon === "soon" && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-dark">Renew soon</span>}
        {record.verifiedAt ? (
          <span className="rounded-full border border-line/80 px-2 py-0.5 text-[10.5px] text-muted">Checked by {record.verifiedBy ?? "pre-tenancy"}</span>
        ) : (
          <span className="rounded-full border border-accent-dark/40 px-2 py-0.5 text-[10.5px] text-accent-dark">Waiting for pre-tenancy to check</span>
        )}
      </p>
      {record.followUpOn && <p className="mt-0.5 text-[11px] text-muted">Follow-up check owed by {niceDay(record.followUpOn)} · added by {record.by}</p>}
      <div className="mt-1.5 flex flex-wrap gap-4 text-[11.5px]">
        <button type="button" onClick={() => { setEditing(true); setUntil(record.rightUntil ?? ""); setNoLimit(record.noTimeLimit); }} className="text-muted underline hover:text-ink">
          Change
        </button>
        {canVerify && !record.verifiedAt && (
          <button type="button" onClick={() => void verify()} disabled={busy} className="font-semibold text-accent-dark hover:underline disabled:opacity-40">
            {busy ? "Saving…" : "Mark as checked"}
          </button>
        )}
      </div>
      {err && <p className="mt-1 text-[11.5px] text-accent-dark">{err}</p>}
    </div>
  );
}

/**
 * A home's tenants on Portfolio (ticket 066bb29e): the renewals agents chase
 * are mostly sitting tenants. Quiet when nothing is recorded - one link, not
 * a "not recorded" under every British tenant - and nothing on a Scottish
 * home, where right to rent doesn't apply.
 */
export function HomeRightToRent({ listingId, tenants, className = "" }: { listingId: string; tenants: { name: string; email: string | null }[]; className?: string }) {
  const [state, setState] = useState<{ records: RtrShown[]; canVerify: boolean; scottish: boolean } | null | "failed">(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    setState(null);
    fetch(`/api/portfolio/right-to-rent?listing=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live) setState(j?.ok ? { records: j.records ?? [], canVerify: Boolean(j.canVerify), scottish: Boolean(j.scottish) } : "failed"); })
      .catch(() => { if (live) setState("failed"); });
    return () => { live = false; };
  }, [listingId]);
  if (state === null || state === "failed" || state.scottish) return null;
  const of = (t: { name: string; email: string | null }) =>
    state.records.find((r) => (t.email && r.tenantEmail && r.tenantEmail.toLowerCase() === t.email.toLowerCase()) || r.tenant.trim().toLowerCase() === t.name.trim().toLowerCase()) ?? null;
  const keep = (r: RtrShown) => setState((s) => (s && s !== "failed" ? { ...s, records: [...s.records.filter((x) => x.tenant.trim().toLowerCase() !== r.tenant.trim().toLowerCase()), r] } : s));
  const shown = open ? tenants : tenants.filter((t) => of(t));
  return (
    <div className={`rounded-xl border border-line/50 px-4 py-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Right to rent</p>
        <a href="/applications/right-to-rent" className="text-[11px] text-muted underline hover:text-ink">Renewals list</a>
      </div>
      {shown.length === 0 && (
        <button type="button" onClick={() => setOpen(true)} className="mt-1.5 text-[12px] font-semibold text-accent-dark hover:underline">
          + Add an overseas tenant&apos;s expiry
        </button>
      )}
      <ul className="mt-1.5 space-y-2.5">
        {shown.map((t) => (
          <li key={t.name}>
            <p className="text-[12.5px] font-semibold">{t.name}</p>
            <RightToRentField
              key={of(t)?.id ?? "none"}
              record={of(t)}
              canVerify={state.canVerify}
              onVerified={keep}
              save={async (until, noTimeLimit) => {
                const j = await fetch("/api/portfolio/right-to-rent", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ listingId, tenant: t.name, until, noTimeLimit }),
                }).then((r) => r.json()).catch(() => null);
                if (!j?.ok) return j?.error ?? "That couldn't be saved just now. Try again in a minute.";
                keep(j.record as RtrShown);
                return null;
              }}
            />
          </li>
        ))}
      </ul>
      {!open && shown.length > 0 && shown.length < tenants.length && (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[11.5px] text-muted underline hover:text-ink">Add another tenant&apos;s</button>
      )}
    </div>
  );
}
