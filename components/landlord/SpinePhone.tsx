"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Stop } from "@/lib/landlord-journey";

/**
 * THE JOURNEY ON A PHONE: a ring, and the stop they are at.
 *
 * James, 15 Sep 2026: "I think we can show the spine instead of doing it like
 * that ... a circle progress bar instead. On the left-hand side, we can have
 * the progress bar, and then we can show the current stage, and it is also in
 * progress on the right-hand side."
 *
 * This replaces a scrolling wheel of seven stops, and it is the better answer:
 * seven stops is OUR map of the process, and the two things a landlord wants
 * from it are how far along they are and what is happening now. A ring says
 * the first at a glance and the line beside it says the second. The seven are
 * a tap away on the journey page, where there is room to lay them out.
 */

const BLURB: Record<string, string> = {
  valuation: "We visit, look round properly, and agree what your property should let for.",
  instruction: "The terms of business. Nothing is marketed until this is signed by both of us.",
  compliance: "The certificates a let needs by law - gas, electrics, the EPC - gathered and checked.",
  marketing: "Photographs, the description, and your property live on the portals.",
  viewings: "We show people round, tell you what they said, and bring you every offer.",
  let: "An offer accepted, referencing run, and the tenancy drawn up for signing.",
  management: "Your tenant moves in. From here it is rent, repairs, inspections and renewals.",
};

export default function SpinePhone({
  stops,
  href: given,
  blurbs = BLURB,
}: {
  stops: Stop[];
  /** Where a tap goes. The tenant portal passes its own (or null for none);
   *  absent, the landlord's journey page, worked out below. */
  href?: string | null;
  /** The line under the stop, by stop id. The tenant portal passes its own. */
  blurbs?: Record<string, string>;
}) {
  /* Where the seven live. Worked out here rather than passed down: the demo
     and the live portal are the same component with a different base, and a
     page that forgets to pass it would send a landlord to the wrong portal. */
  const path = usePathname() ?? "/landlord";
  const params = useSearchParams();
  const base = path.startsWith("/landlord/demo") ? "/landlord/demo" : "/landlord";
  const keep = new URLSearchParams();
  if (params?.get("stage")) keep.set("stage", params.get("stage")!);
  if (params?.get("from") === "admin") keep.set("from", "admin");
  const q = keep.size ? `?${keep.toString()}` : "";
  /* On the journey page itself there is nowhere to go, so it stops being a
     link rather than pretending to be one. */
  const href = given !== undefined ? given : path.endsWith("/journey") ? null : `${base}/journey${q}`;
  const done = stops.filter((s) => s.state === "done").length;
  /* With every stop done there is no current one, and the ring used to fall
     back to the FIRST - a tenant moved in read "8/8 Offer accepted". The last
     stop is where they are. */
  const cur = stops.findIndex((s) => s.state === "current");
  const at = cur >= 0 ? cur : done === stops.length ? stops.length - 1 : 0;
  const here = stops[at];
  /* Counted in stops FINISHED, not the one they are standing on: a landlord
     whose compliance is under way has not finished compliance, and a ring that
     says otherwise is flattering them with their own money. */
  const pct = Math.round((done / stops.length) * 100);

  const r = 34;
  const c = 2 * Math.PI * r;

  return (
    <Wrap href={href} label={`Your journey: ${here.label}, ${here.sub}`}>
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--line)" strokeOpacity="0.5" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            stroke="var(--accent-dark)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="figures text-[19px]">
            {done}
            <span className="text-[11px] text-muted">/{stops.length}</span>
          </span>
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-bold leading-tight">{here.label}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">{here.sub}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{blurbs[here.id] ?? ""}</p>
      </div>

      {href && (
        <span aria-hidden className="shrink-0 text-[18px] text-muted">
          ›
        </span>
      )}
    </Wrap>
  );
}

function Wrap({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const cls = "flex items-center gap-4 sm:hidden";
  return href ? (
    <Link href={href} className={cls} aria-label={label}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}
