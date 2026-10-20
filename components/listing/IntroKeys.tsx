"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import FieldDate from "@/components/FieldDate";

/**
 * The keys on a marketing-only let (Sean McMahon, 20 Oct 2026: "the last
 * thing is the move-in date and hand over the keys"). Off unless the agent
 * turns it on - some landlords hold their own keys (Dan Richards's OpenRent
 * landlord). A date goes in the agent's own Outlook. /api/listings/intro-keys.
 */

type Keys = { on: boolean; at: string | null; note: string; doneAt: string | null; by: string } | null;

const pretty = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" }).replace(",", "");
/** ISO to the picker's "YYYY-MM-DDTHH:MM" on the London clock. */
const local = (iso: string | null) => {
  if (!iso) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

export default function IntroKeys({ listingId, address }: { listingId: string; address: string }) {
  const [keys, setKeys] = useState<Keys>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [at, setAt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/listings/intro-keys?listing=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live && j?.ok) setKeys(j.keys ?? null); })
      .catch(() => null)
      .finally(() => live && setLoaded(true));
    return () => { live = false; };
  }, [listingId]);

  async function save(p: { on: boolean; at?: string | null; note?: string; done?: boolean }) {
    setBusy(true);
    setSaid(null);
    try {
      const j = await fetch("/api/listings/intro-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, address, on: p.on, at: p.at ?? keys?.at ?? null, note: p.note ?? keys?.note ?? "", done: p.done ?? Boolean(keys?.doneAt) }),
      }).then((r) => r.json());
      if (!j?.ok) throw new Error(j?.error ?? "That didn't save.");
      setKeys(j.keys ?? null);
      setEditing(false);
      if (j.diary) setSaid({ ok: !/^Not/.test(j.diary), text: j.diary });
    } catch (e) {
      setSaid({ ok: false, text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  const on = Boolean(keys?.on);

  return (
    <div className="mb-4 rounded-xl border border-line/70 bg-white px-4 py-3.5">
      <div className="flex items-start gap-3">
        <DoodleIcon name="key" size={16} className="mt-0.5 shrink-0 text-accent-dark" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold">Key Handover</p>
          {!on && <p className="mt-0.5 text-[12px] text-muted">Off: the landlord sorts the keys. Turn it on if you&apos;re handing them over at the move-in.</p>}
          {on && keys?.doneAt && <p className="mt-0.5 text-[12px] text-[#3f5a32]">Keys handed over {pretty(keys.doneAt)}{keys.by ? ` · ${keys.by}` : ""}.</p>}
          {on && !keys?.doneAt && (
            <p className="mt-0.5 text-[12px]">{keys?.at ? <>Handing over <b className="font-semibold">{pretty(keys.at)}</b>{keys.note ? ` · ${keys.note}` : ""}</> : <span className="text-muted">No date yet.</span>}</p>
          )}

          {editing ? (
            <div className="mt-2.5 space-y-2">
              <FieldDate value={at} onChange={setAt} withTime placeholder="When and what time" />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who's collecting (the tenant, the inventory clerk)" className="w-full rounded-lg border border-line/80 bg-white px-3 py-2 text-[12.5px] outline-none focus:border-ink/40" />
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !at} onClick={() => void save({ on: true, at: new Date(at).toISOString(), note })} className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-40">
                  {busy ? "Saving" : "Save the date"}
                </button>
                <button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px]">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {!on && (
                <button type="button" disabled={busy} onClick={() => { setAt(""); setNote(""); setEditing(true); }} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40">
                  We&apos;re handing over the keys
                </button>
              )}
              {on && !keys?.doneAt && (
                <>
                  <button type="button" disabled={busy} onClick={() => { setAt(local(keys?.at ?? null)); setNote(keys?.note ?? ""); setEditing(true); }} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40">
                    {keys?.at ? "Change the date" : "Set the date"}
                  </button>
                  {keys?.at && (
                    <button type="button" disabled={busy} onClick={() => void save({ on: true, done: true })} className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page disabled:opacity-40">
                      Keys handed over
                    </button>
                  )}
                  <button type="button" disabled={busy} onClick={() => void save({ on: false })} className="rounded-full px-2.5 py-1.5 text-[12px] text-muted hover:text-ink">
                    Not handing them over
                  </button>
                </>
              )}
              {on && keys?.doneAt && (
                <button type="button" disabled={busy} onClick={() => void save({ on: true, done: false })} className="rounded-full px-2.5 py-1.5 text-[12px] text-muted hover:text-ink">
                  Undo
                </button>
              )}
            </div>
          )}
          {said && <p className={`mt-1.5 text-[11.5px] ${said.ok ? "text-muted" : "text-accent-dark"}`}>{said.text}</p>}
        </div>
      </div>
    </div>
  );
}
