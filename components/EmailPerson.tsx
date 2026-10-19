"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Compose from "@/components/Compose";

/**
 * EMAIL SOMEBODY FROM THE OS, NOT FROM A MAIL APP (Sean McMahon, 16 Oct 2026).
 *
 * "I cannot email landlords of tenants via the tle-os system." His recording
 * shows him on a repair at 36 Carnoustie Crescent pressing the landlord's
 * email address, and nothing happening. Every Email button on a person was a
 * mailto: link, which hands the address to whatever mail app the computer
 * calls its own. On a Mac whose Mail was never set up - the office lives in
 * Outlook on the web - that is nothing at all, with no message to say so.
 *
 * So pressing Email opens the OS's own email window (components/Compose):
 * templates, a preview, and Send, which goes from the agent's own Outlook
 * where it is connected (lib/send-as-agent) and is filed on the person's
 * Activity. It answers to "Email to landlords and tenants" on Admin, Switches
 * like every other email to a customer, and says so on the button while that
 * is off.
 *
 * Opened in a portal on <body>: these buttons sit inside drawers and the
 * property page's boxes, which move on hover, and a fixed window inside a
 * moved box is drawn inside the box.
 */
export default function EmailPerson({
  email,
  name,
  role,
  address,
  className,
  children,
  onSent,
}: {
  email: string;
  name?: string | null;
  /** "landlord" or "tenant" picks the templates offered. */
  role?: string | null;
  /** The home it is about, for {{address}}. */
  address?: string | null;
  className?: string;
  children: React.ReactNode;
  onSent?: (subject: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* {{agent}} is whoever is writing it, read when the window opens. */
  useEffect(() => {
    if (!open || agent) return;
    let live = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live) setAgent(String(j?.actor?.name ?? j?.user?.name ?? "")); })
      .catch(() => { /* {{agent}} is then named as unfilled, and typed over */ });
    return () => { live = false; };
  }, [open, agent]);

  const full = (name ?? "").trim();
  const audience = role === "landlord" ? "landlord" : role === "tenant" ? "tenant" : "any";
  const merge = useMemo(() => ({
    name: full || undefined,
    firstName: full ? full.split(/\s+/)[0] : undefined,
    address: address || undefined,
    agent: agent || undefined,
  }), [full, address, agent]);

  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} className={className} title={`Email ${full || email}`}>
        {children}
      </button>
      {/* React carries a portal's clicks up to the drawer it was opened
          from, whose backdrop would close too; they stop here. */}
      {mounted && open && createPortal(
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <Compose
          open
          to={email}
          audience={audience}
          onClose={() => setOpen(false)}
          onSent={onSent}
          merge={merge}
        />
        </div>,
        document.body
      )}
    </>
  );
}
