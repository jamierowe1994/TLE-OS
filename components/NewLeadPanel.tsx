"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { DoneTick, PressButton } from "@/components/Bits";
import { LEAD_SOURCES } from "@/lib/leads-sample";

/**
 * Adding someone, in the same sheet the record opens in — so creating a lead
 * and reading one feel like the same place rather than two different products.
 *
 * Four fields, because four is what you actually have when someone rings:
 * name, address, mobile, source. Everything else is asked later, on the record.
 */

type Draft = { name: string; address: string; mobile: string; source: string };

const EMPTY: Draft = { name: "", address: "", mobile: "", source: "" };

/** What you'd sensibly do next, offered the moment the lead exists. */
const NEXT_ACTIONS = [
  { label: "Schedule a viewing", icon: "calendar" },
  { label: "Send an email", icon: "mail" },
  { label: "Attach a property", icon: "home" },
  { label: "Add a note", icon: "pencil" },
];

export default function NewLeadPanel({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (d: Draft) => void;
}) {
  const [shown, setShown] = useState(false);
  const [d, setD] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    setD(EMPTY);
    setSaved(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const ready = d.name.trim() && d.mobile.trim();
  const set = (k: keyof Draft) => (v: string) => setD((cur) => ({ ...cur, [k]: v }));

  const field =
    "w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-ink";

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] sm:w-[520px] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-5">
          <h2 className="text-[22px]">{saved ? "Added" : "New lead"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-5">
          {saved ? (
            /* ── Confirmed, and immediately useful ── */
            <div className="flex flex-col items-center pt-8 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[20px]">{d.name} is on the board</p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                Saved to Leads{d.source ? ` · ${d.source}` : ""}.
              </p>

              <div className="mt-8 w-full">
                <p className="mb-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                  What next?
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {NEXT_ACTIONS.map((a) => (
                    <PressButton
                      key={a.label}
                      className="flex items-center gap-2.5 rounded-xl border border-line/80 px-3.5 py-3 text-left text-[12.5px] transition-colors hover:border-ink/40"
                    >
                      <DoodleIcon name={a.icon} size={16} className="shrink-0 text-accent-dark" />
                      {a.label}
                    </PressButton>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-5 w-full rounded-xl py-2.5 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink"
                >
                  Done for now
                </button>
              </div>
            </div>
          ) : (
            /* ── The four things you have when someone rings ── */
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Name
                </span>
                <input
                  autoFocus
                  value={d.name}
                  onChange={(e) => set("name")(e.target.value)}
                  placeholder="Sarah Johnson"
                  className={field}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Current address
                </span>
                <div className="relative">
                  <input
                    value={d.address}
                    onChange={(e) => set("address")(e.target.value)}
                    placeholder="Start typing an address…"
                    className={`${field} pr-10`}
                  />
                  <DoodleIcon
                    name="home"
                    size={15}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
                  />
                </div>
                {/* Named rather than faked: a lookup needs an address API
                    (Ideal Postcodes / getAddress.io), which is a real key and
                    a real cost, so it's a decision not a detail. */}
                <span className="mt-1.5 block text-[10.5px] text-muted">
                  Address lookup + geocoding to be wired — needs a postcode API key.
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Mobile
                </span>
                <input
                  value={d.mobile}
                  onChange={(e) => set("mobile")(e.target.value)}
                  placeholder="07712 345 678"
                  inputMode="tel"
                  className={field}
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Source
                </span>
                <select
                  value={d.source}
                  onChange={(e) => set("source")(e.target.value)}
                  className={field}
                >
                  <option value="">How did they find us?</option>
                  {LEAD_SOURCES.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <PressButton
                onClick={() => {
                  if (!ready) return;
                  onCreated?.(d);
                  setSaved(true);
                }}
                className={`mt-2 w-full rounded-xl py-3 text-[13.5px] font-semibold transition-opacity ${
                  ready ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                }`}
              >
                Add lead
              </PressButton>
              {!ready && (
                <p className="text-center text-[11px] text-muted">
                  A name and a mobile is enough to start.
                </p>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
