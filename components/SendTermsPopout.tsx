"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import EnvelopeSend from "@/components/EnvelopeSend";
import type { TermsTemplate } from "@/lib/use-listing-terms";

/**
 * Sending the terms of business.
 *
 * Opened on purpose from Documents rather than sitting on the screen — by the
 * time a property is in Listings this has already happened, and a permanent
 * box about it is a permanent question nobody has.
 *
 * Two decisions and no more: which terms, and a look at who signs. The
 * landlord's address is filled in from the record because it is already known,
 * and retyping a known address is how the wrong one gets sent.
 *
 * There is no CC field — see the note where it would have gone.
 *
 * The envelope at the end is deliberate: a tick says DONE, and this needs to
 * say GONE. See EnvelopeSend.
 */

export default function SendTermsPopout({
  open,
  onClose,
  onSent,
  templates,
  listingId,
  contactId,
  landlordName,
  landlordEmail,
  address,
  recordRef,
}: {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  templates: TermsTemplate[];
  listingId: string | number;
  /** The REX contact who signs. Without one we can show but not send. */
  contactId?: string | number | null;
  landlordName?: string;
  landlordEmail?: string;
  address?: string;
  recordRef?: string;
}) {
  const [pick, setPick] = useState<number | null>(null);
  const [stage, setStage] = useState<"compose" | "going" | "gone">("compose");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStage("compose");
    setNote(null);
    // One template is the common case, so don't make anybody choose it.
    setPick(templates.length === 1 ? templates[0].id : null);
  }, [open, templates]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stage !== "going" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, stage]);

  async function send() {
    if (!pick || !contactId) return;
    setStage("going");
    setNote(null);
    try {
      const res = await fetch("/api/esign/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId,
          contactId,
          templateId: pick,
          ref: recordRef ?? "",
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        // A locked environment is the EXPECTED answer today, not a failure —
        // say what it is and what unlocks it rather than "Send failed".
        setStage("compose");
        setNote(j.error ?? "That didn't send.");
        return;
      }
      /* Held so the envelope can finish leaving. The animation is 1.6s and
         the request is usually quicker; cutting it off mid-flight is worse
         than no animation at all. */
      setTimeout(() => {
        setStage("gone");
        onSent();
      }, 1650);
    } catch {
      setStage("compose");
      setNote("That didn't send.");
    }
  }

  if (!open || typeof document === "undefined") return null;

  const chosen = templates.find((t) => t.id === pick) ?? null;
  const blocked = !pick || !contactId;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-sm">
      <div className="popout-in w-full max-w-lg overflow-hidden rounded-3xl border border-line bg-page shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line/70 px-5 py-3.5">
          <DoodleIcon name="file-contract" size={16} className="text-accent-dark" />
          <div className="min-w-0">
            <h3 className="text-[15px]">Send the terms</h3>
            <p className="truncate text-[11.5px] text-muted">
              {address || "This property"}
              {landlordName ? ` · ${landlordName}` : ""}
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

        {stage === "gone" ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="text-accent-dark">
              <EnvelopeSend size={92} />
            </span>
            <p className="hand mt-2 text-[21px]">On its way to {landlordName || "them"}</p>
            <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-muted">
              {chosen?.name ?? "The terms"} went out for signature. It lands on the REX record the
              moment it comes back signed, and shows here as Waiting until then.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full bg-ink px-6 py-2.5 text-[12.5px] font-semibold text-page"
            >
              Done
            </button>
          </div>
        ) : stage === "going" ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="text-accent-dark">
              <EnvelopeSend size={92} />
            </span>
            <p className="hand mt-2 text-[21px]">Sending…</p>
          </div>
        ) : (
          <>
            <div className="space-y-4 px-5 py-5">
              {/* ── Which terms ── */}
              <div>
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Which terms
                </p>
                <div className="space-y-1.5">
                  {templates.map((t) => {
                    const on = pick === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPick(t.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                          on ? "border-ink bg-card" : "border-line/70 hover:border-ink/40"
                        }`}
                      >
                        <span
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors ${
                            on ? "border-accent-dark" : "border-line"
                          }`}
                        >
                          {/* Pops rather than appears — the same grammar as
                              the Available toggle on Listings. */}
                          {on && <span className="avail-dot h-2 w-2 rounded-full bg-accent-dark" />}
                        </span>
                        <span className="min-w-0 text-[12.5px]">{t.name}</span>
                      </button>
                    );
                  })}
                  {templates.length === 0 && (
                    <p className="text-[11.5px] text-muted">
                      No terms templates came back from REX.
                    </p>
                  )}
                </div>
              </div>

              {/* ── Who signs ── */}
              <div>
                <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                  Signing
                </p>
                <div className="flex items-center gap-2.5 rounded-xl border border-line/70 bg-card px-3.5 py-3">
                  <DoodleIcon name="user" size={14} className="text-muted" />
                  <span className="min-w-0 truncate text-[12.5px]">
                    {landlordName || "The landlord"}
                    {landlordEmail && <span className="text-muted"> · {landlordEmail}</span>}
                  </span>
                </div>
                {!contactId && (
                  <p className="mt-1.5 text-[11px] text-accent-dark">
                    No REX contact on this record — the landlord has to exist in REX to be a
                    signer.
                  </p>
                )}
              </div>

              {/* NO CC FIELD, on purpose. Measured 14 Aug 2026: all three TLE
                  templates (4824, 5930, 5962) declare exactly two DocuSign
                  roles — Agent (user) and Landlord (contact). There is no CC
                  role, so a copied-in address cannot ride the envelope. A
                  field that quietly did nothing, or that sent a different
                  email dressed as a copy, is worse than not offering it.
                  Adding a CC role to the templates in DocuSign is the real
                  fix, and it is outside the OS. */}

              {note && (
                <p className="rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] leading-relaxed text-accent-dark">
                  {note}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-line/70 px-5 py-3.5">
              <p className="min-w-0 truncate text-[11.5px] text-muted">
                {chosen ? chosen.name : "Pick which terms to send"}
              </p>
              <button
                type="button"
                onClick={send}
                disabled={blocked}
                className={`ml-auto flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-[12.5px] font-semibold ${
                  blocked ? "cursor-not-allowed bg-ink/30 text-page/60" : "bg-ink text-page"
                }`}
              >
                <DoodleIcon name="mail" size={14} />
                Send terms
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
