"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * TIDY AWAY (James, 23 Oct 2026; Kayleigh: "there's no way to delete an
 * appraisal"). One button on the appraisal file that asks why first:
 *
 *   - a test file is deleted for good (lib/appraisal-tidy keeps a copy);
 *   - anything real is archived: off the board, kept, and Bring back puts it
 *     where it was. A lost one can stay under Lost instead.
 *
 * "What we don't want to do is get clobbered up with different things."
 */

type Why = "test" | "no-contact" | "duplicate" | "lost" | "other";

const WHYS: { id: Why; label: string; sub: string }[] = [
  { id: "test", label: "It's a test file", sub: "Made for practice, or I'm the landlord on it." },
  { id: "no-contact", label: "The landlord doesn't want to be contacted", sub: "Kept, never chased." },
  { id: "duplicate", label: "It's a duplicate", sub: "The same home is booked on another appraisal." },
  { id: "lost", label: "Not going ahead", sub: "Instructed elsewhere, or they changed their mind." },
  { id: "other", label: "Something else", sub: "Say why in a line." },
];

const WHY_WORDS: Record<Why, string> = {
  test: "Test file",
  "no-contact": "Landlord doesn't want to be contacted",
  duplicate: "Duplicate",
  lost: "Not going ahead",
  other: "",
};

export default function AppraisalTidy({
  id,
  archivedAt,
  archivedBy,
  archivedWhy,
  onLost,
}: {
  id: string;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archivedWhy?: string | null;
  /** Keep it under Lost rather than archive - the file's own Mark as lost. */
  onLost: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState<Why | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  const act = async (action: "archive" | "unarchive" | "delete-test") => {
    setBusy(true);
    setMsg(null);
    const words = why === "other" ? note.trim() : [why ? WHY_WORDS[why] : "", note.trim()].filter(Boolean).join(": ");
    try {
      const r = await fetch(`/api/appraisals/${encodeURIComponent(id)}/tidy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, why: words }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; said?: string };
      if (!r.ok || !j.ok) throw new Error(j.said || "That didn't save. Try again.");
      if (action === "delete-test") window.location.assign("/market-appraisals");
      else window.location.reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "That didn't save. Try again.");
      setBusy(false);
    }
  };

  if (archivedAt) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line/60 bg-white/70 px-4 py-3">
        <DoodleIcon name="folder" size={15} className="text-muted" />
        <p className="min-w-0 flex-1 text-[12.5px] text-muted">
          Archived {new Date(archivedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          {archivedBy ? ` by ${archivedBy}` : ""}
          {archivedWhy ? ` - ${archivedWhy}` : ""}. It's off the board.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("unarchive")}
          className="rounded-full border border-line/70 bg-white px-4 py-1.5 text-[12px] font-semibold transition hover:border-ink/40 disabled:opacity-50"
        >
          Bring Back
        </button>
        {msg && <span className="w-full text-[11.5px] text-red-600">{msg}</span>}
      </div>
    );
  }

  const canArchive = why !== null && (why !== "other" || note.trim().length > 2);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setWhy(null);
          setNote("");
          setMsg(null);
        }}
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted underline underline-offset-2 hover:text-ink"
      >
        <DoodleIcon name="folder" size={13} />
        Tidy away
      </button>
      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-ink/40 p-3 backdrop-blur-sm sm:p-6" onClick={() => !busy && setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Tidy Away This Appraisal"
              onClick={(e) => e.stopPropagation()}
              className="popout-in flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line bg-page shadow-2xl"
            >
              <div className="flex items-start gap-3 border-b border-line/70 px-5 py-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                  <DoodleIcon name="folder" size={16} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[16px] leading-tight">Tidy Away This Appraisal</h3>
                  <p className="mt-0.5 text-[12px] text-muted">Why is it coming off the board?</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="ml-auto shrink-0 rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/30 disabled:opacity-40"
                >
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-5">
                {WHYS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWhy(w.id)}
                    className={`block w-full rounded-2xl border px-4 py-3 text-left transition ${why === w.id ? "border-ink/60 bg-white" : "border-line/60 bg-white/60 hover:border-ink/30"}`}
                  >
                    <span className="block text-[13.5px] font-semibold">{w.label}</span>
                    <span className="mt-0.5 block text-[12px] text-muted">{w.sub}</span>
                  </button>
                ))}
                {why && why !== "test" && (
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder={why === "other" ? "Why it's coming off" : "Anything to add (optional)"}
                    className="mt-1 w-full rounded-xl border border-line/70 bg-white px-3 py-2 text-[13px] outline-none focus:border-ink/40"
                  />
                )}
                {why === "test" && (
                  <p className="rounded-xl bg-accent-soft/60 px-3 py-2 text-[12px] text-accent-dark">
                    A test file is deleted for good, with any visit still to come taken out of the diary. Nobody is emailed.
                  </p>
                )}
                {why && why !== "test" && (
                  <p className="text-[12px] text-muted">
                    It's kept, not deleted: it leaves the board, nothing more goes to the landlord, and Archived brings it back.
                  </p>
                )}
                {msg && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">{msg}</p>}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-5 py-3.5">
                {why === "test" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act("delete-test")}
                    className="rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
                  >
                    {busy ? "Deleting…" : "Delete Test File"}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy || !canArchive}
                      onClick={() => void act("archive")}
                      className="rounded-full bg-[var(--brown)] px-5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
                    >
                      {busy ? "Archiving…" : "Archive It"}
                    </button>
                    {why === "lost" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          await onLost();
                        }}
                        className="rounded-full border border-line/80 px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-40"
                      >
                        Keep It Under Lost
                      </button>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="ml-auto rounded-full px-3 py-2.5 text-[12.5px] text-muted hover:text-ink disabled:opacity-40"
                >
                  Not now
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
