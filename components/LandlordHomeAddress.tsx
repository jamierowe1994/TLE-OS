"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import InlineAddress from "@/components/InlineAddress";
import { CopyButton } from "@/components/Bits";

/**
 * THE LANDLORD'S OWN HOME ADDRESS, as a row (15 Oct 2026, Rhiannon).
 *
 * Sits under the phone and email in ContactBlock, and on the lead's landlord
 * card. Not the let: where they live, for the contract and for post. Saved on
 * the OS record by PUT /api/people/home-address (lib/landlord-home), never to
 * REX. When we have not been told but PayProp or REX already hold one, it is
 * shown with where it came from and one press keeps it.
 *
 * "Same as the let property" is one press for a landlord who lives there.
 */

export type HomeAddress = {
  address: string;
  postcode: string | null;
  source: "agent" | "same-as-property" | "payprop" | "rex" | "new-listing";
  saved: boolean;
  sameAsProperty: boolean;
  updatedAt: string | null;
};

const FROM: Record<string, string> = { payprop: "from PayProp", rex: "from their contact record" };
const pill = "shrink-0 rounded-full border border-line/70 px-2.5 py-1 text-[11.5px] font-semibold transition-colors hover:border-ink/40";

/** Read and save one landlord's home address. Shared by the row and the send screen. */
export function useLandlordHome(p: { email?: string | null; personRef?: string | null; name?: string | null; propertyAddress?: string | null }) {
  const email = (p.email ?? "").trim();
  const ref = (p.personRef ?? "").trim();
  const [home, setHome] = useState<HomeAddress | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">(email || ref ? "loading" : "ready");
  const [note, setNote] = useState<{ tone: "ok" | "bad" | "busy"; text: string } | null>(null);

  useEffect(() => {
    if (!email && !ref) return setState("ready");
    let live = true;
    setState("loading");
    const qs = new URLSearchParams({ email, ref, name: p.name ?? "", property: p.propertyAddress ?? "" });
    fetch(`/api/people/home-address?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; home?: HomeAddress | null }) => {
        if (!live) return;
        setHome(j.home ?? null);
        setState(j.ok ? "ready" : "failed");
      })
      .catch(() => live && setState("failed"));
    return () => {
      live = false;
    };
  }, [email, ref, p.name, p.propertyAddress]);

  const save = useCallback(
    async (address: string, sameAsProperty = false, source?: "payprop" | "rex"): Promise<boolean> => {
      const v = address.trim();
      if (!v || (home?.saved && home.address === v && home.sameAsProperty === sameAsProperty)) return true;
      const before = home;
      setNote({ tone: "busy", text: "Saving…" });
      try {
        const r = await fetch("/api/people/home-address", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, ref, name: p.name ?? "", address: v, sameAsProperty, source }),
        });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; home?: HomeAddress };
        if (!j.ok || !j.home) {
          setHome(before);
          setNote({ tone: "bad", text: j.error ?? "That didn't save." });
          return false;
        }
        setHome(j.home);
        setNote({ tone: "ok", text: "Saved on their record." });
        window.setTimeout(() => setNote((n) => (n?.tone === "ok" ? null : n)), 4000);
        return true;
      } catch {
        setHome(before);
        setNote({ tone: "bad", text: "That didn't go through. Try again." });
        return false;
      }
    },
    [email, ref, p.name, home]
  );

  return { home, state, note, save, canSave: Boolean(email || ref) };
}

export default function LandlordHomeAddress({
  email,
  personRef,
  name,
  propertyAddress,
  className = "",
  readOnly = false,
}: {
  email?: string | null;
  personRef?: string | null;
  name?: string | null;
  /** The let, for "Same as the let property". */
  propertyAddress?: string | null;
  className?: string;
  /** Shown, not changed: a card whose changes are made behind its pencil (24 Oct 2026). */
  readOnly?: boolean;
}) {
  const { home, state, note, save, canSave: canWrite } = useLandlordHome({ email, personRef, name, propertyAddress });
  const canSave = canWrite && !readOnly;
  const value = home?.address ?? "";
  const offered = home && !home.saved;

  return (
    <div className={className}>
      <div className="flex min-h-[42px] flex-wrap items-center gap-x-2.5 gap-y-1 py-2">
        <DoodleIcon name="home" size={14} className="shrink-0 text-muted" />
        <span className="min-w-[11.5rem] flex-1 overflow-hidden text-[13px]">
          {state === "loading" ? (
            <span className="flex items-center gap-1.5 text-muted">
              <span aria-hidden className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Their home address…
            </span>
          ) : canSave ? (
            <InlineAddress value={value} placeholder="+ Add their home address" onChange={(v) => void save(v)} className="text-[13px]" />
          ) : value ? (
            <span className="block truncate">{value}</span>
          ) : (
            <span className="text-muted">No home address on file</span>
          )}
          {/* Said under it, so it is never mistaken for the let's own address. */}
          {state !== "loading" && value && (
            <span className="mt-0.5 block text-[11px] text-muted">
              {home?.sameAsProperty
                ? "Their home address  •  they live at the let property"
                : offered
                  ? `Their home address  •  not saved yet, ${FROM[home!.source] ?? "found on file"}`
                  : "Their home address"}
            </span>
          )}
        </span>
        {state !== "loading" && canSave && offered && (
          <button type="button" className={pill} onClick={() => void save(home!.address, home!.sameAsProperty, home!.source === "payprop" || home!.source === "rex" ? home!.source : undefined)}>
            Keep this
          </button>
        )}
        {state !== "loading" && canSave && !value && propertyAddress && (
          <button type="button" className={pill} onClick={() => void save(propertyAddress, true)}>
            Same as the let property
          </button>
        )}
        {value ? <CopyButton value={value} label="landlord home address" /> : null}
      </div>
      {note && (
        <p className={`mt-0.5 text-[11.5px] leading-snug ${note.tone === "bad" ? "text-accent-dark" : "text-muted"}`}>
          {note.tone === "busy" && <span aria-hidden className="mr-1.5 inline-block h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark align-[-1px]" />}
          {note.text}
        </p>
      )}
    </div>
  );
}

type Paper = { at: string; from: string | null } | null;

/**
 * WHAT WE ALREADY HOLD FOR THIS LANDLORD (Jade Grewal, 14 Oct 2026: "A
 * landlord with multiple properties, will he have to upload ID each time, will
 * it also pull through his bank details?"). Their ID and AML from their other
 * homes, and whether PayProp holds a bank account for them - by its last four
 * digits, never more. Says nothing when there is nothing to say.
 */
export function LandlordOnFile({
  email,
  name,
  propertyAddress,
  appraisalId,
  className = "",
}: {
  email?: string | null;
  name?: string | null;
  propertyAddress?: string | null;
  appraisalId?: string | null;
  className?: string;
}) {
  const [got, setGot] = useState<{ papers: { id: Paper; aml: Paper }; bank: { inPayProp: boolean; onFile: boolean; ending: string | null } | null } | null>(null);
  const [loading, setLoading] = useState(Boolean(email || name));
  useEffect(() => {
    if (!email && !name) return;
    let live = true;
    const qs = new URLSearchParams({ email: email ?? "", name: name ?? "", property: propertyAddress ?? "", appraisal: appraisalId ?? "" });
    fetch(`/api/people/on-file?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && j.ok && setGot({ papers: j.papers, bank: j.bank }))
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [email, name, propertyAddress, appraisalId]);

  if (loading) {
    return (
      <p className={`flex items-center gap-1.5 text-[11.5px] text-muted ${className}`}>
        <span aria-hidden className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
        Checking what we already hold…
      </p>
    );
  }
  const where = (p: NonNullable<Paper>) => (p.from ? `from ${p.from}` : "from another home");
  const lines = [
    got?.papers.id && { icon: "shield", text: `Photo ID on file ${where(got.papers.id)}` },
    got?.papers.aml && { icon: "shield", text: `AML check on file ${where(got.papers.aml)}` },
    got?.bank?.onFile && { icon: "bank", text: `Bank details held by PayProp${got.bank.ending ? `, account ending ${got.bank.ending}` : ""}` },
  ].filter((x): x is { icon: string; text: string } => Boolean(x));
  if (!lines.length) return null;
  return (
    <div className={className}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Already on file</p>
      <ul className="mt-1.5 space-y-1">
        {lines.map((l) => (
          <li key={l.text} className="flex items-center gap-2 text-[12px]">
            <DoodleIcon name={l.icon} size={13} className="shrink-0 text-muted" />
            {l.text}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] leading-snug text-muted">Their portal won&apos;t ask for these again.</p>
    </div>
  );
}
