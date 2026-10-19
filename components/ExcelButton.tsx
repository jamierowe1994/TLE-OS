"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import FindingData from "@/components/business/FindingData";

/**
 * Download as Excel (19 Oct 2026, lib/exports).
 *
 * Sends the ids of the rows the screen has on show and a line saying which
 * filters made them, and saves the spreadsheet that comes back. The server
 * decides what goes in it; this only asks.
 */
export default function ExcelButton({
  href,
  body,
  disabled,
  className = "",
  label = "Download as Excel",
}: {
  href: string;
  /** Read at the moment of the press, so it carries the filters as they are then. */
  body: () => Record<string, unknown>;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body()),
      });
      if (!r.ok || !(r.headers.get("content-type") ?? "").includes("spreadsheet")) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error ?? "The spreadsheet couldn't be made. Try again in a moment.");
      }
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "Export.xlsx";
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The spreadsheet couldn't be made. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={go}
        className={`inline-flex items-center gap-1.5 rounded-full border border-line/80 px-3.5 py-2 text-[12px] text-muted transition-colors hover:border-ink/40 hover:text-ink disabled:opacity-40 ${className}`}
        title="A spreadsheet of what's on screen, with the filters you have set. No emails or phone numbers."
      >
        <DoodleIcon name="grid" size={12} className="text-accent-dark" />
        {busy ? <FindingData label="Preparing" /> : label}
      </button>
      {error && (
        <span role="alert" className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-accent-dark/40 bg-white px-3 py-2 text-[11.5px] text-accent-dark shadow-sm">
          {error}
        </span>
      )}
    </span>
  );
}
