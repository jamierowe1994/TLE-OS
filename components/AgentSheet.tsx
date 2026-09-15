"use client";

import { useEffect } from "react";
import type { PresentAgent } from "@/lib/present";

/**
 * THE AGENT'S CARD, as a sheet that pulls up from the foot.
 *
 * James, 15 Sep 2026: the agent slide on a phone should be the sentence and a
 * button, and the button "will bring up Sam's photo and all of his contact
 * details ... they can message him, and they can do whatever from there". The
 * review box on the slide goes with it - "we can just have 5 stars on it, with
 * his name, the area it covers, and his contact details within".
 *
 * ── Why a sheet and not more slide ────────────────────────────────────────
 *
 * A phone slide has one screenful. Photograph, name, patch, rating, three ways
 * to make contact and a bio is two screenfuls of a twenty-eight page deck, and
 * on the one page whose job is a single idea: this is the person. The sheet
 * holds the detail for whoever wants it and costs the slide nothing.
 *
 * The stars are the DECK'S OWN rating where it carries one. Nothing here
 * invents a score: no rating, no stars.
 */

const STAR = "M12 3.6l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8z";

export default function AgentSheet({
  agent,
  district,
  rating,
  onClose,
}: {
  agent: PresentAgent;
  /** "LN5", from the property's postcode, when there is one. */
  district?: string | null;
  /** Out of five, from the deck's own testimonial. Absent means no stars. */
  rating?: number | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const first = agent.firstName || agent.name || "your agent";
  const tel = (agent.phone || "").replace(/\s+/g, "");
  const wa = tel.replace(/^0/, "44");
  const stars = rating != null ? Math.max(0, Math.min(5, Math.round(rating))) : 0;

  const action =
    "flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-semibold";

  return (
    <div
      className="fixed inset-0 z-[92] flex items-end justify-center"
      style={{ background: "rgba(43, 32, 29, 0.45)", animation: "agent-dim 260ms ease-out both" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`About ${first}`}
    >
      <style>{`
        @keyframes agent-dim { from { opacity: 0 } to { opacity: 1 } }
        @keyframes agent-rise { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) {
          .agent-sheet { animation: none !important }
        }
      `}</style>

      <div
        className="agent-sheet w-full rounded-t-[26px] bg-white px-5 pb-8 pt-3"
        style={{ animation: "agent-rise 380ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The grab handle: what a sheet looks like on a phone. */}
        <span aria-hidden className="mx-auto mb-5 block h-[5px] w-[44px] rounded-full bg-black/12" />

        <div className="flex items-center gap-4">
          {agent.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agent.photo}
              alt={agent.name}
              className="h-[84px] w-[84px] shrink-0 rounded-full object-cover object-[center_15%]"
            />
          ) : (
            <span
              className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-full text-[28px] font-semibold"
              style={{ background: "#f1f4ec", color: "#56634a" }}
            >
              {first.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[21px] font-semibold leading-tight">{agent.name}</p>
            <p className="mt-1 text-[13.5px] text-black/50">
              {agent.title || "Lettings Expert"}
              {district ? ` · covers ${district} and around` : ""}
            </p>
            {stars > 0 && (
              <p className="mt-2 flex items-center gap-1" aria-label={`${stars} out of 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <svg key={i} viewBox="0 0 24 24" aria-hidden className="h-[15px] w-[15px]">
                    <path d={STAR} fill={i < stars ? "#cfa096" : "rgba(0,0,0,0.12)"} />
                  </svg>
                ))}
              </p>
            )}
          </div>
        </div>

        {/* Every way to reach them, on the screen where they asked for it. */}
        <div className="mt-6 flex gap-2.5">
          {agent.phone && (
            <a href={`tel:${tel}`} className={action} style={{ background: "#cfa096", color: "#fff" }}>
              Call
            </a>
          )}
          {agent.phone && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className={action}
              style={{ background: "#f1f4ec", color: "#56634a" }}
            >
              WhatsApp
            </a>
          )}
          {agent.email && (
            <a href={`mailto:${agent.email}`} className={action} style={{ background: "var(--p-tint, #fdefec)", color: "#56423e" }}>
              Email
            </a>
          )}
        </div>

        {(agent.phone || agent.email) && (
          <p className="mt-4 text-center text-[12.5px] text-black/45">
            {[agent.phone, agent.email].filter(Boolean).join("  ·  ")}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 h-[48px] w-full rounded-full border border-black/10 text-[14px] font-semibold text-black/60"
        >
          Close
        </button>
      </div>
    </div>
  );
}
