"use client";
import { useEffect, useState } from "react";

/**
 * A home's address, and Change address.
 *
 * Changeable here since 23 Oct 2026 (Kayleigh Wright: a missing town or
 * postcode on the back-office record stopped an offer reaching Propoly, and
 * only Steve could change it). Since 27 Oct 2026 (James, after Lianna's 12
 * South Chesters Lane) a change goes to the listing's own record too
 * (lib/rex-address), so the name on the page, the board and the portals
 * follow it; onChanged hands the page the new name at once.
 *
 * Where an older change was kept in the OS alone, the line under the address
 * says so, and saving it again sends it on.
 */
export default function OsAddressLine({
  propertyId,
  listingId,
  shown,
  onChanged,
  compact = false,
}: {
  propertyId: string | null | undefined;
  listingId?: string | null;
  shown: string;
  /** The new name and "Town POSTCODE", once the listing holds them. */
  onChanged?: (a: { name: string; locality: string }) => void;
  /** Just the button and the field: for Edit the Advert, where the address is already over it. */
  compact?: boolean;
}) {
  const [held, setHeld] = useState<{ address: string; setBy: string; setAt: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    let live = true;
    fetch(`/api/homes/os-address?property=${encodeURIComponent(String(propertyId))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok && j.address) setHeld(j.address); })
      .catch(() => { /* the page's own address still stands */ });
    return () => { live = false; };
  }, [propertyId]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/homes/os-address", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ property: String(propertyId), listingId: listingId ?? null, address: draft }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      address?: { address: string; setBy: string; setAt: string };
      parts?: { name: string; locality: string };
      rex?: { ok: boolean; why?: string };
    } | null;
    setBusy(false);
    if (!j?.ok || !j.address) {
      setMsg({ ok: false, text: j?.error ?? "That didn't save. Try again." });
      return;
    }
    setHeld(j.address);
    setEditing(false);
    if (j.rex?.ok) {
      if (j.parts) onChanged?.(j.parts);
      setMsg({ ok: true, text: "Saved. The listing and the portals show the new address." });
    } else setMsg({ ok: !j.rex, text: j.rex?.why ?? "Saved." });
  }

  if (!propertyId) return null;
  const same = held ? held.address.replace(/\W/g, "").toLowerCase() === shown.replace(/\W/g, "").toLowerCase() : true;
  const when = held ? new Date(held.setAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }) : "";
  return (
    <div className="mt-1 text-[12px] leading-relaxed text-muted" data-steve="home.os-address">
      {!compact && held && !same && !msg && (
        <p>
          <span className="font-semibold text-ink">Changed to:</span> {held.address}
          <span> · by {held.setBy || "someone"} on {when}. The listing still shows the old address - press Change address and Save to send it on.</span>
        </p>
      )}
      {editing ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) void save();
              if (e.key === "Escape") { e.stopPropagation(); setEditing(false); }
            }}
            placeholder="5 Canter Close, Liverpool, L9 9JE"
            aria-label="The whole address, with town and postcode"
            className="h-9 min-w-0 flex-1 basis-[260px] rounded-xl border border-line/70 bg-white px-3 text-[13px] text-ink outline-none focus:border-ink/40"
          />
          <button type="button" disabled={busy || draft.trim().length < 6} onClick={() => void save()} className="rounded-full bg-[var(--brown)] px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" disabled={busy} onClick={() => { setEditing(false); setMsg(null); }} className="text-[12px] text-muted hover:text-ink">
            Cancel
          </button>
          <span className="basis-full text-[11.5px]">The whole address, with the town and postcode. It changes on the listing and the portals too.</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(held && !same ? held.address : shown); setEditing(true); setMsg(null); }}
          className="underline underline-offset-2 hover:text-ink"
        >
          Change address
        </button>
      )}
      {msg && <p className={`mt-1 ${msg.ok ? "text-[#43513a]" : "text-red-700"}`}>{msg.text}</p>}
    </div>
  );
}
