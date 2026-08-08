"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { DoneTick, PressButton } from "@/components/Bits";
import { CERT_META, CONTRACTORS, type CertKey, type CompProperty } from "@/lib/compliance";

/**
 * The works order: the button on a compliance row actually DOES the job.
 * Pick the trade's firm, pick the week, and the messages go where they
 * should — the contractor gets the order, the tenant gets warned about the
 * visit, the landlord is told it's handled. Nothing here is a note-to-self.
 */

export type OrderTarget = { property: CompProperty; cert: CertKey };

const WEEKS = ["This week", "Next week", "Week after"];

export default function WorksOrderModal({
  target,
  onClose,
  onRaised,
}: {
  target: OrderTarget | null;
  onClose: () => void;
  onRaised: (t: OrderTarget, contractor: string, when: string) => void;
}) {
  const [contractor, setContractor] = useState("");
  const [when, setWhen] = useState(WEEKS[0]);
  const [note, setNote] = useState("");
  const [tellTenant, setTellTenant] = useState(true);
  const [tellLandlord, setTellLandlord] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!target) return;
    const firms = CONTRACTORS[CERT_META[target.cert].trade] ?? [];
    setContractor(firms[0] ?? "");
    setWhen(WEEKS[0]);
    setNote("");
    setTellTenant(true);
    setTellLandlord(true);
    setDone(false);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;

  const meta = CERT_META[target.cert];
  const firms = CONTRACTORS[meta.trade] ?? [];
  const p = target.property;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45"
      />
      <div className="fade-up relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        {done ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <DoneTick />
            <p className="hand mt-5 text-[20px]">Works order raised</p>
            <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-muted">
              {contractor.split(" (")[0]} has the order for {meta.label.toLowerCase()} at{" "}
              {p.name}, {when.toLowerCase()}.
              {tellTenant && p.tenant ? ` ${p.tenant.split(" ")[0]} knows to expect the visit.` : ""}
              {tellLandlord ? ` ${p.landlord.split(" ")[0]} has been told it's in hand.` : ""}
            </p>
            <PressButton
              onClick={() => onRaised(target, contractor, when)}
              className="press-ring mt-6 rounded-full bg-ink px-6 py-2.5 text-[13px] font-semibold text-page"
            >
              Done
            </PressButton>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-line/70 px-6 py-4">
              <h2 className="text-[19px] leading-tight">Book the {meta.trade}</h2>
              <p className="mt-0.5 text-[12px] text-muted">
                {meta.label} · {p.name} · {p.tenant ? `access via ${p.tenant}` : "vacant — keys held"}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Who does it
              </p>
              <div className="space-y-2">
                {firms.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setContractor(f)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      contractor === f ? "border-accent-dark bg-accent-soft/40" : "border-line/60 hover:border-ink/30"
                    }`}
                  >
                    <span
                      className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                        contractor === f ? "border-accent-dark bg-accent-dark text-page" : "border-line"
                      }`}
                    >
                      {contractor === f && "✓"}
                    </span>
                    <span className="hand text-[13px]">{f}</span>
                  </button>
                ))}
              </div>

              <p className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                When
              </p>
              <div className="flex gap-2">
                {WEEKS.map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWhen(w)}
                    className={`hand rounded-full border px-4 py-2 text-[12.5px] transition-colors ${
                      when === w ? "border-accent-dark text-accent-dark" : "border-line/80 hover:border-ink"
                    }`}
                  >
                    {w}
                  </button>
                ))}
              </div>

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything the engineer should know — parking, dogs, a fuse board in a cupboard…"
                className="mt-5 w-full resize-none rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[12.5px] leading-relaxed outline-none transition-colors focus:border-ink"
              />

              {/* Who hears about it — ticked by default, because a visit
                  nobody warned the tenant about is a complaint, not a job. */}
              <div className="mt-4 space-y-2">
                {p.tenant && (
                  <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={tellTenant}
                      onChange={(e) => setTellTenant(e.target.checked)}
                      className="h-4 w-4 accent-[var(--accent-dark)]"
                    />
                    Warn {p.tenant} about the visit
                  </label>
                )}
                <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={tellLandlord}
                    onChange={(e) => setTellLandlord(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent-dark)]"
                  />
                  Tell {p.landlord} it&apos;s in hand
                </label>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
              <p className="text-[10.5px] text-muted">Wireframe — nothing sends yet.</p>
              <PressButton
                onClick={() => contractor && setDone(true)}
                className={`press-ring rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                  contractor ? "bg-accent-dark text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                }`}
              >
                <span className="flex items-center gap-2">
                  <DoodleIcon name="setting" size={14} />
                  Raise the works order
                </span>
              </PressButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
