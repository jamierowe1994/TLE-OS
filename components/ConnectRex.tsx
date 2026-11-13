"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LineIcon from "@/components/LineIcon";

/**
 * NOTHING TO SHOW BECAUSE THEY ARE NOT CONNECTED TO REX (James, 13 Nov 2026).
 *
 * "When someone signs up and they aren't connected to REX, it shows no
 * listings. If I click on listings or leads, it will say there's nothing in
 * there because they're not connected to REX yet. Then you should offer them
 * a Connect to REX button, which takes them through to the settings section."
 *
 * A board whose route answered `unlinked` (lib/scope) used to say "Ask James
 * to link your account" and stop. Most of the time the person can do it
 * themselves: signing in to REX on Settings > Connections joins the two
 * accounts there and then (app/api/rex/session, lib/users ensureRexLink).
 *
 * Somebody who HAS signed in to REX and is still not matched cannot fix it
 * with the same button, so they are told that instead of being sent round.
 */

export const CONNECT_REX_HREF = "/profile?tab=connections";

/** One line for a page header's subtitle. */
export const NOT_CONNECTED = "You're not connected to REX yet.";

export default function ConnectRex({
  what,
  look = true,
  center = false,
}: {
  /** What the board holds, as it reads mid-sentence: "listings", "leads". */
  what: string;
  /** The new look (nl- classes) or the older screens. */
  look?: boolean;
  center?: boolean;
}) {
  /* null while it is asked: the button shows meanwhile, since nearly everyone
     who lands here has not signed in to REX. */
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/rex/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { connected?: boolean }) => { if (live) setConnected(Boolean(j.connected)); })
      .catch(() => { if (live) setConnected(false); });
    return () => {
      live = false;
    };
  }, []);

  const title = connected ? "We Can't Match Your REX Sign-In Yet" : "You're Not Connected to REX Yet";
  const body = connected
    ? `You're signed in to REX, but we can't tell which ${what} are yours from it. Ask James to link your account.`
    : `Your ${what} come from REX. Connect your REX sign-in and they will show here.`;

  if (look) {
    return (
      <div className={`py-10 ${center ? "text-center" : ""}`} role="status" data-connect-rex>
        <p className="nl-block-title">{title}</p>
        <p className={`nl-meta mt-1.5 max-w-md ${center ? "mx-auto" : ""}`}>{body}</p>
        {!connected && (
          <Link href={CONNECT_REX_HREF} className="nl-btn nl-btn--primary nl-btn--sm mt-4 inline-flex items-center gap-2">
            <LineIcon name="key" size={15} />
            Connect to REX
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className={`py-8 ${center ? "text-center" : ""}`} role="status" data-connect-rex>
      <p className="text-[14px] text-ink">{title}</p>
      <p className={`mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted ${center ? "mx-auto" : ""}`}>{body}</p>
      {!connected && (
        <Link href={CONNECT_REX_HREF} className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-[12px] font-semibold text-white">
          <LineIcon name="key" size={15} />
          Connect to REX
        </Link>
      )}
    </div>
  );
}
