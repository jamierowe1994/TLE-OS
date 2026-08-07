"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { DoneTick, PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";

/**
 * Getting something signed.
 *
 * Prepared and linked, NOT wired — deliberately. Everything up to the point of
 * pressing send is real work that belongs in TLE OS: which document, who signs
 * it, in what order, and what gets merged into it. The send itself is one API
 * call to DocuSign that needs an account, an integration key and consent, so
 * the screen stops honestly at the edge rather than faking a signature.
 *
 * The order matters more than it looks. A guarantor who signs before the
 * tenant has agreed the terms is guaranteeing something that changed, which is
 * why signers are ordered and the order is editable.
 */

export type Signer = { id: string; name: string; email: string; role: string };

export default function SignaturePanel({
  open,
  onClose,
  document: docName,
  merges,
  signers: initial,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  document: string;
  /** What gets merged into the template — shown so it can be checked BEFORE it goes. */
  merges: { label: string; value: string }[];
  signers: Signer[];
  onSent: () => void;
}) {
  const [signers, setSigners] = useState<Signer[]>(initial);
  const [stage, setStage] = useState<"setup" | "sent">("setup");

  // Seeded when the panel OPENS, not whenever the prop identity changes: the
  // caller builds this array inline, so depending on it would throw away a
  // half-typed guarantor every time the parent happened to re-render.
  const seed = useRef(initial);
  seed.current = initial;
  useEffect(() => {
    if (!open) return;
    setSigners(seed.current);
    setStage("setup");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function move(i: number, delta: number) {
    setSigners((s) => {
      const j = i + delta;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45"
      />

      <div className="fade-up relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">
              {stage === "sent" ? "Out for signature" : "Prepare for signature"}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">{docName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {stage === "sent" ? (
            <div className="flex flex-col items-center py-6 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[20px]">Envelope prepared</p>
              <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted">
                {docName} is ready for {signers.length} signer
                {signers.length === 1 ? "" : "s"}, in the order you set.
              </p>

              <ul className="mt-5 w-full max-w-sm space-y-2 text-left">
                {signers.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 rounded-xl border border-line/70 p-3"
                  >
                    <span className="figures flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-dark">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px]">{s.name}</span>
                      <span className="block truncate text-[10.5px] text-muted">{s.email}</span>
                    </span>
                    <Pill tone={i === 0 ? "accent" : "neutral"}>
                      {i === 0 ? "Signs first" : "Waiting"}
                    </Pill>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                disabled
                title="Needs a DocuSign account, integration key and admin consent"
                className="mt-6 flex cursor-not-allowed items-center gap-2 rounded-full border border-line px-5 py-2.5 text-[12.5px] font-semibold text-muted opacity-60"
              >
                <DoodleIcon name="link" size={14} />
                Open in DocuSign
              </button>
              <p className="mt-2.5 max-w-sm text-[10.5px] leading-relaxed text-muted">
                Not connected yet. Everything above is the envelope TLE OS will POST to
                <span className="figures"> /v2.1/accounts/&#123;id&#125;/envelopes</span> once the
                integration key and admin consent are in place — the account, the template and the
                consent are the only things missing.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-line/80 p-5">
                <h3 className="mb-3.5 flex items-center gap-2.5 text-[14px]">
                  <DoodleIcon name="doc" size={17} className="text-accent-dark" />
                  What goes in it
                </h3>
                <dl className="space-y-2 text-[12.5px]">
                  {merges.map((m) => (
                    <div key={m.label} className="flex justify-between gap-4 border-b border-line/40 pb-2 last:border-0 last:pb-0">
                      <dt className="text-muted">{m.label}</dt>
                      <dd className="text-right">{m.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3.5 border-t border-line/60 pt-3 text-[10.5px] leading-relaxed text-muted">
                  Merged from the record, not retyped. Anything wrong here is wrong on the record —
                  fix it there and it fixes both.
                </p>
              </section>

              <section className="mt-4 rounded-2xl border border-line/80 p-5">
                <div className="mb-3.5 flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2.5 text-[14px]">
                    <DoodleIcon name="user" size={17} className="text-accent-dark" />
                    Who signs, in order
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setSigners((s) => [
                        ...s,
                        { id: `s${s.length + 1}${Date.now()}`, name: "", email: "", role: "Guarantor" },
                      ])
                    }
                    className="text-[11.5px] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    + Add signer
                  </button>
                </div>

                <ul className="space-y-2.5">
                  {signers.map((s, i) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line/60 p-2.5">
                      <span className="figures flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-dark">
                        {i + 1}
                      </span>
                      <span className="flex min-w-[180px] flex-1 flex-col gap-1">
                        <input
                          value={s.name}
                          placeholder="Full name"
                          onChange={(e) =>
                            setSigners((cur) =>
                              cur.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x))
                            )
                          }
                          className="w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none focus:border-ink"
                        />
                        <input
                          value={s.email}
                          placeholder="Email"
                          onChange={(e) =>
                            setSigners((cur) =>
                              cur.map((x) => (x.id === s.id ? { ...x, email: e.target.value } : x))
                            )
                          }
                          className="w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-1.5 text-[12px] text-muted outline-none focus:border-ink focus:text-ink"
                        />
                      </span>
                      <span className="shrink-0 text-[11px] text-muted">{s.role}</span>
                      <span className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-line/70 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={i === signers.length - 1}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-line/70 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => setSigners((cur) => cur.filter((x) => x.id !== s.id))}
                          disabled={signers.length === 1}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-line/70 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-30"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
          {stage === "setup" ? (
            <>
              <p className="text-[11.5px] text-muted">
                Nothing sends until DocuSign is connected.
              </p>
              <PressButton
                onClick={() => {
                  setStage("sent");
                  onSent();
                }}
                className="shrink-0 rounded-full bg-ink px-6 py-2.5 text-[13px] font-semibold text-page"
              >
                <span className="flex items-center gap-2">
                  <DoodleIcon name="file-contract" size={15} />
                  Prepare envelope
                </span>
              </PressButton>
            </>
          ) : (
            <>
              <span />
              <PressButton
                onClick={onClose}
                className="rounded-full bg-ink px-6 py-2.5 text-[13px] font-semibold text-page"
              >
                Done
              </PressButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
