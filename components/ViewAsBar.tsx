"use client";

import { useEffect, useState } from "react";

/**
 * The band across the top that says whose eyes you are looking through.
 *
 * Deliberately loud and deliberately fixed. The failure this exists to prevent
 * is an owner forgetting — reading Kayleigh's dashboard, seeing a figure that
 * looks wrong, and raising it as a bug that only exists because they are not
 * themselves. A subtle badge in a corner does not prevent that; a red band
 * across the whole window does.
 *
 * It also carries the only "stop" control there is, so getting out is never
 * more than one click from wherever you have wandered to.
 */
export default function ViewAsBar() {
  const [as, setAs] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { viewingAs?: boolean; subject?: { name: string; email: string } } | null) => {
        if (j?.viewingAs && j.subject) setAs(j.subject);
      })
      .catch(() => {});
  }, []);

  if (!as) return null;

  return (
    <div className="sticky top-0 z-[200] flex flex-wrap items-center justify-between gap-2 bg-[#7f1d1d] px-4 py-2 text-white">
      <p className="text-[12.5px] leading-snug">
        You are viewing as <span className="font-semibold">{as.name || as.email}</span> — read-only,
        and nothing can be sent or saved.
      </p>
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/admin/view-as", { method: "DELETE" });
          window.location.href = "/admin";
        }}
        className="shrink-0 rounded-lg bg-white/15 px-3 py-1 text-[12px] font-semibold"
      >
        Stop
      </button>
    </div>
  );
}
