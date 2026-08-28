"use client";

import { useEffect, useState } from "react";

/**
 * A different person every time you open the sign-in page.
 *
 * ── Why the list is written out rather than read from the folder ──────────
 *
 * A directory listing would need a server round-trip on the one page that
 * should render instantly, and it would happily serve whatever somebody drops
 * in there later. Named here, the set is reviewable in a diff — which matters,
 * because the whole point is that these are PEOPLE. The collection also
 * contains dartboards, empty boxes and QR codes, and "Incorrect Password"
 * greeting somebody at sign-in would be a joke that lands once.
 *
 * Downbeat ones are left out too. Bad Day, Anxiety, Headache, Running Late and
 * Lost The Way are all in the set, and none of them is what an agent should
 * meet at 8am on a Monday.
 *
 * ── Why it is picked on the client ────────────────────────────────────────
 *
 * Picking during render on the server would make the page non-static and hand
 * everybody whatever the last build cached. Picked after mount, each visit is
 * genuinely its own — and a refresh really does change it, which is what was
 * asked for.
 *
 * The first paint has no illustration rather than a placeholder that swaps.
 * A silhouette that flicks to a different drawing is more noticeable than
 * empty space that fills.
 */

const PEOPLE = [
  "agreement-deal", "architect", "checking-in", "checking-the-calendar",
  "cheers-and-chats", "co-workers", "collaboration", "group-discussion",
  "handywoman", "happy-call", "high-five", "home-caring", "hop-on-a-call",
  "idea-exchange", "lending-a-hand", "looking-out-the-window", "meeting",
  "moving-day", "planning-board", "productive", "reading-time",
  "real-estate-agent", "signature", "sipping-coffee", "studious-girl",
  "taking-notes", "team-spirit", "walking-together", "welcome",
  "working-in-the-park",
] as const;

export default function SignInArt() {
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    setPick(PEOPLE[Math.floor(Math.random() * PEOPLE.length)]);
  }, []);

  return (
    <div
      aria-hidden
      className="hidden shrink-0 items-center justify-center md:flex md:w-[300px] lg:w-[360px]"
    >
      {pick && (
        /* `.art` is the house convention: monochrome ink that inverts in the
           dark theme, so one file works in both without a second asset.
           Plain <img> because these are static files in /public and next/image
           would buy nothing but a config entry. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/illustrations/people/${pick}.svg`}
          alt=""
          className="art fade-up h-auto w-full max-w-[320px] opacity-95"
        />
      )}
    </div>
  );
}
