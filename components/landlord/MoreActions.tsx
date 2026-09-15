"use client";

import { useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PresentTile from "@/components/landlord/PresentTile";
import SignTile from "@/components/landlord/SignTile";
import MessageTile from "@/components/landlord/MessageTile";
import { signSource } from "@/components/landlord/StepAction";
import type { LandlordView, ViewStep } from "@/lib/landlord-view";

/**
 * THE OTHER THINGS THEY COULD DO, behind one button. Phone only.
 *
 * James, 15 Sep 2026: "rather than having Upload your compliance document and
 * Send a message to your agent, I'd rather just have one button saying See
 * more actions ... I don't want to do another bottom sheet because there's
 * already a load of them, so if you can think of a different way of doing it
 * than a bottom sheet, that would be great."
 *
 * So it OPENS IN PLACE. The list unfolds under the button, pushing the page
 * down, and folds away again - no overlay, no dark, nothing to dismiss, and
 * the next step stays on screen the whole time. Three sheets on one page all
 * behaving slightly differently is how an app starts feeling like a filing
 * cabinet; a disclosure is the plainest control there is and it costs the
 * page nothing when it is shut.
 *
 * The "Also:" line it replaces was a run of underlined links wrapping onto
 * three rows under the one thing we actually wanted them to do.
 */
export default function MoreActions({ v, others }: { v: LandlordView; others: ViewStep[] }) {
  const [open, setOpen] = useState(false);
  if (!others.length) return null;

  return (
    <div className="mt-4 sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 text-[12.5px] font-semibold text-muted"
      >
        {open ? "Fewer actions" : `See more actions`}
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 280ms" }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* A grid row from 0fr to 1fr: the modern way to animate to a height
          nobody has measured, with no JavaScript and no magic number that
          clips the fourth item the day somebody adds one. */}
      <div
        className="grid"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 320ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="overflow-hidden">
          <ul className="mt-3 divide-y divide-line/40 rounded-2xl bg-white/70 px-3" aria-hidden={!open}>
            {others.map((s) => (
              <li key={s.id} className="py-1">
                <Row s={s} v={v} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** One action, doing the real thing behind it rather than linking at it. */
function Row({ s, v }: { s: ViewStep; v: LandlordView }) {
  const shell = "flex w-full items-center gap-3 py-2.5 text-left";
  const icon = (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line/60 text-muted">
      <DoodleIcon name={s.icon} size={15} />
    </span>
  );
  const label = (
    <span className="min-w-0 flex-1">
      <span className="block text-[13.5px] font-semibold leading-tight">{s.label}</span>
      <span className="block text-[11.5px] leading-snug text-muted">{s.sub}</span>
    </span>
  );

  if (s.action === "presentation" && v.presentation) {
    return <PresentTile variant="row" deck={v.presentation} sign={signSource(v)} label={s.label} sub={s.sub} icon={s.icon} />;
  }
  if (s.action === "sign" && (v.appraisalId || s.href)) {
    return <SignTile variant="row" appraisalId={v.appraisalId ?? null} url={v.appraisalId ? null : s.href} label={s.label} sub={s.sub} icon={s.icon} />;
  }
  if (s.action === "message") {
    return <MessageTile variant="row" appraisalId={v.appraisalId ?? null} agentName={v.agent?.name ?? null} messages={v.messages ?? []} label={s.label} sub={s.sub} icon={s.icon} />;
  }
  if (!s.href) {
    return (
      <div className={`${shell} opacity-55`}>
        {icon}
        {label}
      </div>
    );
  }
  return s.external ? (
    <a href={s.href} target="_blank" rel="noreferrer" className={shell}>
      {icon}
      {label}
      <span aria-hidden className="text-[15px] text-muted">›</span>
    </a>
  ) : (
    <Link href={s.href} className={shell}>
      {icon}
      {label}
      <span aria-hidden className="text-[15px] text-muted">›</span>
    </Link>
  );
}
