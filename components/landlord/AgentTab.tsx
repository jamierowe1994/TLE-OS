"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import MessageTile from "@/components/landlord/MessageTile";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * THE AGENT, ON A TAB DOWN THE SIDE. Phone only.
 *
 * James, 15 Sep 2026, reading the portal on his phone: the first thing a
 * landlord should see is THEIR PROPERTY, not their agent's phone number. "Add
 * it on a little tab on the right-hand side of the screen ... a small square
 * that has rounded-off corners, half off, like the little tabs you get on the
 * sides ... if you were to click it, it then folds out really nicely."
 *
 * He is right about the order. The agent card was a 96px block of somebody
 * else's contact details above the fold, on a page whose subject is the
 * landlord's house. It is not less important - it is always one thumb away,
 * down the side, following the screen - it is just not the first thing.
 *
 * ── Three buttons, not a directory ────────────────────────────────────────
 *
 * "Rather than having things like their phone number and stuff, we should just
 * have three buttons." A phone number on a phone is a thing to be pressed, not
 * a thing to be read: Call, Message and WhatsApp do the pressing. The ones
 * that cannot work are not shown - no number, no Call - rather than offered
 * and dead.
 */
export default function AgentTab({ v }: { v: LandlordView }) {
  const [open, setOpen] = useState(false);

  /* The page behind should not scroll under an open panel, and Escape should
     shut it - it covers most of a phone. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!v.agent) return null;
  const first = v.agent.name.split(/\s+/)[0] || "your agent";
  const tel = (v.agent.phone ?? "").replace(/\s+/g, "");
  /* 07… to 447… for wa.me, which will not take a national number. */
  const wa = tel.replace(/^0/, "44");

  const PANEL = 250;
  const action =
    "flex w-full items-center justify-center gap-2.5 rounded-full px-4 py-3 text-[13.5px] font-semibold";

  return (
    <div className="sm:hidden">
      {/* The dark, so a tap anywhere else shuts it. */}
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[55] bg-[#2b201d]/35 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        aria-hidden
      />

      <div className="fixed right-0 top-1/2 z-[56] -translate-y-1/2">
        <div
          className="flex items-stretch"
          style={{
            /* Closed, the row is pushed right so only a sliver of the handle
               is on screen - the tab half off the edge James asked for. */
            transform: open ? "translateX(0)" : `translateX(${PANEL + 22}px)`,
            transition: "transform 460ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Hide your agent" : `Your agent, ${v.agent.name}`}
            className="flex w-[46px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-l-2xl border border-r-0 border-line/60 bg-white py-5 shadow-[-8px_0_24px_-14px_rgba(40,25,20,0.5)]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              style={{ transform: open ? "rotate(180deg)" : undefined }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
            </svg>
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted [writing-mode:vertical-rl]">
              Your agent
            </span>
          </button>

          <div
            className="shrink-0 rounded-l-[4px] border-y border-l border-line/60 bg-white px-4 py-5"
            style={{ width: PANEL }}
            aria-hidden={!open}
          >
            <div className="flex flex-col items-center text-center">
              {v.agent.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.agent.photo} alt="" className="h-[68px] w-[68px] rounded-full object-cover" />
              ) : (
                <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-accent-soft text-[26px] font-semibold text-accent-dark">
                  {v.agent.name[0]}
                </span>
              )}
              <p className="mt-3 text-[11px] text-muted">Your letting agent</p>
              <p className="text-[17px] font-bold leading-tight">{v.agent.name}</p>
            </div>

            <div className="mt-4 space-y-2">
              {tel && (
                <a href={`tel:${tel}`} className={`${action} bg-accent-dark text-white`}>
                  <DoodleIcon name="call" size={15} />
                  Call {first}
                </a>
              )}
              <MessageTile
                variant="button"
                appraisalId={v.appraisalId ?? null}
                agentName={v.agent.name}
                messages={v.messages ?? []}
                label={`Message ${first}`}
                sub=""
                icon="message"
                className={`${action} border border-line/70 bg-white`}
              />
              {tel && (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`${action} border border-line/70 bg-white`}
                >
                  <DoodleIcon name="message" size={15} />
                  WhatsApp {first}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
