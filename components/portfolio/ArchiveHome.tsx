"use client";

import { useEffect, useState } from "react";

/**
 * Archiving an old home (James, 27 Oct 2026: Michael clears the homes that
 * are not ours any more). Three pieces, all reading /api/portfolio/archive-home
 * (lib/archived-homes); nothing here touches REX.
 *
 *   ArchiveConfirm     the ask under the home's head, from More for this home
 *   ArchivedNotice     what the home's page says once it is archived, with Put back
 *   ArchivedHomesList  every archived home, under Portfolio > Archive
 */

type Archived = { id: string; label: string; listingIds: string[]; reason: string; byName: string; at: string };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function post(body: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch("/api/portfolio/archive-home", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    return j?.ok ? null : j?.error ?? "That didn't save. Try again in a minute.";
  } catch {
    return "That didn't save. Try again in a minute.";
  }
}

/** `flat`: inside a box on the older page, without the new look's pull-up margin. */
export function ArchiveConfirm({ listingIds, label, onCancel, onDone, flat = false }: { listingIds: string[]; label: string; onCancel: () => void; onDone: () => void; flat?: boolean }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    const e = await post({ listingIds, label, reason });
    setBusy(false);
    if (e) setErr(e);
    else onDone();
  };
  return (
    <div className="nl-confirm" style={flat ? { margin: 0 } : undefined} data-steve-never>
      <p>
        Archive {label}? It comes off Portfolio, the compliance desk, the certificate chases and search for everyone{listingIds.length > 1 ? ", every room with it" : ""}. A landlord with no other homes goes with it. Nothing changes on the main record, and you can put it back from Portfolio, Archive.
      </p>
      <input
        className="nl-input"
        style={{ flex: "1 1 260px", fontSize: 14, padding: "8px 12px", border: "1px solid var(--line-strong, #d9d4cf)", borderRadius: 10, background: "var(--card, #fff)" }}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why, for the record (optional)"
        maxLength={500}
        aria-label="Why it is being archived"
      />
      <button type="button" disabled={busy} onClick={onCancel} className="nl-btn nl-btn--quiet nl-btn--sm">
        Keep it
      </button>
      <button type="button" disabled={busy} onClick={() => void go()} className="nl-btn nl-btn--sm nl-btn--danger">
        {busy ? "Archiving…" : "Archive"}
      </button>
      {err && <p className="nl-prop-err" role="alert" style={{ flexBasis: "100%" }}>{err}</p>}
    </div>
  );
}

/** On the home's page once it has gone: who archived it, and Put back. Nothing for anybody else. */
export function ArchivedNotice({ listingId, onFound, onBack }: { listingId: string; onFound?: () => void; onBack: () => void }) {
  const [a, setA] = useState<Archived | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/portfolio/archive-home?listing=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok && j.archived) { setA(j.archived); onFound?.(); } })
      .catch(() => {});
    return () => { live = false; };
  }, [listingId]);
  if (!a) return null;
  const back = async () => {
    setBusy(true);
    setErr(null);
    const e = await post({ putBack: a.id });
    setBusy(false);
    if (e) setErr(e);
    else onBack();
  };
  return (
    <div className="mt-5 max-w-xl">
      <p className="nl-meta">
        <b>{a.label}</b> was archived by {a.byName || "somebody"} on {when(a.at)}{a.reason ? `: "${a.reason}"` : ""}. It is off Portfolio, the compliance desk and search.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void back()} className="nl-btn nl-btn--secondary nl-btn--sm">
          {busy ? "Putting it back…" : "Put it back"}
        </button>
      </div>
      {err && <p className="nl-prop-err mt-2" role="alert">{err}</p>}
    </div>
  );
}

/** Portfolio > Archive: every archived home, newest first. Only for those who may archive. */
export function ArchivedHomesList() {
  const [homes, setHomes] = useState<Archived[] | null>(null);
  const [can, setCan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/portfolio/archive-home", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!live || !j?.ok) return; setCan(Boolean(j.canArchive)); setHomes(Array.isArray(j.homes) ? j.homes : []); })
      .catch(() => {});
    return () => { live = false; };
  }, [rev]);
  if (!can || !homes || !homes.length) return null;
  const back = async (id: string) => {
    setBusy(id);
    setErr(null);
    const e = await post({ putBack: id });
    setBusy(null);
    if (e) setErr(e);
    else setRev((n) => n + 1);
  };
  return (
    <section className="mb-8">
      <h2 className="nl-block-title">Archived Homes</h2>
      <p className="nl-meta mt-1">Taken off the OS by hand. Put one back and it shows everywhere again.</p>
      <ul className="mt-3 divide-y divide-line/60">
        {homes.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{h.label}</p>
              <p className="nl-meta text-[12.5px]">
                {h.byName || "Somebody"}, {when(h.at)}{h.reason ? ` · ${h.reason}` : ""}
              </p>
            </div>
            <button type="button" disabled={busy === h.id} onClick={() => void back(h.id)} className="nl-btn nl-btn--secondary nl-btn--sm">
              {busy === h.id ? "Putting it back…" : "Put it back"}
            </button>
          </li>
        ))}
      </ul>
      {err && <p className="nl-prop-err mt-2" role="alert">{err}</p>}
    </section>
  );
}
