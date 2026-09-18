"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { Sheet, Spinner } from "./bits";

/**
 * SEARCH BY RADIUS (James, 18 Sep 2026): "underneath we should have the same
 * box that says Search by radius ... a bottom sheet ... Find location
 * currently or Type in a postcode, and then you can do a radius search."
 *
 * The box sits under the name search and looks like it; the sheet gives the
 * two ways to say where, and how far. It answers with a point and a label -
 * the page asks /api/m/nearby for the people.
 */

export interface RadiusPick {
  lat: number;
  lng: number;
  label: string;
  miles: number;
}

const MILES = [1, 3, 5, 10];

export function RadiusBox({ picked, onOpen }: { picked: RadiusPick | null; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-2.5 flex h-14 w-full items-center gap-3 rounded-2xl border border-line/80 bg-card px-4 text-left active:bg-panel"
      style={picked ? { borderColor: "var(--accent)" } : undefined}
    >
      <DoodleIcon name="target" size={18} className="text-muted" />
      <span className={`min-w-0 flex-1 truncate text-[16px] ${picked ? "font-semibold" : "text-muted"}`}>
        {picked ? `Within ${picked.miles} ${picked.miles === 1 ? "mile" : "miles"} of ${picked.label}` : "Search by Radius"}
      </span>
      <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 text-muted">
        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function RadiusSheet({ start, onPick, onClose }: { start: RadiusPick | null; onPick: (p: RadiusPick) => void; onClose: () => void }) {
  const [miles, setMiles] = useState(start?.miles ?? 3);
  const [postcode, setPostcode] = useState("");
  const [busy, setBusy] = useState<"here" | "postcode" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const here = () => {
    setError(null);
    if (!("geolocation" in navigator)) return setError("This phone will not share its location. Type a postcode instead.");
    setBusy("here");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        onPick({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "you", miles });
      },
      () => {
        setBusy(null);
        setError("Your location was not shared. Allow it in the phone's settings, or type a postcode.");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 }
    );
  };

  const byPostcode = async () => {
    const pc = postcode.trim();
    if (pc.length < 2) return setError("Type a postcode, or the first half of one.");
    setError(null);
    setBusy("postcode");
    try {
      const r = await fetch(`/api/radar/near?q=${encodeURIComponent(pc)}`, { cache: "no-store" });
      const j = (await r.json()) as { ok?: boolean; label?: string; lat?: number; lon?: number; error?: string };
      if (!j.ok || j.lat == null || j.lon == null) throw new Error(j.error ?? "That postcode was not found.");
      onPick({ lat: j.lat, lng: j.lon, label: j.label ?? pc.toUpperCase(), miles });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That postcode was not found.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet label="Search by Radius" onClose={onClose}>
      <h2 className="text-[21px] leading-tight">Search by Radius</h2>

      <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">How Far</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {MILES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMiles(m)}
            className="h-11 rounded-xl border text-[14.5px] font-semibold"
            style={m === miles ? { background: "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent-dark)" } : { borderColor: "var(--line)" }}
          >
            {m} {m === 1 ? "mile" : "miles"}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={here}
        disabled={busy !== null}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--brown)" }}
      >
        <DoodleIcon name="target" size={18} /> {busy === "here" ? "Finding you…" : "Use My Current Location"}
      </button>

      <p className="my-3 text-center text-[13px] text-muted">or</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void byPostcode();
        }}
        className="flex gap-2"
      >
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          placeholder="Type a postcode"
          autoCapitalize="characters"
          autoComplete="postal-code"
          enterKeyHint="search"
          className="h-14 min-w-0 flex-1 rounded-2xl border border-line/80 bg-card px-4 text-[16px] uppercase outline-none placeholder:normal-case focus:border-accent"
        />
        <button type="submit" disabled={busy !== null} className="h-14 shrink-0 rounded-2xl border border-line/80 bg-card px-5 text-[15px] font-semibold disabled:opacity-60">
          Search
        </button>
      </form>

      {busy === "postcode" && <Spinner label="Finding the postcode" className="mt-3" />}
      {error && <p className="mt-3 text-[13.5px] text-accent-dark">{error}</p>}
    </Sheet>
  );
}
