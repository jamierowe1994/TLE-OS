"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * THE AGENT, ON A BUTTON BOTTOM RIGHT. Phone only.
 *
 * The landlord portal's agent sheet (components/landlord/AgentSheet), for a
 * tenant (James, 18 Sep 2026: "replicate one for one"). Their home is the
 * first thing on the page and their agent is one thumb away: a pill bottom
 * right that raises a sheet with the three things you do with an agent on a
 * phone - call, message, WhatsApp. Anything we cannot offer is not shown.
 */
export const OPEN_AGENT = "tle-open-agent";

/** A button that raises the agent sheet from anywhere on the page. */
export function OpenAgentButton({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_AGENT))}>
      {children}
    </button>
  );
}

export type SheetAgent = { name: string; email: string | null; phone: string | null; photo: string | null };

export default function AgentSheet({ agent, messagesHref }: { agent: SheetAgent | null; messagesHref: string }) {
  const [open, setOpen] = useState(false);

  /* Anything on the page can raise it - the next step's "Contact your agent"
     does (OpenAgentButton) - without the two sharing state. */
  useEffect(() => {
    const raise = () => setOpen(true);
    window.addEventListener(OPEN_AGENT, raise);
    return () => window.removeEventListener(OPEN_AGENT, raise);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [open]);

  /* The sheet is drawn on document.body, like components/tenant/Sheet: a
     fixed element under an animated card is fixed to the card, not the
     screen. The button stays in the page, so it moves with it when the menu
     slides the page aside. */
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!agent) return null;
  const first = agent.name.split(/\s+/)[0] || "your agent";
  const tel = (agent.phone ?? "").replace(/\s+/g, "");
  const wa = tel.replace(/^0/, "44");
  const action = "flex w-full items-center justify-center gap-2.5 rounded-full px-4 py-3.5 text-[14px] font-semibold";

  const avatar = (size: number, text: string) =>
    agent.photo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={agent.photo} alt="" className="rounded-full object-cover" style={{ height: size, width: size }} />
    ) : (
      <span className={`flex items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-dark ${text}`} style={{ height: size, width: size }}>
        {agent.name[0]}
      </span>
    );

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Your agent, ${agent.name}`}
        className="fixed bottom-5 right-4 z-[54] flex items-center gap-2 rounded-full border border-line/60 bg-white py-1.5 pl-1.5 pr-4 shadow-[0_14px_34px_-12px_rgba(40,25,20,0.5)]"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {avatar(38, "text-[15px]")}
        <span className="text-[12.5px] font-semibold">{first}</span>
      </button>

      {ready && createPortal(
      /* The tenant palette again - see components/tenant/Sheet. */
      <div data-surface="tenant" className="font-sans text-ink sm:hidden">
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[57] bg-[#2b201d]/45 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        aria-hidden
      />

      <div
        className="fixed inset-x-0 bottom-0 z-[58] rounded-t-[26px] bg-white px-5 pt-3"
        style={{
          transform: open ? "translateY(0)" : "translateY(106%)",
          /* Only while open - parked below the fold it would cast a band of
             shadow back over the bottom of the screen (landlord, 15 Sep). */
          boxShadow: open ? "0 -24px 60px -28px rgba(40, 25, 20, 0.55)" : "none",
          transition: "transform 460ms cubic-bezier(0.22, 1, 0.36, 1)",
          paddingBottom: "calc(28px + env(safe-area-inset-bottom))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Your letting agent"
        aria-hidden={!open}
      >
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="mx-auto mb-4 block h-1.5 w-11 rounded-full bg-line" />
        <div className="flex flex-col items-center text-center">
          {avatar(72, "text-[27px]")}
          <p className="mt-3 text-[11.5px] text-muted">Your letting agent</p>
          <p className="text-[19px] font-bold leading-tight">{agent.name}</p>
        </div>
        <div className="mt-5 space-y-2.5">
          {tel && (
            <a href={`tel:${tel}`} className={`${action} bg-accent-dark text-white`}>
              <DoodleIcon name="call" size={16} className="invert" />
              Call {first}
            </a>
          )}
          {agent.email ? (
            <a href={`mailto:${agent.email}`} className={`${action} ${tel ? "border border-line/70 bg-white" : "bg-accent-dark text-white"}`}>
              <DoodleIcon name="message" size={16} className={tel ? "" : "invert"} />
              Message {first}
            </a>
          ) : (
            <Link href={messagesHref} className={`${action} border border-line/70 bg-white`}>
              <DoodleIcon name="message" size={16} />
              Message {first}
            </Link>
          )}
          {tel && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className={`${action} border border-line/70 bg-white`}>
              <DoodleIcon name="message" size={16} />
              WhatsApp {first}
            </a>
          )}
        </div>
      </div>
      </div>,
      document.body
      )}
    </div>
  );
}
