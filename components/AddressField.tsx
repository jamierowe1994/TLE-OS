"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Address entry that geocodes.
 *
 * Typing queries /api/address (which holds the key server-side); picking a
 * suggestion resolves it to a formatted address plus lat/lng. With no provider
 * key configured the field stays a plain text input and says so — an address
 * lookup being unavailable must never stop someone adding a lead.
 */

export type ResolvedAddress = {
  address: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
};

export default function AddressField({
  value,
  onChange,
  onResolved,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolved?: (a: ResolvedAddress) => void;
}) {
  const [suggestions, setSuggestions] = useState<{ id: string; label: string }[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<ResolvedAddress | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Debounced: a lookup per keystroke is a lookup you pay for per keystroke.
  useEffect(() => {
    if (!value.trim() || value.length < 3 || pin?.address === value) return;
    const id = window.setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/address?q=${encodeURIComponent(value)}`, { cache: "no-store" });
        const j = await r.json();
        setConfigured(j.configured);
        setSuggestions(j.suggestions ?? []);
        setOpen((j.suggestions ?? []).length > 0);
      } catch {
        setConfigured(false);
      } finally {
        setBusy(false);
      }
    }, 320);
    return () => window.clearTimeout(id);
  }, [value, pin]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function choose(id: string, label: string) {
    setOpen(false);
    onChange(label);
    setBusy(true);
    try {
      const r = await fetch(`/api/address?resolve=${encodeURIComponent(id)}`, { cache: "no-store" });
      const j = await r.json();
      if (j.address) {
        const resolved: ResolvedAddress = {
          address: j.address,
          postcode: j.postcode ?? null,
          lat: j.lat ?? null,
          lng: j.lng ?? null,
        };
        setPin(resolved);
        onChange(resolved.address);
        onResolved?.(resolved);
      }
    } catch {
      /* keep whatever they typed */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setPin(null);
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder="Start typing an address or postcode…"
          className="w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 pr-10 text-[13.5px] outline-none transition-colors focus:border-ink"
        />
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
          {busy ? (
            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          ) : (
            <DoodleIcon name={pin ? "target" : "home"} size={15} className={pin ? "text-accent-dark" : "text-muted"} />
          )}
        </span>
      </div>

      {open && suggestions.length > 0 && (
        <ul className="fade-up absolute z-20 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-line/80 bg-card py-1 shadow-[0_12px_32px_-12px_rgba(16,16,20,0.25)]">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => choose(s.id, s.label)}
                className="block w-full px-3.5 py-2 text-left text-[12.5px] transition-colors hover:bg-page"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pin && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-accent-dark">
          <DoodleIcon name="target" size={11} />
          Geotagged
          {pin.lat != null && pin.lng != null
            ? ` · ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`
            : " · coordinates unavailable"}
        </p>
      )}

      {configured === false && !pin && (
        <p className="mt-1.5 text-[10.5px] text-muted">
          Typed addresses are saved as-is — add IDEAL_POSTCODES_API_KEY (UK) or
          GOOGLE_MAPS_API_KEY in Railway to switch lookup on.
        </p>
      )}
    </div>
  );
}
