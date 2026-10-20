"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The Keys line on a home's page (Sean McMahon, 20 Oct 2026: "Where do we
 * find key numbers?"). The number on each tag, where the set is kept and who
 * has it out, from REX's key register, plus any number recorded in the OS.
 * Add a key number records one in the OS only (/api/property/keys).
 */

type Key = { id: string; label: string; location: string | null; heldBy: string | null; since: string | null; source: "rex" | "os" };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function HomeKeys({ propertyId }: { propertyId: string | null }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; keys: Key[]; rexFailed: boolean } | { status: "error"; message: string }>({ status: "loading" });
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    let live = true;
    setState({ status: "loading" });
    fetch(`/api/property/keys?property=${encodeURIComponent(propertyId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        setState(j?.ok ? { status: "ready", keys: j.keys as Key[], rexFailed: Boolean(j.rexFailed) } : { status: "error", message: j?.error ?? "The keys couldn't be read." });
      })
      .catch(() => live && setState({ status: "error", message: "The keys couldn't be read." }));
    return () => { live = false; };
  }, [propertyId]);

  async function send(body: Record<string, unknown>) {
    if (!propertyId) return;
    setBusy(true);
    setNote(null);
    try {
      const j = await fetch("/api/property/keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ property: propertyId, ...body }) }).then((r) => r.json());
      if (!j?.ok) { setNote(j?.error ?? "That didn't save. Try again in a minute."); return; }
      setState({ status: "ready", keys: j.keys as Key[], rexFailed: Boolean(j.rexFailed) });
      setAdding(false);
      setLabel("");
      setLocation("");
    } catch {
      setNote("That didn't save. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  if (!propertyId) return null;
  const keys = state.status === "ready" ? state.keys : [];
  const out = keys.filter((k) => k.heldBy);

  return (
    <div className={`flex min-w-0 items-start gap-2.5 ${adding || note || keys.length > 1 ? "col-span-2 sm:col-span-4" : ""}`}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name="key" size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted">Key {keys.length > 1 ? "numbers" : "number"}</span>
        {state.status === "loading" && (
          <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
            Reading the key register
          </span>
        )}
        {state.status === "error" && <span className="block text-[12.5px] text-accent-dark">{state.message}</span>}
        {state.status === "ready" && (
          <>
            {keys.length === 0 ? (
              <span className="block text-[13px] text-muted">{state.rexFailed ? "The key register couldn't be read" : "None recorded"}</span>
            ) : (
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px]">
                {keys.map((k) => (
                  <span key={k.id} className="inline-flex items-center gap-1">
                    <b className="font-semibold">{k.label}</b>
                    {k.location && <span className="text-muted">· {k.location}</span>}
                    {k.source === "os" && (
                      <button type="button" disabled={busy} onClick={() => void send({ remove: k.id })} className="text-[11px] text-muted hover:text-accent-dark disabled:opacity-50" aria-label={`Take key ${k.label} off`}>
                        Remove
                      </button>
                    )}
                  </span>
                ))}
              </span>
            )}
            {out.map((k) => (
              <span key={`out-${k.id}`} className="block truncate text-[11px] text-accent-dark">
                {k.label} out with {k.heldBy}{k.since ? ` since ${day(k.since)}` : ""}
              </span>
            ))}
            {!adding && (
              <button type="button" onClick={() => { setAdding(true); setNote(null); }} className="mt-0.5 text-[11.5px] font-semibold text-accent-dark underline-offset-2 hover:underline">
                Add a key number
              </button>
            )}
          </>
        )}
        {adding && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px]">
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Number on the tag" aria-label="Number on the tag" autoFocus className="w-36 rounded-full border border-line/60 bg-white px-3 py-1 text-[12px]" />
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where it's kept (optional)" aria-label="Where it's kept" className="w-44 rounded-full border border-line/60 bg-white px-3 py-1 text-[12px]" />
            <button type="button" disabled={busy} onClick={() => setAdding(false)} className="rounded-full px-2 py-1 text-muted hover:text-ink disabled:opacity-50">Cancel</button>
            <button type="button" disabled={busy || !label.trim()} onClick={() => void send({ label, location })} className="rounded-full bg-[var(--brown)] px-3 py-1 font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
          </span>
        )}
        {note && <span className="mt-0.5 block text-[11.5px] text-accent-dark">{note}</span>}
      </span>
    </div>
  );
}
