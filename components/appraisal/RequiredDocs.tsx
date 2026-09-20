"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { useCaseState } from "@/lib/case-state";
import { EXTRA_DOC_KINDS, type ExtraDocKind, type RequiredDocsCase } from "@/lib/landlord-doc-kinds";
import { isHmoType, isScottish } from "@/lib/property-flags";

/**
 * WHAT THIS PROPERTY NEEDS, on the appraisal (Susan, 19 Sep 2026).
 *
 * Every let asks the landlord for photo ID, proof of ownership, gas, EICR and
 * EPC. An HMO or a Scottish property needs more, and the agent is the one who
 * knows - so they tick it here, from the full list, and the landlord's portal
 * asks for exactly those (lib/landlord-home-view requiredDocsFor). It can be
 * changed at any stage; a tick added later simply appears on their list.
 */

const GROUPS = ["HMO", "Scotland", "Any property"] as const;

/** What the property itself suggests: Scotland by postcode, HMO by type. */
const SCOTLAND_SET: ExtraDocKind[] = ["legionella", "landlord-reg"];
const HMO_SET: ExtraDocKind[] = ["licence", "fire", "pat", "alarms"];

export default function RequiredDocs({
  appraisalId,
  address,
  postcode,
  propertyType,
}: {
  appraisalId: string;
  address?: string | null;
  postcode?: string | null;
  /** From the property card on the lead - "HMO" is one of its types. */
  propertyType?: string | null;
}) {
  const [value, save, status] = useCaseState<RequiredDocsCase>("required-docs", appraisalId, { extra: [] });
  const [open, setOpen] = useState(false);
  const picked = value.extra ?? [];
  const toggle = (id: ExtraDocKind) => save({ extra: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] });
  const addAll = (ids: ExtraDocKind[]) => save({ extra: [...new Set([...picked, ...ids])] });

  /* What this property suggests. Offered as one press, never ticked for
     them (lib/property-flags). */
  const scottish = isScottish(postcode, address);
  const hmo = isHmoType(propertyType);
  const missingScotland = scottish ? SCOTLAND_SET.filter((k) => !picked.includes(k)) : [];
  const missingHmo = hmo ? HMO_SET.filter((k) => !picked.includes(k)) : [];

  return (
    <section className="fade-up rounded-[22px] border border-line/50 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="hand flex items-center gap-2.5 text-[17px] leading-tight">
            <DoodleIcon name="shield" size={16} className="text-accent-dark" />
            Documents This Property Needs
          </h2>
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            The landlord is always asked for photo ID, proof of ownership, gas, EICR and EPC. Tick anything else this property needs - an HMO,
            a Scottish property - and their portal asks for it too.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-full border border-line/80 px-4 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40"
        >
          {open ? "Done" : picked.length ? "Change" : "Add documents"}
        </button>
      </div>

      {(missingScotland.length > 0 || missingHmo.length > 0) && (
        <div className="mt-3 space-y-2">
          {missingScotland.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-accent-soft/50 px-3.5 py-2.5">
              <span className="text-[12.5px] leading-snug">
                This postcode is in <span className="font-semibold">Scotland</span>, where a legionella assessment and the landlord&rsquo;s registration number are asked for.
              </span>
              <button type="button" onClick={() => addAll(SCOTLAND_SET)} className="ml-auto shrink-0 rounded-full bg-accent-dark px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90">
                Add the Scottish ones
              </button>
            </div>
          )}
          {missingHmo.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-accent-soft/50 px-3.5 py-2.5">
              <span className="text-[12.5px] leading-snug">
                The property type says <span className="font-semibold">HMO</span>, which needs a licence, a fire risk assessment, PAT and the alarm check.
              </span>
              <button type="button" onClick={() => addAll(HMO_SET)} className="ml-auto shrink-0 rounded-full bg-accent-dark px-3.5 py-1.5 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90">
                Add the HMO ones
              </button>
            </div>
          )}
        </div>
      )}

      {!open && (
        <div className="mt-3 flex flex-wrap gap-2">
          {picked.length ? (
            EXTRA_DOC_KINDS.filter((k) => picked.includes(k.id)).map((k) => (
              <span key={k.id} className="rounded-full bg-accent-soft/60 px-3 py-1 text-[11.5px] font-semibold text-accent-dark">
                {k.label}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-muted">Nothing extra asked for.</span>
          )}
        </div>
      )}

      {open && (
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{g}</p>
              <ul className="mt-2 space-y-2">
                {EXTRA_DOC_KINDS.filter((k) => k.group === g).map((k) => (
                  <li key={k.id}>
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line/60 p-2.5 transition-colors hover:border-ink/30">
                      <input
                        type="checkbox"
                        checked={picked.includes(k.id)}
                        onChange={() => toggle(k.id)}
                        disabled={status === "loading"}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-semibold">{k.label}</span>
                        <span className="block text-[11px] leading-snug text-muted">{k.hint}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {(status === "saving" || status === "saved" || status === "offline" || status === "error") && (
        <p className="mt-3 text-[11px] text-muted">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved - the landlord's portal asks for these." : "Couldn't save just now - try again in a moment."}
        </p>
      )}
    </section>
  );
}
