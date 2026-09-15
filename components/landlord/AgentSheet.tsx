"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import MessageTile from "@/components/landlord/MessageTile";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * THE AGENT, ON A BUTTON BOTTOM RIGHT. Phone only.
 *
 * James, 15 Sep 2026: "rather than being a side tab, it could be added as a
 * right-hand bottom tab where they can click it, and it'll pop out as a bottom
 * sheet offering all of the details for the agent."
 *
 * Better than the side tab it replaces, and for a reason worth writing down:
 * the bottom right of a phone is where a thumb already rests, and a sheet
 * rising from the bottom is the gesture every app on the device uses. The side
 * tab was a desktop idea wearing a phone's clothes - a 46px sliver a thumb has
 * to stretch across the screen to reach, opening sideways into a panel the
 * width of a business card.
 *
 * What has not changed is the point of it: their PROPERTY is the first thing
 * on the page, and their agent is always one thumb away without being the
 * first thing they read.
 *
 * ── Three buttons, not a directory ────────────────────────────────────────
 *
 * "Rather than having things like their phone number and stuff, we should just
 * have three buttons." A phone number on a phone is a thing to be pressed, not
 * read. The ones that cannot work are not shown - no number, no Call - rather
 * than offered and dead.
 */
export default function AgentSheet({ v }: { v: LandlordView }) {
  const [open, setOpen] = useState(false);

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

  if (!v.agent) return null;
  const first = v.agent.name.split(/\s+/)[0] || "your agent";
  const tel = (v.agent.phone ?? "").replace(/\s+/g, "");
  /* 07… to 447… for wa.me, which will not take a national number. */
  const wa = tel.replace(/^0/, "44");

  const action =
    "flex w-full items-center justify-center gap-2.5 rounded-full px-4 py-3.5 text-[14px] font-semibold";

  const avatar = (size: number, text: string) =>
    v.agent!.photo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={v.agent!.photo} alt="" className="rounded-full object-cover" style={{ height: size, width: size }} />
    ) : (
      <span
        className={`flex items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-dark ${text}`}
        style={{ height: size, width: size }}
      >
        {v.agent!.name[0]}
      </span>
    );

  return (
    <div className="sm:hidden">
      {/* THE BUTTON, where the thumb already is. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Your agent, ${v.agent.name}`}
        className="fixed bottom-5 right-4 z-[54] flex items-center gap-2 rounded-full border border-line/60 bg-white py-1.5 pl-1.5 pr-4 shadow-[0_14px_34px_-12px_rgba(40,25,20,0.5)]"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {avatar(38, "text-[15px]")}
        <span className="text-[12.5px] font-semibold">{first}</span>
      </button>

      {/* The dark, so a tap anywhere else shuts it. */}
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-[57] bg-[#2b201d]/45 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        aria-hidden
      />

      {/* THE SHEET, up from the bottom - the gesture every app on the phone
          already uses. */}
      <div
        className="fixed inset-x-0 bottom-0 z-[58] rounded-t-[26px] bg-white px-5 pb-7 pt-3 shadow-[0_-24px_60px_-28px_rgba(40,25,20,0.55)]"
        style={{
          transform: open ? "translateY(0)" : "translateY(106%)",
          transition: "transform 460ms cubic-bezier(0.22, 1, 0.36, 1)",
          paddingBottom: "calc(28px + env(safe-area-inset-bottom))",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Your letting agent"
        aria-hidden={!open}
      >
        {/* The grab bar, which is how a sheet says it can be dismissed. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="mx-auto mb-4 block h-1.5 w-11 rounded-full bg-line"
        />

        <div className="flex flex-col items-center text-center">
          {avatar(72, "text-[27px]")}
          <p className="mt-3 text-[11.5px] text-muted">Your letting agent</p>
          <p className="text-[19px] font-bold leading-tight">{v.agent.name}</p>
        </div>

        <div className="mt-5 space-y-2.5">
          {tel && (
            <a href={`tel:${tel}`} className={`${action} bg-accent-dark text-white`}>
              <DoodleIcon name="call" size={16} />
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
              <DoodleIcon name="message" size={16} />
              WhatsApp {first}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
