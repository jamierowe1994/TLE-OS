"use client";

import { useEffect } from "react";
import SignSheet from "@/components/landlord/SignSheet";
import type { SigningStep } from "@/lib/signing-steps";

/**
 * The contract, signed WITHOUT leaving The Letting Experts.
 *
 * James, 14 Sep 2026: "it will look a bit shocking for them to get sent to
 * some random site. No one's heard of DocuSeal." And it is not only branding:
 * a landlord who lands on a domain they do not recognise has been handed a
 * good reason to stop and ring the office, and the ones who do NOT stop are
 * the ones who would sign anything.
 *
 * All this is now is the dark behind it and the keys: the sheet itself is
 * SignSheet, shared with the panel that rises under the presentation, because
 * a contract that looks like one thing from the file and another from the
 * deck is two products.
 */
export default function SignModal({
  url,
  appraisalId,
  email,
  steps,
  closeLabel,
  onClose,
  onDone,
}: {
  url: string;
  appraisalId?: string | null;
  email?: string | null;
  /** Whose boxes these are. The agent's five differ from the landlord's. */
  steps?: SigningStep[];
  closeLabel?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#2b201d]/55"
      style={{ animation: "sign-dim 460ms ease-out both" }}
    >
      <style>{"@keyframes sign-dim { from { opacity: 0 } to { opacity: 1 } }"}</style>
      <SignSheet url={url} appraisalId={appraisalId} email={email} steps={steps} closeLabel={closeLabel} onClose={onClose} onDone={onDone} />
    </div>
  );
}
