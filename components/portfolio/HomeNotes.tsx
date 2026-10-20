"use client";

import { useEffect, useState } from "react";
import { Pill } from "@/components/Wire";

/**
 * Notes on a home (Sean McMahon, 20 Oct 2026: "I can't add any notes to the
 * file. There's no button to add notes on the property."). The team's own
 * notes, kept on the home from one let to the next, newest first, with the
 * current listing's notes beside them. Reads and writes /api/property/notes.
 * OS only: nothing goes to REX, the landlord or the tenant.
 */

type Note = { id: string; body: string; author: string; at: string; onListing: boolean };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function HomeNotes({ propertyId, listingId, onCount }: { propertyId: string | null; listingId: string; onCount?: (n: number) => void }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; notes: Note[] } | { status: "error"; message: string }>({ status: "loading" });
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    const sp = new URLSearchParams({ listing: listingId });
    if (propertyId) sp.set("property", propertyId);
    fetch(`/api/property/notes?${sp}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (j?.ok) { setState({ status: "ready", notes: j.notes as Note[] }); onCount?.((j.notes as Note[]).length); }
        else setState({ status: "error", message: j?.error ?? "The notes couldn't be read." });
      })
      .catch(() => live && setState({ status: "error", message: "The notes couldn't be read." }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, listingId]);

  async function add() {
    const body = draft.trim();
    if (!body || saving || !propertyId) return;
    setSaving(true);
    setSaid(null);
    try {
      const j = await fetch("/api/property/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property: propertyId, body }),
      }).then((r) => r.json());
      if (!j?.ok) throw new Error(j?.error ?? "The note wasn't saved.");
      setDraft("");
      setSaid({ ok: true, text: "Saved on this home, for everyone who opens it." });
      setState((s) => {
        const notes = [j.note as Note, ...(s.status === "ready" ? s.notes : [])];
        onCount?.(notes.length);
        return { status: "ready", notes };
      });
    } catch (e) {
      setSaid({ ok: false, text: e instanceof Error ? e.message : "The note wasn't saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {propertyId ? (
        <div className="rounded-xl border border-line/50 bg-white p-4">
          <label htmlFor="home-note" className="text-[12px] font-semibold">Add a note</label>
          <textarea
            id="home-note"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void add(); }}
            rows={3}
            placeholder="A tenant's email, a query, a call with the landlord…"
            className="mt-1.5 w-full resize-y rounded-lg border border-line/70 bg-page/40 px-3 py-2 text-[13px] outline-none focus:border-ink/50"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void add()}
              disabled={!draft.trim() || saving}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-40"
            >
              {saving && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-page/40 border-t-page" aria-hidden />}
              {saving ? "Saving" : "Save note"}
            </button>
            {said && <span className={`text-[12px] ${said.ok ? "text-muted" : "text-accent-dark"}`}>{said.text}</span>}
          </div>
          <p className="mt-2 text-[11.5px] text-muted">Kept in the OS on this home. Nobody is sent anything.</p>
        </div>
      ) : (
        <p className="rounded-xl border border-line/50 bg-white p-4 text-[12.5px] text-muted">There is no property record behind this home yet, so notes can't be kept on it.</p>
      )}

      <div className="mt-4">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 text-[12.5px] text-muted">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
            Reading the notes
          </p>
        )}
        {state.status === "error" && <p className="text-[12.5px] text-accent-dark">{state.message}</p>}
        {state.status === "ready" && state.notes.length === 0 && <p className="text-[12.5px] text-muted">No notes on this home yet.</p>}
        {state.status === "ready" && state.notes.length > 0 && (
          <ul className="space-y-2.5">
            {state.notes.map((n) => (
              <li key={n.id} className="rounded-xl border border-line/50 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
                  <span className="font-semibold text-ink">{n.author || "Someone in the office"}</span>
                  <span>{when(n.at)}</span>
                  {n.onListing && <Pill tone="neutral">On the listing</Pill>}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
