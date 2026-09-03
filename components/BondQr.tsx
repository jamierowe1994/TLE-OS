"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { CopyButton } from "@/components/Bits";

/**
 * QR codes in the Postcards room: the totals, a code by hand, and the code
 * behind any card, big enough to save for the print file.
 */

export interface QrLinkRow {
  token: string;
  property_key: string | null;
  address: string;
  postcode: string;
  reason: string;
  reason_note: string;
  send_id: number | null;
  campaign_name: string | null;
  step_title: string | null;
  created_by: string;
  created_at: string;
  scans: number;
  first_scan_at: string | null;
  responses: number;
}
interface Stats {
  links: number;
  scanned: number;
  responded: number;
  byReason: Record<string, { links: number; scanned: number; responded: number }>;
}

export const REASONS: Array<{ key: string; label: string }> = [
  { key: "anniversary", label: "Tenancy anniversary" },
  { key: "just_bought", label: "Just bought" },
  { key: "self_managing", label: "Letting it themselves" },
  { key: "custom", label: "Other reason" },
];
const reasonLabel = (k: string) => REASONS.find((r) => r.key === k)?.label ?? k;

/** The code, full size, with the link and a copy button. */
export function QrModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [data, setData] = useState<{ svg: string; url: string; link: QrLinkRow } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);
  async function sendTest() {
    setTest("Sending...");
    const r = await fetch("/api/bond/qr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ test_email: true, token }) });
    const j = await r.json();
    setTest(j.ok ? `Sent to ${j.to}` : j.error ?? "Not sent");
  }
  useEffect(() => {
    fetch(`/api/bond/qr?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (j.ok) setData(j);
        else setError(j.reason ?? "Could not draw the code.");
      })
      .catch(() => setError("Could not draw the code."));
  }, [token]);
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/35" />
      <div className="relative w-full max-w-sm rounded-3xl border border-line bg-panel p-6 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.4)]">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-line text-[12px] text-muted hover:text-ink">
          ✕
        </button>
        {error && <p className="text-[12.5px] text-red-700">{error}</p>}
        {!data && !error && <p className="text-[12.5px] text-muted">Drawing...</p>}
        {data && (
          <>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted">{reasonLabel(data.link.reason)}</p>
            <h3 className="mt-1 text-[15px] leading-snug">{data.link.address}</h3>
            {data.link.reason_note && <p className="mt-0.5 text-[12px] text-muted">{data.link.reason_note}</p>}
            <div className="mx-auto mt-4 w-56 rounded-2xl border border-line bg-white p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: data.svg }} />
            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-box px-3 py-2 text-[12px]">
              <span className="truncate">{data.url}</span>
              <CopyButton value={data.url} label="the link" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              {data.link.scans} scan{data.link.scans === 1 ? "" : "s"} · {data.link.responses} response{data.link.responses === 1 ? "" : "s"}. Right-click the code to save it for the print file; it reads at 20mm and up.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11.5px]">
              <a href={`/api/bond/qr?token=${encodeURIComponent(token)}&preview=email`} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3 py-1 text-muted hover:border-ink hover:text-ink">
                Preview the email
              </a>
              <button type="button" onClick={sendTest} className="rounded-full border border-line px-3 py-1 text-muted hover:border-ink hover:text-ink">
                Send me a test
              </button>
              {test && <span className="text-muted">{test}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The totals and the by-hand form. */
export function QrPanel({ onMade }: { onMade?: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [links, setLinks] = useState<QrLinkRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [postcode, setPostcode] = useState("");
  const [reason, setReason] = useState("custom");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/bond/qr", { cache: "no-store" });
    const j = await r.json();
    if (j.ok) {
      setStats(j.stats);
      setLinks(j.links);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function make(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/bond/qr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, postcode, reason, reason_note: note }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? "Could not make the code.");
      setAddress("");
      setPostcode("");
      setNote("");
      await load();
      setOpen(j.link.token);
      onMade?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make the code.");
    } finally {
      setBusy(false);
    }
  }

  const field = "rounded-full border border-line/80 bg-transparent px-3.5 py-2 text-[12.5px] outline-none focus:border-ink";
  const handmade = links.filter((l) => !l.send_id).slice(0, 20);

  return (
    <section className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[14px]">
          <DoodleIcon name="link" size={15} />
          The QR loop
        </h2>
        {stats && (
          <p className="text-[12px] text-muted">
            <span className="figures text-ink">{stats.links}</span> codes · <span className="figures text-ink">{stats.scanned}</span> scanned · <span className="figures text-ink">{stats.responded}</span> asked for a rent check
          </p>
        )}
      </div>
      <p className="mt-1 text-[12px] text-muted">
        Every card carries its own code. The landlord scans it, sees what similar homes nearby are advertised at, and leaves their details for the full check: an inbound lead who has opted in, and a mark against the card that worked.
      </p>
      {stats && Object.keys(stats.byReason).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {REASONS.filter((r) => stats.byReason[r.key]).map((r) => {
            const v = stats.byReason[r.key];
            return (
              <span key={r.key} className="rounded-full border border-line/70 px-3 py-1 text-[11.5px] text-muted">
                {r.label}: <span className="figures text-ink">{v.links}</span> sent · <span className="figures text-ink">{v.scanned}</span> scanned · <span className="figures text-ink">{v.responded}</span> replied
              </span>
            );
          })}
        </div>
      )}

      <form onSubmit={make} className="mt-4 flex flex-wrap items-center gap-2">
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address for a one-off card" className={`${field} min-w-56 flex-1`} required />
        <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Postcode" className={`${field} w-28`} required />
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
          {REASONS.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this card (optional)" className={`${field} min-w-40 flex-1`} />
        <button type="submit" disabled={busy} className="press-wobble rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-page disabled:opacity-40">
          {busy ? "Making..." : "Make a code"}
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-red-700">{error}</p>}

      {handmade.length > 0 && (
        <ul className="mt-4 divide-y divide-line/60 text-[12.5px]">
          {handmade.map((l) => (
            <li key={l.token} className="flex items-center gap-3 py-2">
              <button type="button" onClick={() => setOpen(l.token)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line/80 text-muted hover:border-ink hover:text-ink" title="Show the code">
                <DoodleIcon name="grid" size={14} />
              </button>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{l.address}</span>
                <span className="block text-[11px] text-muted">{reasonLabel(l.reason)}{l.reason_note ? ` · ${l.reason_note}` : ""} · by {l.created_by}</span>
              </span>
              <span className="figures shrink-0 text-[11.5px] text-muted">{l.scans} scans · {l.responses} replies</span>
            </li>
          ))}
        </ul>
      )}
      {open && <QrModal token={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
