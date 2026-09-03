"use client";

import { useState } from "react";

/** The one-tap "yes" from the email's button. Tells the office; no form to fill again. */
export default function BookValuation({ token }: { token: string }) {
  const [state, setState] = useState<"ask" | "busy" | "done" | "error">("ask");
  async function book() {
    setState("busy");
    try {
      const r = await fetch(`/api/r/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ book: true }) });
      const j = await r.json();
      setState(j.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="mt-6 rounded-3xl border border-ink/15 bg-[#fbfbfa] p-6">
      {state === "done" ? (
        <>
          <p className="hand text-[20px]">Booked in principle. Thank you.</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">One of the team will call to agree a time that suits you.</p>
        </>
      ) : (
        <>
          <p className="hand text-[20px]">Book your free valuation</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">Twenty minutes at the property, a figure for it as it is, and what we would do to get it. No obligation.</p>
          {state === "error" && <p className="mt-2 text-[12.5px] text-red-700">That did not go through. Reply to the email instead and we will call you.</p>}
          <button type="button" onClick={book} disabled={state === "busy"} className="mt-4 w-full rounded-full bg-ink px-5 py-3.5 text-[14px] font-semibold text-white disabled:opacity-40">
            {state === "busy" ? "One moment..." : "Yes, book my valuation"}
          </button>
        </>
      )}
    </div>
  );
}
