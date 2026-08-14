"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import EnvelopeSend from "@/components/EnvelopeSend";

/**
 * Terms nobody has signed yet — the dashboard's version of the question.
 *
 * The property record answers "did THIS one sign". This answers the one an
 * office actually asks on a Monday: who is still sitting on ours. Same data,
 * opposite direction.
 *
 * ── The reminder is an email, not a resend ──────────────────────────────────
 *
 * REX exposes no resend on e-sign requests and no signing URL, so we cannot
 * re-fire DocuSign's "sign here" email. The chase is a short note from the
 * agent pointing at the one already in their inbox. See
 * app/api/esign/remind for the full reasoning.
 */

export type OutstandingRow = {
  id: number;
  status: string;
  address: string;
  templateName: string;
  sentBy: string;
  sentAt: string | null;
  age: number | null;
  listingId: number | null;
  signers: { role: string; name: string; email: string }[];
};

export function useOutstandingTerms() {
  const [rows, setRows] = useState<OutstandingRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "off">("loading");

  const load = useCallback(() => {
    fetch("/api/esign/outstanding")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setState("off");
        setRows(j.rows ?? []);
        setState("ready");
      })
      .catch(() => setState("off"));
  }, []);

  useEffect(load, [load]);
  return { rows, state, reload: load };
}

const who = (r: OutstandingRow) => r.signers[0]?.name || "Landlord";

function ageTone(age: number | null): string {
  if (age == null) return "text-muted";
  if (age >= 14) return "text-accent-dark";
  if (age >= 7) return "text-amber-700";
  return "text-muted";
}

function ageWords(age: number | null): string {
  if (age == null) return "—";
  if (age <= 0) return "today";
  if (age === 1) return "1 day";
  return `${age} days`;
}

/* ─────────────────────────── the widget ─────────────────────────── */

/**
 * Responsive by COLUMN COUNT, not by breakpoint — the widget can be 1×1 in a
 * corner or 2×2 across the board, and the same card has to read at both. At
 * its smallest it answers "how many, and who" and nothing else; given width
 * it earns the property and the age; given height, more rows.
 */
export default function OutstandingTermsWidget({ w, h }: { w: number; h: number }) {
  const { rows, state, reload } = useOutstandingTerms();
  const [open, setOpen] = useState(false);

  const max = h >= 2 ? 6 : 3;
  const shown = rows.slice(0, max);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-full w-full flex-col items-start p-4 text-left"
      >
        <span className="flex w-full items-center gap-2">
          <DoodleIcon name="file-contract" size={14} className="text-accent-dark" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Terms to sign
          </span>
          {rows.length > 0 && (
            <span className="ml-auto rounded-full border border-accent-dark/40 px-2 py-0.5 text-[10px] font-semibold text-accent-dark">
              {rows.length}
            </span>
          )}
        </span>

        {state === "loading" && <span className="mt-3 text-[12px] text-muted">Asking REX…</span>}
        {state === "off" && (
          <span className="mt-3 text-[12px] text-muted">REX isn&rsquo;t connected here.</span>
        )}

        {state === "ready" && rows.length === 0 && (
          <span className="mt-3 text-[12px] text-muted">
            Nothing outstanding. Every set of terms has come back.
          </span>
        )}

        {state === "ready" && rows.length > 0 && (
          <>
            {/* 1×1 has room for a number and a sentence, and nothing else.
                A three-column row squeezed into 150px is unreadable, and an
                unreadable row is worse than an honest count. */}
            {w < 2 ? (
              <>
                <span className="figures mt-2 text-[34px] leading-none">{rows.length}</span>
                <span className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                  waiting on a signature
                </span>
              </>
            ) : (
              <span className="mt-2.5 w-full space-y-1.5">
                {shown.map((r) => (
                  <span key={r.id} className="flex w-full items-center gap-2 text-[12px]">
                    <span className="min-w-0 flex-1 truncate">{who(r)}</span>
                    {/* The property only once there is width for it —
                        truncated to three words it is noise. */}
                    {w >= 3 && (
                      <span className="min-w-0 flex-1 truncate text-muted">
                        {r.address || "—"}
                      </span>
                    )}
                    <span className={`figures shrink-0 text-[11px] ${ageTone(r.age)}`}>
                      {ageWords(r.age)}
                    </span>
                  </span>
                ))}
                {rows.length > shown.length && (
                  <span className="block pt-0.5 text-[11px] text-muted">
                    +{rows.length - shown.length} more
                  </span>
                )}
              </span>
            )}
          </>
        )}
      </button>

      <OutstandingTermsModal open={open} onClose={() => setOpen(false)} rows={rows} onSent={reload} />
    </>
  );
}

/* ─────────────────────────── the modal ─────────────────────────── */

function OutstandingTermsModal({
  open,
  onClose,
  rows,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  rows: OutstandingRow[];
  onSent: () => void;
}) {
  const [pick, setPick] = useState<number | null>(null);
  const [stage, setStage] = useState<"list" | "going" | "gone">("list");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPick(rows[0]?.id ?? null);
    setStage("list");
    setNote(null);
  }, [open, rows]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stage !== "going" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, stage]);

  if (!open || typeof document === "undefined") return null;

  const chosen = rows.find((r) => r.id === pick) ?? null;
  const signer = chosen?.signers[0] ?? null;

  async function remind() {
    if (!chosen || !signer?.email) return;
    setStage("going");
    setNote(null);
    try {
      const res = await fetch("/api/esign/remind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: signer.email,
          landlordName: signer.name,
          address: chosen.address,
          sentAt: chosen.sentAt,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        setStage("list");
        setNote(j.error ?? "That didn't send.");
        return;
      }
      setTimeout(() => {
        setStage("gone");
        onSent();
      }, 1650);
    } catch {
      setStage("list");
      setNote("That didn't send.");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm">
      <div className="popout-in flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line bg-page shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line/70 px-5 py-3.5">
          <DoodleIcon name="file-contract" size={16} className="text-accent-dark" />
          <div className="min-w-0">
            <h3 className="text-[15px]">Terms still to sign</h3>
            <p className="text-[11.5px] text-muted">
              {rows.length} outstanding across the book, oldest first by how long they&rsquo;ve
              been out.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={stage === "going"}
            className="ml-auto rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] hover:border-ink/30 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        {stage !== "list" ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="text-accent-dark">
              <EnvelopeSend size={92} />
            </span>
            <p className="hand mt-2 text-[21px]">
              {stage === "gone" ? `Nudged ${signer?.name?.split(" ")[0] ?? "them"}` : "Sending…"}
            </p>
            {stage === "gone" && (
              <>
                <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-muted">
                  It went out in your name and lands on their REX timeline, so the next person to
                  open this landlord can see it was chased.
                </p>
                <button
                  type="button"
                  onClick={() => setStage("list")}
                  className="mt-6 rounded-full bg-ink px-6 py-2.5 text-[12.5px] font-semibold text-page"
                >
                  Back to the list
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {rows.length === 0 ? (
                <p className="py-8 text-center text-[12.5px] text-muted">
                  Nothing outstanding. Every set of terms has come back.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {rows.map((r) => {
                    const on = pick === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setPick(r.id)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                            on ? "border-ink bg-card" : "border-line/70 hover:border-ink/40"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px]">{who(r)}</span>
                            <span className="block truncate text-[11px] text-muted">
                              {r.address || "Sent from a contact, not a property"}
                            </span>
                          </span>
                          <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted sm:block">
                            {r.templateName}
                          </span>
                          <span className="hidden shrink-0 text-[11px] text-muted md:block">
                            {r.sentBy}
                          </span>
                          <span className={`figures shrink-0 text-[11.5px] ${ageTone(r.age)}`}>
                            {ageWords(r.age)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {note && (
                <p className="mt-3 rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] leading-relaxed text-accent-dark">
                  {note}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-line/70 px-5 py-3.5">
              <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
                {signer?.email
                  ? /* Said before it goes, not after. An agent pressing this
                       expects DocuSign to fire again, and it cannot. */
                    `A short note to ${signer.email} pointing at the DocuSign email already in their inbox — REX can't re-fire the original.`
                  : chosen
                    ? "No email address on that signer, so there's nowhere to send a chase."
                    : "Pick who to chase."}
              </p>
              <button
                type="button"
                onClick={remind}
                disabled={!signer?.email}
                className={`shrink-0 rounded-full px-5 py-2.5 text-[12.5px] font-semibold ${
                  signer?.email ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                }`}
              >
                Send reminder
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
