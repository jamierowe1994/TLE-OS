"use client";

import { useEffect, useState } from "react";

/**
 * The firm's logo, read off their website (lib/contractor-logo), or their
 * initials when there is none or it will not load (James, 21 Oct 2026).
 * The logo sits on white in a fine frame, so a transparent PNG made for a
 * dark header still shows.
 */
export default function ContractorMark({ name, logoUrl, size = 40, className = "" }: { name: string; logoUrl?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logoUrl]);
  const radius = size >= 56 ? "rounded-2xl" : "rounded-xl";
  const box = { width: size, height: size };
  if (logoUrl && !broken) {
    return (
      <span style={box} className={`flex shrink-0 items-center justify-center overflow-hidden border border-line/60 bg-white ${radius} ${className}`}>
        {/* A third party's picture: no referrer, and no Next image loader for a host we do not know. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-contain p-[12%]" />
      </span>
    );
  }
  return (
    <span aria-hidden style={{ ...box, fontSize: Math.round(size * 0.36) }} className={`flex shrink-0 items-center justify-center bg-accent-soft font-semibold text-accent-dark ${radius} ${className}`}>
      {initials(name)}
    </span>
  );
}

/** "JD Plumbing & Heating Ltd" is JP; a one-word name gives its first two letters. */
export function initials(name: string): string {
  const words = (name || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(ltd|limited|llp|plc|and|the|of|co|uk)$/i.test(w));
  if (!words.length) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}
